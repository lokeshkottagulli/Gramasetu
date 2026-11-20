import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { guide, routeForTrip } from './guide-data.js';
import { readBody } from './http-body.js';
import { createOrder, findOrder, liveConfigured, liveKey, orderPayments, validCheckoutProof, verifySignature } from './razorpay.js';

const mode = 'razorpay-live';
const webhookSecret = process.env.RAZORPAY_LIVE_WEBHOOK_SECRET || '';
const boardingKey = process.env.BOARDING_API_TOKEN || '';
const databasePath = process.env.PAYMENT_DATABASE_PATH || '';
const validityMinutes = Number(process.env.PAYMENT_TICKET_VALIDITY_MINUTES);
export const fares = JSON.parse(process.env.PAYMENT_ROUTE_FARES || '{}');
const knownRoutes = new Set(guide.routes.map(route => route.id));
const fareEntries = Object.entries(fares ?? {});
if (!liveConfigured || webhookSecret.length < 32 || boardingKey.length < 32 ||
    !isAbsolute(databasePath) || !Number.isSafeInteger(validityMinutes) ||
    validityMinutes < 1 || validityMinutes > 10080 || !fareEntries.length ||
    fareEntries.some(([route, fare]) => !knownRoutes.has(route) ||
      !Number.isSafeInteger(fare) || fare < 100 || fare > Math.floor(Number.MAX_SAFE_INTEGER / 20))) {
  throw new Error('Razorpay Live requires live keys, webhook and boarding secrets, an absolute database path, ticket validity, and approved route fares.');
}

