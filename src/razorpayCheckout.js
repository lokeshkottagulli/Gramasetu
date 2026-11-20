export const testCheckoutFragment = '#test-checkout=';

let scriptPromise;

function loadCheckout() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => window.Razorpay ? resolve(window.Razorpay) : reject(new Error('Checkout missing'));
    script.onerror = () => reject(new Error('Checkout script failed'));
    document.head.append(script);
  }).catch(error => {
    scriptPromise = undefined;
    throw error;
  });
  return scriptPromise;
}

export async function openRazorpayCheckout(order, onSuccess, onStatusChange) {
  const Razorpay = await loadCheckout();
  const checkout = new Razorpay({
    key: order.razorpay.key,
    order_id: order.razorpay.orderId,
    amount: order.amountPaise,
    currency: 'INR',
    name: 'Gramasetu',
    description: order.mode === 'razorpay-live' ? 'Bus fare' : 'Test bus fare',
    handler: onSuccess,
    modal: { ondismiss: onStatusChange },
  });
  checkout.on('payment.failed', onStatusChange);
  checkout.open();
}
