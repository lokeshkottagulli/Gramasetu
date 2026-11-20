import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { checkoutMode, productionOverview } from './checkout.js';
import { guide } from './guide-data.js';
import { recentTestOrders, testConfigured } from './razorpay.js';
import { readBody } from './http-body.js';

const derivePassword = promisify(scrypt);
const cookieName = 'giri_admin_session';
const sessionSeconds = 8 * 60 * 60;
const secureCookie = checkoutMode === 'razorpay-live' || checkoutMode === 'live' || process.env.NODE_ENV === 'production';
const sessions = new Map();
const attempts = new Map();
const unknownSalt = randomBytes(16);

const rolePermissions = {
  admin: { payments: true, boarding: true, fleet: true },
  finance: { payments: true, boarding: false, fleet: false },
  operations: { payments: false, boarding: true, fleet: true },
};

function loadAccounts() {
  let users;
  try { users = JSON.parse(process.env.ADMIN_USERS || '[]'); } catch { throw new Error('ADMIN_USERS must contain valid JSON.'); }
  if (!Array.isArray(users) || users.some(user => !user ||
    typeof user.username !== 'string' || !/^[\w.-]{1,50}$/.test(user.username) ||
    typeof user.role !== 'string' || !Object.hasOwn(rolePermissions, user.role) ||
    typeof user.passwordHash !== 'string' || !/^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/.test(user.passwordHash)) ||
    new Set(users.map(user => user.username)).size !== users.length) {
    throw new Error('ADMIN_USERS requires unique usernames, supported roles, and salted scrypt password hashes.');
  }
  return new Map(users.map(({ username, role, passwordHash }) => {
    const [, salt, digest] = passwordHash.split(':');
    return [username, { username, role, salt: Buffer.from(salt, 'hex'), digest: Buffer.from(digest, 'hex') }];
  }));
}

const accounts = loadAccounts();
const paymentMetrics = ['orders', 'paid', 'pending', 'failed', 'refunded', 'capturedPaise'];
const boardingMetrics = ['ready', 'boarded'];

function hash(value) {
  return createHash('sha256').update(value).digest();
}

function reply(response, code, data) {
  response.writeHead(code).end(JSON.stringify(data));
}

function sessionKey(request) {
  const value = /(?:^|;\s*)giri_admin_session=([\w-]{43})(?:;|$)/.exec(request.headers.cookie ?? '')?.[1];
  return value && hash(value).toString('hex');
}

function sessionCookie(response, value, maxAge) {
  response.setHeader('Set-Cookie', `${cookieName}=${value}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secureCookie ? '; Secure' : ''}`);
}

function sweepExpired(records, now) {
  for (const [key, record] of records) {
    if (record.expiresAt <= now) records.delete(key);
  }
}

async function login(request, response) {
  if (!accounts.size) return reply(response, 503, { error: 'adminUnavailable' });
  const now = Date.now();
  sweepExpired(attempts, now);
  const address = request.socket.remoteAddress ?? 'unknown';
  const attempt = attempts.get(address) ?? { count: 0, expiresAt: now + 60000 };
  if (attempt.count >= 10 || (!attempts.has(address) && attempts.size >= 1000)) {
    response.setHeader('Retry-After', '60');
    return reply(response, 429, { error: 'tooManyAttempts' });
  }
  attempt.count++;
  attempts.set(address, attempt);

  let credentials;
  try { credentials = JSON.parse(await readBody(request, 4096)); }
  catch { return reply(response, 400, { error: 'invalidRequest' }); }
  const { username, password } = credentials ?? {};
  if (typeof username !== 'string' || username.length > 50 ||
      typeof password !== 'string' || password.length > 256 || password.length < 4) {
    return reply(response, 401, { error: 'unauthorized' });
  }
  let currentAccounts;
  try { currentAccounts = loadAccounts(); } catch { currentAccounts = accounts; }
  const account = currentAccounts.get(username);
  const candidate = await derivePassword(password, account?.salt ?? unknownSalt, 64);
  if (!account || !timingSafeEqual(candidate, account.digest)) return reply(response, 401, { error: 'unauthorized' });

  sweepExpired(sessions, now);
  if (sessions.size >= 4096) return reply(response, 503, { error: 'adminBusy' });
  sessions.delete(sessionKey(request));
  const value = randomBytes(32).toString('base64url');
  sessions.set(hash(value).toString('hex'), { account, expiresAt: now + sessionSeconds * 1000 });
  sessionCookie(response, value, sessionSeconds);
  return reply(response, 200, { signedIn: true });
}

export async function handleAdmin(request, response, path) {
  const action = path.slice('/api/admin/'.length);
  if (action === 'login' || action === 'logout') {
    if (request.method !== 'POST') return reply(response, 405, { error: 'method' });
    if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')) {
      return reply(response, 415, { error: 'contentType' });
    }
    if (action === 'login') return login(request, response);
    sessions.delete(sessionKey(request));
    sessionCookie(response, '', 0);
    return reply(response, 200, { signedIn: false });
  }
  if (action !== 'overview') return reply(response, 404, { error: 'unknownEndpoint' });
  if (request.method !== 'GET') return reply(response, 405, { error: 'method' });
  if (!accounts.size) return reply(response, 503, { error: 'adminUnavailable' });
  const key = sessionKey(request);
  const session = key && sessions.get(key);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(key);
    return reply(response, 401, { error: 'unauthorized' });
  }
  const { account } = session;
  const { username, role } = account;
  const permissions = rolePermissions[role];

  let overview = { orders: [], metrics: null };
  if (productionOverview) {
    overview = productionOverview(permissions.payments);
  } else if (permissions.payments && checkoutMode === 'razorpay-test' && testConfigured) {
    const orders = await recentTestOrders();
    const metrics = { orders: orders.length, paid: 0, pending: 0, failed: 0, refunded: 0, capturedPaise: 0 };
    for (const order of orders) {
      metrics[order.payment]++;
      metrics.capturedPaise += order.capturedPaise;
    }
    overview = { metrics, orders };
  }

  const allowedMetrics = [
    ...(permissions.payments ? paymentMetrics : []),
    ...(permissions.boarding ? boardingMetrics : []),
  ];
  const metrics = overview.metrics && Object.fromEntries(
    allowedMetrics.filter(key => Object.hasOwn(overview.metrics, key)).map(key => [key, overview.metrics[key]]),
  );
  const orders = overview.orders.map(({ reference, routeId, passengers, amountPaise, payment, boarding, updatedAt, boardingUpdatedAt }) => ({
    reference, routeId, passengers,
    updatedAt: permissions.payments ? updatedAt : boardingUpdatedAt,
    ...(permissions.payments && { amountPaise, payment }),
    ...(permissions.boarding && { boarding }),
  }));

  return reply(response, 200, {
    account: { username, role }, permissions, orders, metrics,
    mode: checkoutMode,
    updatedAt: Date.now(),
    fleet: permissions.fleet ? guide.fleet.map(({ id, vehicleNumber, seatCapacity, passengers }) => ({
      id, vehicleNumber, seatCapacity, passengers,
    })) : [],
  });
}
