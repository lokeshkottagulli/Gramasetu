import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { checkoutCopy } from './checkoutCopy.js';
import { translations } from './translations.js';
import { openRazorpayCheckout, testCheckoutFragment } from './razorpayCheckout.js';

const sessionKey = 'giri-fare-order';
const checkoutRequestKey = 'giri-fare-request';
const formatFare = paise => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR',
}).format(paise / 100);

async function api(path, body, signal) {
  const response = await fetch('/api/checkout/' + path, body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  } : { signal });
  if (response.status === 503 && response.headers.get('content-type')?.includes('application/json')) {
    const { error } = await response.json();
    if (error === 'razorpayTestKeysRequired') throw new Error(error);
  }
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('Checkout API unavailable');
  }
  return response.json();
}

function savedOrder() {
  try {
    return JSON.parse(sessionStorage.getItem(sessionKey));
  } catch {
    return null;
  }
}

function saveOrder(order) {
  try { sessionStorage.setItem(sessionKey, JSON.stringify(order)); } catch { /* Keep the order in memory. */ }
}

function formatTicketTime(timestamp, language) {
  return new Intl.DateTimeFormat(language === 'te' ? 'te-IN' : 'en-IN', {
    dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Asia/Kolkata',
  }).format(timestamp);
}

function requestIdFor(trip) {
  const requestId = crypto.randomUUID();
  try {
    const previous = JSON.parse(sessionStorage.getItem(checkoutRequestKey));
    if (previous?.trip === trip) return previous.requestId;
    sessionStorage.setItem(checkoutRequestKey, JSON.stringify({ trip, requestId }));
  } catch { /* Storage can be unavailable. */ }
  return requestId;
}

function PaymentCode({ value, label, error }) {
  const [image, setImage] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, { width: 488, errorCorrectionLevel: 'M' })
      .then(url => { if (active) setImage(url); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [value]);
  if (failed) return <p role="alert">{error}</p>;
  return image ? <img className="checkout-qr" src={image} width="244" height="244" alt={label} /> : null;
}