const db = new DatabaseSync(databasePath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = FULL;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS fare_orders (
    reference TEXT PRIMARY KEY,
    request_id TEXT NOT NULL UNIQUE,
    access_token TEXT NOT NULL UNIQUE,
    route_id TEXT NOT NULL,
    boarding_stop TEXT,
    destination_stop TEXT,
    passengers INTEGER NOT NULL,
    amount_paise INTEGER NOT NULL,
    created_at INTEGER,
    failed_at INTEGER,
    provider_order TEXT UNIQUE,
    creation_lease INTEGER NOT NULL DEFAULT 0,
    provider_payment TEXT UNIQUE,
    boarding_token TEXT UNIQUE,
    paid_at INTEGER,
    expires_at INTEGER,
    refunded_at INTEGER,
    boarded_at INTEGER
  );
`);
const columns = new Set(db.prepare('PRAGMA table_info(fare_orders)').all().map(column => column.name));
if (!columns.has('created_at')) db.exec('ALTER TABLE fare_orders ADD COLUMN created_at INTEGER');
if (!columns.has('failed_at')) db.exec('ALTER TABLE fare_orders ADD COLUMN failed_at INTEGER');
if (!columns.has('boarding_stop')) db.exec('ALTER TABLE fare_orders ADD COLUMN boarding_stop TEXT');
if (!columns.has('destination_stop')) db.exec('ALTER TABLE fare_orders ADD COLUMN destination_stop TEXT');

const byRequest = db.prepare('SELECT * FROM fare_orders WHERE request_id = ?');
const byToken = db.prepare('SELECT * FROM fare_orders WHERE access_token = ? AND provider_order IS NOT NULL');
const byProvider = db.prepare('SELECT * FROM fare_orders WHERE provider_order = ?');
const randomToken = () => randomBytes(32).toString('base64url');
const boardingAuth = createHash('sha256').update('Bearer ' + boardingKey).digest();
const prefix = 'GIRI-RADHAM-BOARDING:';

function json(response, code, body) {
  response.writeHead(code).end(JSON.stringify(body));
}

function publicOrder(order) {
  return {
    mode, token: order.access_token, reference: order.reference, routeId: order.route_id,
    passengers: order.passengers, amountPaise: order.amount_paise, status: 'pending',
    from: order.boarding_stop, to: order.destination_stop,
    razorpay: { key: liveKey, orderId: order.provider_order },
  };
}

async function placeOrder(response, { routeId, from, to, passengers, amountPaise, requestId }) {
  if (!routeForTrip(routeId, from, to) || !Object.hasOwn(fares, routeId) || !Number.isInteger(passengers) || passengers < 1 ||
      passengers > 20 || typeof requestId !== 'string' || !/^[a-f0-9-]{36}$/.test(requestId)) {
    return json(response, 400, { error: 'invalidTrip' });
  }
  const total = fares[routeId] * passengers;
  if (total !== amountPaise) return json(response, 409, { error: 'fareChanged' });

  const reserved = db.prepare(`INSERT INTO fare_orders
    (reference, request_id, access_token, route_id, boarding_stop, destination_stop, passengers, amount_paise, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(request_id) DO NOTHING`).run(
    'GR' + randomBytes(12).toString('hex'), requestId, randomToken(), routeId, from, to, passengers, total, Date.now(),
  ).changes;
  const order = byRequest.get(requestId);
  if (order.route_id !== routeId || order.boarding_stop !== from || order.destination_stop !== to ||
      order.passengers !== passengers || order.amount_paise !== total) {
    return json(response, 409, { error: 'requestConflict' });
  }
  if (order.provider_order) return json(response, 200, publicOrder(order));

  const now = Date.now();
  const lease = now + 30000;
  const claimed = db.prepare(`UPDATE fare_orders SET creation_lease = ?
    WHERE request_id = ? AND provider_order IS NULL AND creation_lease <= ?`).run(lease, requestId, now);
  if (!claimed.changes) return json(response, 409, { error: 'orderInProgress' });
  try {
    const existing = reserved ? null : await findOrder(total, order.reference);
    const providerOrder = existing ?? await createOrder(total, order.reference);
    db.prepare(`UPDATE fare_orders SET provider_order = ?
      WHERE request_id = ? AND creation_lease = ? AND provider_order IS NULL`).run(providerOrder, requestId, lease);
    const saved = byRequest.get(requestId);
    if (!saved.provider_order) return json(response, 409, { error: 'orderInProgress' });
    return json(response, 201, publicOrder(saved));
  } catch {
    // Keep the lease briefly so a slow provider can record an ambiguous request before retry.
    return json(response, 502, { error: 'razorpayOrderUnavailable' });
  }
}

function recordCapture(order, payment, timestamp) {
  db.prepare(`UPDATE fare_orders SET provider_payment = ?, boarding_token = ?, paid_at = ?, expires_at = ?
    WHERE reference = ? AND provider_payment IS NULL AND refunded_at IS NULL`).run(
    payment.id, randomToken(), timestamp, timestamp + validityMinutes * 60000, order.reference,
  );
}

function recordRefund(order, payment, timestamp) {
  db.prepare(`UPDATE fare_orders SET refunded_at = COALESCE(refunded_at, ?)
    WHERE reference = ? AND (provider_payment IS NULL OR provider_payment = ?)`).run(
    timestamp, order.reference, payment.id,
  );
}

function recordFailure(order, timestamp) {
  db.prepare(`UPDATE fare_orders SET failed_at = MAX(COALESCE(failed_at, 0), ?)
    WHERE reference = ? AND paid_at IS NULL AND refunded_at IS NULL`).run(timestamp, order.reference);
}

function matches(order, payment) {
  return payment?.order_id === order.provider_order && payment.amount === order.amount_paise &&
    payment.currency === 'INR' && /^pay_[A-Za-z0-9]+$/.test(payment.id ?? '');
}

function ticketStatus(order) {
  if (order.refunded_at) return { status: 'refunded' };
  if (order.boarded_at) return { status: 'used' };
  if (!order.boarding_token) return null;
  if (order.expires_at <= Date.now()) return { status: 'expired' };
  return { status: 'paid', ticket: order.boarding_token, paidAt: order.paid_at, expiresAt: order.expires_at };
}

async function checkStatus(response, { token, razorpayResponse }) {
  const order = typeof token === 'string' && byToken.get(token);
  if (!order) return json(response, 400, { error: 'invalidOrder' });
  if (razorpayResponse !== undefined && !validCheckoutProof(order.provider_order, razorpayResponse)) {
    return json(response, 400, { error: 'invalidRazorpaySignature' });
  }
  const saved = ticketStatus(order);
  if (saved) return json(response, 200, saved);
  try {
    const payments = (await orderPayments(order.provider_order, order.amount_paise)).filter(payment => matches(order, payment));
    const refund = payments.find(payment => payment.status === 'refunded' || payment.amount_refunded > 0);
    if (refund) recordRefund(order, refund, Date.now());
    const capture = payments.find(payment => payment.status === 'captured' &&
      (!razorpayResponse || payment.id === razorpayResponse.razorpay_payment_id));
    if (capture) recordCapture(order, capture, Date.now());
    const status = ticketStatus(byToken.get(token));
    if (status) return json(response, 200, status);
    const inProgress = razorpayResponse || payments.some(payment => ['created', 'authorized', 'captured'].includes(payment.status));
    const failed = !inProgress && payments.find(payment => payment.status === 'failed');
    if (failed) recordFailure(order, Number.isSafeInteger(failed.created_at) ? failed.created_at * 1000 : Date.now());
    return json(response, 200, { status: failed ? 'failed' : 'pending' });
  } catch {
    return json(response, 502, { error: 'verificationUnavailable' });
  }
}

async function webhook(request, response) {
  let event;
  try {
    const raw = await readBody(request, 131072);
    if (!verifySignature(webhookSecret, raw, request.headers['x-razorpay-signature'])) {
      return json(response, 401, { error: 'invalidSignature' });
    }
    event = JSON.parse(raw);
  } catch {
    return json(response, 400, { error: 'invalidWebhook' });
  }
  const payment = event?.payload?.payment?.entity;
  const order = typeof payment?.order_id === 'string' && byProvider.get(payment.order_id);
  if (order && matches(order, payment)) {
    const now = Date.now();
    const timestamp = Number.isSafeInteger(event.created_at) && event.created_at > 0
      ? Math.min(now, event.created_at * 1000) : now;
    if (event.event === 'refund.processed' && event.payload.refund?.entity?.payment_id === payment.id) {
      recordRefund(order, payment, timestamp);
    }
    if (event.event === 'payment.captured' && payment.status === 'captured' && !payment.amount_refunded) {
      recordCapture(order, payment, timestamp);
    }
    if (event.event === 'payment.failed' && payment.status === 'failed') recordFailure(order, timestamp);
  }
  return json(response, 200, { received: true });
}

export function getOverview(includePayments) {
  const payment = `CASE WHEN refunded_at IS NOT NULL THEN 'refunded'
    WHEN paid_at IS NOT NULL THEN 'paid' WHEN failed_at IS NOT NULL THEN 'failed' ELSE 'pending' END`;
  const boarding = `CASE WHEN boarded_at IS NOT NULL THEN 'boarded'
    WHEN refunded_at IS NOT NULL THEN 'revoked' WHEN expires_at <= ? THEN 'expired'
    WHEN boarding_token IS NOT NULL THEN 'ready' END`;
  const metrics = db.prepare(`
    SELECT count(*) AS orders, COALESCE(sum(paid_at IS NOT NULL AND refunded_at IS NULL), 0) AS paid,
      COALESCE(sum(paid_at IS NULL AND refunded_at IS NULL AND failed_at IS NULL), 0) AS pending,
      COALESCE(sum(paid_at IS NULL AND refunded_at IS NULL AND failed_at IS NOT NULL), 0) AS failed,
      COALESCE(sum(refunded_at IS NOT NULL), 0) AS refunded,
      COALESCE(sum(boarded_at IS NOT NULL), 0) AS boarded,
      COALESCE(sum(boarding_token IS NOT NULL AND boarded_at IS NULL AND refunded_at IS NULL AND expires_at > ?), 0) AS ready,
      COALESCE(sum(CASE WHEN paid_at IS NOT NULL THEN amount_paise ELSE 0 END), 0) AS capturedPaise
    FROM fare_orders`).get(Date.now());
  const activity = includePayments ? 'updatedAt' : 'boardingUpdatedAt';
  const orders = db.prepare(`
    SELECT reference, route_id AS routeId, passengers, amount_paise AS amountPaise,
      ${payment} AS payment, ${boarding} AS boarding,
      MAX(COALESCE(created_at, 0), COALESCE(paid_at, 0), COALESCE(failed_at, 0),
        COALESCE(refunded_at, 0), COALESCE(boarded_at, 0)) AS updatedAt,
      MAX(COALESCE(paid_at, 0), COALESCE(refunded_at, 0), COALESCE(boarded_at, 0)) AS boardingUpdatedAt
    FROM fare_orders WHERE ? OR boarding_token IS NOT NULL
    ORDER BY ${activity} DESC, rowid DESC LIMIT 50`).all(Date.now(), Number(includePayments));
  return { metrics, orders };
}

function redeem(request, response, { ticket, routeId }) {
  const supplied = createHash('sha256').update(request.headers.authorization ?? '').digest();
  if (!timingSafeEqual(boardingAuth, supplied)) return json(response, 401, { error: 'unauthorized' });
  if (typeof ticket !== 'string' || !ticket.startsWith(prefix) || !knownRoutes.has(routeId)) {
    return json(response, 400, { error: 'invalidTicket' });
  }
  const now = Date.now();
  const boarded = db.prepare(`UPDATE fare_orders SET boarded_at = ?
    WHERE boarding_token = ? AND route_id = ? AND refunded_at IS NULL AND boarded_at IS NULL AND expires_at > ?
    RETURNING reference, route_id AS routeId, passengers,
      boarding_stop AS "from", destination_stop AS "to"`).get(now, ticket.slice(prefix.length), routeId, now);
  if (!boarded) return json(response, 409, { error: 'ticketUnavailable' });
  return json(response, 200, boarded);
}

export async function handleProductionCheckout(request, response, path) {
  if (path === '/api/checkout/options') {
    return request.method === 'GET' ? json(response, 200, { mode, fares }) : json(response, 405, { error: 'method' });
  }
  const action = path.slice('/api/checkout/'.length);
  if (!['orders', 'status', 'razorpay/webhook', 'redeem'].includes(action)) return json(response, 404, { error: 'unknownEndpoint' });
  if (request.method !== 'POST') return json(response, 405, { error: 'method' });
  if (action === 'razorpay/webhook') return webhook(request, response);
  if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')) {
    return json(response, 415, { error: 'contentType' });
  }
  let body;
  try {
    body = JSON.parse(await readBody(request));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid body');
  } catch {
    return json(response, 400, { error: 'invalidRequest' });
  }
  if (action === 'orders') return placeOrder(response, body);
  if (action === 'redeem') return redeem(request, response, body);
  return checkStatus(response, body);
}
