import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { guide, routeForTrip } from './guide-data.js';
import { readBody } from './http-body.js';
import { checkTestPayment, createOrder, testConfigured, testKey, testSigningKey, validCheckoutProof } from './razorpay.js';

const mode = process.env.PAYMENT_MODE || (testKey || process.env.RAZORPAY_TEST_KEY_SECRET ? 'razorpay-test' : 'demo');
export const checkoutMode = mode;
const razorpayTest = mode === 'razorpay-test';
const productionCheckout = mode === 'razorpay-live' ? await import('./production-checkout.js') : null;
export const productionFares = productionCheckout?.fares;
export const productionOverview = productionCheckout?.getOverview;
const secret = process.env.PAYMENT_SIGNING_SECRET || '';
const signingKey = razorpayTest ? testSigningKey : mode === 'demo' ? randomBytes(32) : secret;
const payee = process.env.PAYMENT_UPI_ID?.trim();
const merchant = process.env.PAYMENT_UPI_NAME?.trim();
const category = process.env.PAYMENT_UPI_MCC?.trim();
const providerToken = process.env.PAYMENT_STATUS_TOKEN;
let providerUrl;
let liveFares;
try {
  providerUrl = new URL(process.env.PAYMENT_STATUS_URL);
  liveFares = JSON.parse(process.env.PAYMENT_ROUTE_FARES || '{}');
} catch {
  // Incomplete live configuration keeps checkout unavailable.
}
const liveReady = mode === 'live' && secret.length >= 32 && providerToken &&
  providerUrl?.protocol === 'https:' && !providerUrl.username && !providerUrl.password &&
  /^[\w.-]+@[\w.-]+$/.test(payee ?? '') && merchant && /^\d{4}$/.test(category ?? '') &&
  liveFares && typeof liveFares === 'object' && !Array.isArray(liveFares);

function sign(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', signingKey).update(data).digest('base64url');
  return `${data}.${signature}`;
}

function readOrder(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !/^[\w-]{43}$/.test(parts[1])) return null;
  const [data, signature] = parts;
  const expected = createHmac('sha256', signingKey).update(data).digest('base64url');
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const order = JSON.parse(Buffer.from(data, 'base64url'));
  return order.kind === 'order' && order.mode === mode ? order : null;
}

function fareFor(route) {
  const fare = mode === 'live' ? liveFares?.[route.id] : route.base * 100;
  return Number.isSafeInteger(fare) && fare > 0 && fare <= Math.floor(Number.MAX_SAFE_INTEGER / 20) ? fare : null;
}

function upiUri(order) {
  const params = new URLSearchParams({
    pa: order.payee, pn: merchant, mc: category, tr: order.reference,
    tn: `Bus fare ${order.routeId}`, am: (order.amountPaise / 100).toFixed(2), cu: 'INR',
  });
  return `upi://pay?${params.toString().replaceAll('+', '%20')}`;
}

async function verifyPayment(order, testStatus) {
  if (mode === 'demo') {
    return ['paid', 'failed'].includes(testStatus) ? testStatus : 'pending';
  }

  const url = new URL(providerUrl);
  url.searchParams.set('reference', order.reference);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${providerToken}`, Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Provider lookup failed');
  const result = await response.json();
  if (result.reference !== order.reference || result.payee !== order.payee ||
      result.amountPaise !== order.amountPaise || result.currency !== 'INR' ||
      !['pending', 'paid', 'failed'].includes(result.status)) {
    throw new Error('Provider result could not be verified');
  }
  return result.status;
}

function respond(response, status, body) {
  response.writeHead(status).end(JSON.stringify(body));
}

function testCheckout(order, token) {
  return {
    token, reference: order.reference, routeId: order.routeId, passengers: order.passengers,
    from: order.from, to: order.to,
    status: 'pending', amountPaise: order.amountPaise, mode,
    razorpay: { key: testKey, orderId: order.razorpayOrderId },
  };
}

export async function handleCheckout(request, response, path) {
  if (productionCheckout) return productionCheckout.handleProductionCheckout(request, response, path);
  if (razorpayTest && !testConfigured) return respond(response, 503, { error: 'razorpayTestKeysRequired' });
  if (!razorpayTest && mode !== 'demo' && !liveReady) return respond(response, 503, { error: 'unavailable' });

  if (path === '/api/checkout/options' && request.method === 'GET') {
    const fares = Object.fromEntries(guide.routes.map(route => [route.id, fareFor(route)]));
    return respond(response, 200, { mode, fares });
  }
  const resume = razorpayTest && path === '/api/checkout/resume';
  if (!resume && !['/api/checkout/orders', '/api/checkout/status'].includes(path)) {
    return respond(response, 404, { error: 'unknownEndpoint' });
  }
  if (request.method !== 'POST') return respond(response, 405, { error: 'method' });
  if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')) {
    return respond(response, 415, { error: 'contentType' });
  }
  let body;
  try {
    body = JSON.parse(await readBody(request));
    if (!body || typeof body !== 'object') throw new Error('Invalid body');
  } catch {
    return respond(response, 400, { error: 'invalidRequest' });
  }
  if (path === '/api/checkout/orders') {
    const { from, to, passengers } = body;
    const route = routeForTrip(body.routeId, from, to);
    const fare = route && fareFor(route);
    if (!fare || !Number.isInteger(passengers) || passengers < 1 || passengers > 20) {
      return respond(response, 400, { error: 'invalidTrip' });
    }
    const amountPaise = fare * passengers;
    if (amountPaise !== body.amountPaise) return respond(response, 409, { error: 'fareChanged' });
    const reference = 'GR' + randomBytes(12).toString('hex');
    const order = {
      kind: 'order', mode, reference, routeId: route.id, from, to, passengers, amountPaise,
      ...(mode === 'live' && { payee }),
    };
    if (razorpayTest) {
      try {
        order.razorpayOrderId = await createOrder(amountPaise, reference, { routeId: route.id, passengers: String(passengers) });
        return respond(response, 201, testCheckout(order, sign(order)));
      } catch {
        return respond(response, 502, { error: 'razorpayOrderUnavailable' });
      }
    }
    const paymentQr = mode === 'live' ? upiUri(order) : `GIRI-RADHAM-DEMO-PAYMENT:${reference}`;
    return respond(response, 201, {
      token: sign(order), reference, status: 'pending', amountPaise, from, to, paymentQr,
      upi: mode === 'live' ? paymentQr : null,
    });
  }
  const order = readOrder(body.token);
  if (!order) return respond(response, 400, { error: 'invalidOrder' });
  if (resume) return respond(response, 200, testCheckout(order, body.token));
  const proof = body.razorpayResponse;
  if (razorpayTest && proof !== undefined && !validCheckoutProof(order.razorpayOrderId, proof)) {
    return respond(response, 400, { error: 'invalidRazorpaySignature' });
  }
  try {
    const result = (razorpayTest && body.testStatus === 'paid')
      ? { status: 'paid' }
      : razorpayTest
        ? await checkTestPayment(order.razorpayOrderId, order.amountPaise, proof)
        : { status: await verifyPayment(order, body.testStatus) };
    const ticket = result.status === 'paid' ? sign({
      kind: 'boarding', mode, reference: order.reference,
      routeId: order.routeId, from: order.from, to: order.to, passengers: order.passengers,
    }) : null;
    return respond(response, 200, { ...result, ticket });
  } catch {
    return respond(response, 502, { error: 'verificationUnavailable' });
  }
}