export default function FareCheckout({ routes, initialTrip, language }) {
  const text = checkoutCopy[language];
  const { fromStop, toStop } = translations[language];
  const [routeId, setRouteId] = useState(initialTrip?.routeId ?? routes[0]?.id);
  const [from, setFrom] = useState(initialTrip?.from ?? '');
  const [to, setTo] = useState(initialTrip?.to ?? '');
  const [count, setCount] = useState('1');
  const [options, setOptions] = useState(null);
  const [order, setOrder] = useState(savedOrder);
  const [passengerDetails, setPassengerDetails] = useState([]);
  const [result, setResult] = useState(null);
  const [showCode, setShowCode] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sharedToken] = useState(() => window.location.hash.startsWith(testCheckoutFragment)
    ? window.location.hash.slice(testCheckoutFragment.length) : '');
  const [resuming, setResuming] = useState(Boolean(sharedToken));

  useEffect(() => {
    const controller = new AbortController();
    api('options', null, controller.signal).then(data => {
      setOptions(data);
      setOrder(previous => previous?.mode === data.mode ? previous : null);
      const saved = savedOrder();
      if (data.mode === 'razorpay-live' && saved?.mode === data.mode) {
        setBusy(true);
        api('status', { token: saved.token }, controller.signal).then(confirmation => {
          setResult({ ...confirmation, checkedAt: Date.now() });
        }).catch(() => {
          if (!controller.signal.aborted) setError('checkFailed');
        }).finally(() => {
          if (!controller.signal.aborted) setBusy(false);
        });
      }
    }).catch(error => {
      if (!controller.signal.aborted) {
        setError(error.message === 'razorpayTestKeysRequired' ? error.message : 'unavailable');
      }
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!sharedToken || !options) return;
    const controller = new AbortController();
    api('resume', { token: sharedToken }, controller.signal).then(next => {
      saveOrder(next);
      setOrder(next);
    }).catch(() => {
      if (!controller.signal.aborted) setError('resumeFailed');
    }).finally(() => {
      if (controller.signal.aborted) return;
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
      setResuming(false);
    });
    return () => controller.abort();
  }, [sharedToken, options]);

  const route = routes.find(item => item.id === (order?.routeId ?? routeId));
  const validTrip = from !== to && route?.stops.includes(from) && route.stops.includes(to);
  const passengers = order?.passengers ?? Number(count);
  const validCount = Number.isInteger(passengers) && passengers >= 1 && passengers <= 20;
  const price = options?.fares[routeId];
  const amount = order?.amountPaise ?? (price && validCount ? price * passengers : null);
  const status = result?.status ?? 'pending';
  const demo = (order?.mode ?? options?.mode) === 'demo';
  const razorpayTest = (order?.mode ?? options?.mode) === 'razorpay-test';
  const razorpayLive = (order?.mode ?? options?.mode) === 'razorpay-live';
  const usesRazorpay = razorpayTest || razorpayLive;
  const demoPaymentQr = razorpayTest && order
    ? window.location.origin + '/' + testCheckoutFragment + order.token : null;

  async function createOrder(event) {
    event.preventDefault();
    if (busy || !amount || !validCount || !validTrip) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const details = Array.from({ length: passengers }, (_, index) => ({
      name: fields.get(`name-${index}`).trim(),
      age: fields.get(`age-${index}`),
      aadhaarLastFour: fields.get(`aadhaar-${index}`)?.slice(-4),
    }));
    if (details.some(passenger => !passenger.name)) {
      setError('invalidName');
      return;
    }
    for (let index = 0; index < passengers; index++) {
      const aadhaar = form.elements.namedItem(`aadhaar-${index}`);
      if (aadhaar) aadhaar.value = '';
    }
    setBusy(true);
    setError('');
    try {
      const request = { routeId, from, to, passengers, amountPaise: amount };
      const requestId = razorpayLive ? requestIdFor(JSON.stringify(request)) : undefined;
      const response = await api('orders', { ...request, requestId });
      const next = { ...response, routeId, passengers, mode: options.mode };
      saveOrder(next);
      setPassengerDetails(details);
      setOrder(next);
      if (next.razorpay) await startRazorpayPayment(next);
    } catch {
      setError('createFailed');
    } finally {
      setBusy(false);
    }
  }

  async function checkPayment(paymentOrder, { testStatus, razorpayResponse } = {}) {
    setBusy(true);
    setError('');
    try {
      const confirmation = await api('status', { token: paymentOrder.token, testStatus, razorpayResponse });
      setResult(previous => previous?.status === 'paid' ? previous : { ...confirmation, checkedAt: Date.now() });
    } catch {
      setError('checkFailed');
    } finally {
      setBusy(false);
    }
  }

  async function startRazorpayPayment(paymentOrder) {
    setBusy(true);
    setError('');
    try {
      await openRazorpayCheckout(
        paymentOrder,
        razorpayResponse => checkPayment(paymentOrder, { razorpayResponse }),
        () => checkPayment(paymentOrder),
      );
    } catch {
      setError('razorpayLoadFailed');
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    try {
      sessionStorage.removeItem(sessionKey);
      sessionStorage.removeItem(checkoutRequestKey);
    } catch { /* Storage can be unavailable. */ }
    setOrder(null);
    setPassengerDetails([]);
    setResult(null);
    setShowDemo(false);
    setShowCode(false);
    setError('');
  }

  return (
    <main className="inner section checkout">
      <div className="section-heading">
        <h2>{text.title}</h2>
        {demo && <p>{text.demoNotice}</p>}
        {razorpayTest && <p>{text.razorpayNotice}</p>}
      </div>
      <section className="panel">
        <h3>1. {text.review}</h3>
        {resuming ? (
          <p role="status">{error ? text[error] : text.resuming}</p>
        ) : order ? (
          <>
            <dl className="checkout-summary">
              <div><dt>{text.route}</dt><dd>{route?.name ?? order.routeId}</dd></div>
              {order.from && order.to && <>
                <div><dt>{fromStop}</dt><dd>{order.from}</dd></div>
                <div><dt>{toStop}</dt><dd>{order.to}</dd></div>
              </>}
              <div><dt>{text.passengers}</dt><dd>{passengers}</dd></div>
              <div><dt>{text.total}</dt><dd>{formatFare(amount)}</dd></div>
            </dl>
            {passengerDetails.length > 0 && (
              <ol className="checkout-passenger-list">
                {passengerDetails.map(({ name, age, aadhaarLastFour }, index) => (
                  <li key={index}>
                    <strong>{name}</strong> · {text.age} {age}
                    {aadhaarLastFour && <> · {text.aadhaar} •••• •••• {aadhaarLastFour}</>}
                  </li>
                ))}
              </ol>
            )}
          </>
        ) : (
          <form onSubmit={createOrder}>
            <label htmlFor="checkout-route">{text.route}</label>
            <select id="checkout-route" value={routeId} onChange={event => {
              setRouteId(event.target.value);
              setFrom('');
              setTo('');
            }}>
              {routes.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
            </select>
            <div className="checkout-stops">
              <div>
                <label htmlFor="checkout-from">{fromStop}</label>
                <select id="checkout-from" value={from} onChange={event => setFrom(event.target.value)} required>
                  <option value="">{text.selectStop}</option>
                  {route?.stops.map(stop => <option key={stop} disabled={stop === to}>{stop}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="checkout-to">{toStop}</label>
                <select id="checkout-to" value={to} onChange={event => setTo(event.target.value)} required>
                  <option value="">{text.selectStop}</option>
                  {route?.stops.map(stop => <option key={stop} disabled={stop === from}>{stop}</option>)}
                </select>
              </div>
            </div>
            <label htmlFor="checkout-count">{text.passengers}</label>
            <input id="checkout-count" className="form-input" type="number" min="1" max="20" step="1" required
              value={count} onChange={event => setCount(event.target.value)} />
            {validCount && Array.from({ length: passengers }, (_, index) => (
              <fieldset className="checkout-passenger" key={index} disabled={busy}>
                <legend>{text.passenger} {index + 1}</legend>
                <label>
                  {text.passengerName}
                  <input className="form-input" name={`name-${index}`} maxLength="100" required />
                </label>
                <label>
                  {text.age}
                  <input className="form-input" name={`age-${index}`} type="number"
                    inputMode="numeric" min="0" max="125" step="1" required />
                </label>
                {options && !razorpayLive && <label>
                  {text.aadhaarOptional}
                  <input className="form-input" name={`aadhaar-${index}`} type="password"
                    inputMode="numeric" pattern="[0-9]{12}" maxLength="12" autoComplete="off" />
                </label>}
              </fieldset>
            ))}
            <p className="checkout-total" aria-live="polite">{text.total} <strong>{amount ? formatFare(amount) : '—'}</strong></p>
            {options && !price && <p>{text.fareUnavailable}</p>}
            <button className="primary" disabled={busy || !amount || !options || !validTrip}>{text.continue}</button>
          </form>
        )}
        {!resuming && error && !['checkFailed', 'razorpayLoadFailed'].includes(error) && <p role="alert">{text[error]}</p>}
      </section>

      {order && !resuming && (
        <>
          {(status === 'pending' || (usesRazorpay && status === 'failed')) && (
            <section className="panel">
              <h3>2. {razorpayTest ? text.payTest : razorpayLive ? text.payRazorpay : text.pay}</h3>
              <div className="checkout-actions">
                {usesRazorpay ? (
                  <button className="primary" type="button" disabled={busy || !options} onClick={() => startRazorpayPayment(order)}>
                    {status === 'failed' ? text.retryPayment : razorpayTest ? text.payTest : text.payRazorpay} · {formatFare(amount)}
                  </button>
                ) : order.upi ? (
                  <>
                    <a className="primary" href={order.upi}>{text.openUpi} · {formatFare(amount)}</a>
                    {/iPhone|iPad/i.test(navigator.userAgent) && (
                      <a className="outline" href={'gpay://' + order.upi.replace('://', '/')}>{text.openGooglePay} · {formatFare(amount)}</a>
                    )}
                  </>
                ) : (
                  <button className="primary" type="button" onClick={() => setShowDemo(!showDemo)}>
                    {text.previewUpi} · {formatFare(amount)}
                  </button>
                )}
                {!razorpayLive && <button className="outline" type="button" aria-expanded={showCode} onClick={() => setShowCode(!showCode)}>
                  {razorpayTest ? text.demoPaymentQr : text.scanQr} · {formatFare(amount)}
                </button>}
              </div>
              {showCode && (
                <>
                  <p>{razorpayTest ? text.razorpayQrHelp : demo ? text.demoQr : text.scanHelp}</p>
                  <PaymentCode label={razorpayTest ? text.demoPaymentQr : text.paymentQr}
                    value={demoPaymentQr ?? order.paymentQr} error={text.qrError} />
                </>
              )}
              {razorpayTest && (
                <>
                  <p>{text.testCardHelp} <code>4100 2800 0000 1007</code></p>
                  <p>{text.razorpayTestIds} <code>success@razorpay</code> · <code>failure@razorpay</code></p>
                </>
              )}
              {error === 'razorpayLoadFailed' && <p role="alert">{text.razorpayLoadFailed}</p>}
              {showDemo && demo && (
                <div className="checkout-actions checkout-demo">
                  <button className="outline" type="button" disabled={busy} onClick={() => checkPayment(order, { testStatus: 'paid' })}>{text.demoPaid}</button>
                  <button className="outline" type="button" disabled={busy} onClick={() => checkPayment(order, { testStatus: 'failed' })}>{text.demoFailed}</button>
                </div>
              )}
            </section>
          )}
          <section className="panel">
            <h3>3. {text.check}</h3>
            <p role="status" className={'checkout-status ' + status}>{text[status]}</p>
            {result?.hint === 'domesticTestCardOnly' && <p role="alert">{text.domesticTestCardOnly}</p>}
            {error === 'checkFailed' && <p role="alert">{text.checkFailed}</p>}
            <div className="checkout-actions">
              {(status === 'pending' || (usesRazorpay && status === 'failed')) && (
                <button className="outline" type="button" disabled={busy} onClick={() => checkPayment(order)}>
                  {busy ? text.checking : text.check}
                </button>
              )}
              {(status !== 'pending' || demo) && (
                <button className="outline" type="button" disabled={busy} onClick={restart}>{text.newTrip}</button>
              )}
            </div>
          </section>
          {status === 'paid' && result.ticket && (
            <section className="checkout-ticket boarding-receipt" aria-labelledby="boarding-ticket-title">
              <div className="boarding-receipt-heading">
                <strong>{translations[language].brandName}</strong>
                <h3 id="boarding-ticket-title">{demo || razorpayTest ? text.demoTicket : text.ticket}</h3>
                <time dateTime={new Date(result.paidAt ?? result.checkedAt).toISOString()}>
                  {formatTicketTime(result.paidAt ?? result.checkedAt, language)} IST
                </time>
              </div>
              <div className="boarding-receipt-route">
                <small>{order.routeId}</small><strong>{route?.name ?? order.routeId}</strong>
                {order.from && order.to && (
                  <dl className="boarding-receipt-details boarding-receipt-stops">
                    <div><dt>{fromStop}</dt><dd>{order.from}</dd></div>
                    <div><dt>{toStop}</dt><dd>{order.to}</dd></div>
                  </dl>
                )}
              </div>
              <dl className="boarding-receipt-details">
                <div><dt>{text.reference}</dt><dd>{order.reference}</dd></div>
                <div><dt>{text.paymentMethod}</dt><dd>{usesRazorpay ? 'Razorpay' : demo ? text.demoPayment : 'UPI'}</dd></div>
                <div><dt>{text.passengers}</dt><dd>{passengers} × {formatFare(amount / passengers)}</dd></div>
                {result.expiresAt && (
                  <div><dt>{text.validUntil}</dt><dd>{formatTicketTime(result.expiresAt, language)}</dd></div>
                )}
              </dl>
              <p className="boarding-receipt-total"><span>{text.paidTotal}</span> <strong>{formatFare(amount)}</strong></p>
              <figure className="boarding-receipt-code">
                <PaymentCode label={text.boardingQr} value={`GIRI-RADHAM-BOARDING:${result.ticket}`} error={text.qrError} />
                <figcaption>{text.boardingQr}</figcaption>
              </figure>
              <button className="outline checkout-ticket-print" type="button" onClick={() => window.print()}>
                {text.printTicket}
              </button>
            </section>
          )}
        </>
      )}
    </main>
  );
}
