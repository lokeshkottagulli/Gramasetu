import { createHmac, timingSafeEqual } from 'node:crypto';

export const testKey = process.env.RAZORPAY_TEST_KEY_ID?.trim();
const testSecret = process.env.RAZORPAY_TEST_KEY_SECRET?.trim();
export const liveKey = process.env.RAZORPAY_LIVE_KEY_ID?.trim();
const liveSecret = process.env.RAZORPAY_LIVE_KEY_SECRET?.trim();
export const liveConfigured = /^rzp_live_[A-Za-z0-9]+$/.test(liveKey ?? '') && Boolean(liveSecret);
export const testConfigured = /^rzp_test_[A-Za-z0-9]+$/.test(testKey ?? '') && Boolean(testSecret);
export const testSigningKey = testConfigured
  ? createHmac('sha256', testSecret).update('giri-radham:razorpay-test-tokens').digest()
  : null;

const liveMode = process.env.PAYMENT_MODE === 'razorpay-live';

async function request(path, body) {
  const key = liveMode ? liveKey : testKey;
  const secret = liveMode ? liveSecret : testSecret;
  const response = await fetch('https://api.razorpay.com/v1/' + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64'),
      Accept: 'application/json',
      ...(body && { 'Content-Type': 'application/json' }),
    },
    body: body && JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Razorpay API returned HTTP ${response.status}`);
  return response.json();
}

export async function createOrder(amount, receipt, notes) {
  const order = await request('orders', { amount, currency: 'INR', receipt, notes });
  if (!/^order_[A-Za-z0-9]+$/.test(order.id) ||
      order.amount !== amount || order.currency !== 'INR' || order.receipt !== receipt) {
    throw new Error('Unexpected Razorpay order');
  }
  return order.id;
}

export function validCheckoutProof(orderId, proof) {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = proof ?? {};
  if (razorpay_order_id !== orderId || typeof razorpay_payment_id !== 'string' ||
      typeof razorpay_signature !== 'string' || !/^pay_[A-Za-z0-9]+$/.test(razorpay_payment_id) ||
      !/^[a-f0-9]{64}$/.test(razorpay_signature)) return false;
  return verifySignature(liveMode ? liveSecret : testSecret, `${orderId}|${razorpay_payment_id}`, razorpay_signature);
}

export function verifySignature(secret, data, signature) {
  if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(data).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

export async function findOrder(amount, receipt) {
  const { items } = await request('orders?' + new URLSearchParams({ receipt }));
  return items.find(order => order.receipt === receipt && order.amount === amount &&
    order.currency === 'INR' && /^order_[A-Za-z0-9]+$/.test(order.id))?.id;
}

export async function orderPayments(orderId, amount) {
  const { items } = await request(`orders/${orderId}/payments`);
  return items.filter(payment => payment.order_id === orderId &&
    payment.amount === amount && payment.currency === 'INR');
}

export async function checkTestPayment(orderId, amount, proof) {
  const payments = await orderPayments(orderId, amount);
  if (payments.some(payment => payment.status === 'captured' &&
    (!proof || payment.id === proof.razorpay_payment_id))) return { status: 'paid' };
  if (proof || payments.some(payment => ['authorized', 'captured'].includes(payment.status))) {
    return { status: 'pending' };
  }
  const failed = payments.find(payment => payment.status === 'failed');
  if (!failed) return { status: 'pending' };
  return {
    status: 'failed',
    ...(failed.error_reason === 'international_transaction_not_allowed' && { hint: 'domesticTestCardOnly' }),
  };
}

export async function recentTestOrders() {
  const query = new URLSearchParams({ count: '50', 'expand[]': 'payments' });
  const { items } = await request('orders?' + query);
  return items.filter(order => /^GR[0-9a-f]{24}$/.test(order.receipt ?? '') && order.currency === 'INR').map(order => {
    const payments = (order.payments?.items ?? []).filter(payment => payment.order_id === order.id &&
      payment.amount === order.amount && payment.currency === 'INR');
    let payment = 'pending';
    if (payments.some(item => item.status === 'refunded' || item.amount_refunded > 0)) payment = 'refunded';
    else if (order.status === 'paid' || payments.some(item => item.status === 'captured')) payment = 'paid';
    else if (!payments.some(item => item.status === 'authorized') && payments.some(item => item.status === 'failed')) payment = 'failed';
    return {
      reference: order.receipt, routeId: order.notes?.routeId || null,
      passengers: Number(order.notes?.passengers) || null, amountPaise: order.amount, payment, boarding: null,
      updatedAt: Math.max(order.created_at || 0, ...payments.map(item => item.created_at || 0)) * 1000,
      capturedPaise: order.amount_paid || 0,
    };
  });
}
