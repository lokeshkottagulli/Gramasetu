import React, { useEffect, useState } from 'react';
import { LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';

export const adminCopy = {
  en: {
    title: 'Admin dashboard', username: 'Username', password: 'Password', signIn: 'Sign in', signOut: 'Sign out',
    refresh: 'Refresh', updating: 'Updating…', lastUpdated: 'Last updated (IST)',
    denied: 'The username or password is incorrect.', unavailable: 'Admin data is unavailable. Check the server and try again.',
    tooManyAttempts: 'Too many sign-in attempts. Wait a minute and try again.',
    unconfigured: 'Admin access is unavailable. Configure staff accounts on the server.',
    admin: 'Admin', finance: 'Finance', operations: 'Operations',
    recentBoarding: 'Recent boarding activity',
    boardingUnavailable: 'Boarding activity is available in Razorpay Live Mode.',
    orders: 'Orders', paid: 'Paid', pending: 'Pending', failed: 'Failed', refunded: 'Refunded',
    boarded: 'Boarded', capturedPaise: 'Gross captured', ready: 'Ready', expired: 'Expired', revoked: 'Revoked',
    recent: 'Recent orders', all: 'All payment statuses', filter: 'Filter by payment status',
    empty: 'No matching orders.', reference: 'Reference', route: 'Route', passengers: 'Passengers',
    fare: 'Fare', payment: 'Payment', boarding: 'Boarding', activity: 'Last activity (IST)',
    liveNote: 'Razorpay Live Mode · All-time totals · 50 most recently updated orders',
    testNote: 'Razorpay Test Mode · Recent sandbox orders · Boarding analytics are available in Live Mode.',
    noLedger: 'This payment mode has no order ledger to monitor.',
    fleet: 'Simulated fleet', vehicle: 'Vehicle', seats: 'Seat capacity',
  },
  te: {
    title: 'నిర్వహణ డ్యాష్‌బోర్డ్', username: 'వినియోగదారు పేరు', password: 'పాస్‌వర్డ్', signIn: 'సైన్ ఇన్', signOut: 'సైన్ అవుట్',
    refresh: 'తాజా సమాచారం', updating: 'అప్‌డేట్ అవుతోంది…', lastUpdated: 'చివరి అప్‌డేట్ (IST)',
    denied: 'వినియోగదారు పేరు లేదా పాస్‌వర్డ్ సరిపోలలేదు.', unavailable: 'నిర్వహణ సమాచారం అందుబాటులో లేదు. సర్వర్‌ను తనిఖీ చేసి మళ్లీ ప్రయత్నించండి.',
    tooManyAttempts: 'చాలాసార్లు ప్రయత్నించారు. ఒక నిమిషం తర్వాత మళ్లీ ప్రయత్నించండి.',
    unconfigured: 'నిర్వహణ యాక్సెస్ కోసం సర్వర్‌లో సిబ్బంది ఖాతాలను సెట్ చేయండి.',
    admin: 'నిర్వాహకుడు', finance: 'ఆర్థిక విభాగం', operations: 'కార్యకలాపాలు',
    recentBoarding: 'ఇటీవలి బోర్డింగ్ వివరాలు',
    boardingUnavailable: 'బోర్డింగ్ వివరాలు Razorpay లైవ్ మోడ్‌లో అందుబాటులో ఉంటాయి.',
    orders: 'ఆర్డర్లు', paid: 'చెల్లించినవి', pending: 'పెండింగ్', failed: 'విఫలమైనవి', refunded: 'తిరిగి చెల్లించినవి',
    boarded: 'బస్సు ఎక్కినవి', capturedPaise: 'మొత్తం వసూళ్లు', ready: 'సిద్ధంగా ఉంది', expired: 'గడువు ముగిసింది', revoked: 'రద్దయింది',
    recent: 'ఇటీవలి ఆర్డర్లు', all: 'అన్ని చెల్లింపు స్థితులు', filter: 'చెల్లింపు స్థితి ప్రకారం చూడండి',
    empty: 'సరిపోలే ఆర్డర్లు లేవు.', reference: 'రిఫరెన్స్', route: 'మార్గం', passengers: 'ప్రయాణికులు',
    fare: 'ఛార్జీ', payment: 'చెల్లింపు', boarding: 'బోర్డింగ్', activity: 'చివరి నమోదు (IST)',
    liveNote: 'Razorpay లైవ్ మోడ్ · మొత్తం గణాంకాలు · చివరిగా అప్‌డేట్ అయిన 50 ఆర్డర్లు',
    testNote: 'Razorpay పరీక్ష మోడ్ · ఇటీవలి పరీక్ష ఆర్డర్లు · బోర్డింగ్ గణాంకాలు లైవ్ మోడ్‌లో అందుబాటులో ఉంటాయి.',
    noLedger: 'ఈ చెల్లింపు మోడ్‌లో ఆర్డర్ రికార్డులు అందుబాటులో లేవు.',
    fleet: 'బస్సుల నమూనా స్థితి', vehicle: 'వాహనం', seats: 'సీట్ల సామర్థ్యం',
  },
};

const paymentStates = ['pending', 'paid', 'failed', 'refunded'];
const metricKeys = ['orders', 'pending', 'paid', 'failed', 'refunded', 'ready', 'boarded', 'capturedPaise'];
const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

function postSession(action, body) {
  return fetch('/api/admin/' + action, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export default function AdminDashboard({ routes, language }) {
  const text = adminCopy[language];
  const [signedIn, setSignedIn] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [filter, setFilter] = useState('');
  const date = new Intl.DateTimeFormat(language === 'te' ? 'te-IN' : 'en-IN', {
    dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Kolkata',
  });

  useEffect(() => {
    if (signedIn === false) return;
    const controller = new AbortController();
    let loading = false;

    async function load() {
      if (loading || document.hidden) return;
      loading = true;
      setBusy(true);
      setError('');
      try {
        const response = await fetch('/api/admin/overview', { signal: controller.signal });
        if (response.status === 401) {
          setSnapshot(null);
          setSignedIn(false);
          setBusy(false);
        } else if (response.status === 503 && response.headers.get('content-type')?.includes('application/json') &&
          (await response.json()).error === 'adminUnavailable') {
          if (signedIn === null) setSignedIn(false);
          setBusy(false);
          setError('unconfigured');
        } else if (!response.ok) {
          if (signedIn === null) setSignedIn(false);
          setBusy(false);
          setError('unavailable');
        } else {
          setSnapshot(await response.json());
          setSignedIn(true);
        }
      } catch {
        if (!controller.signal.aborted) {
          if (signedIn === null) setSignedIn(false);
          setBusy(false);
          setError('unavailable');
        }
      } finally {
        loading = false;
        if (!controller.signal.aborted) setBusy(false);
      }
    }

    load();
    const timer = setInterval(load, 30000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [signedIn, refresh]);

  async function signIn(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    form.elements.password.value = '';
    setBusy(true);
    setError('');
    try {
      const response = await postSession('login', {
        username: fields.get('username').trim(), password: fields.get('password'),
      });
      if (response.ok) setSignedIn(true);
      else if (response.status === 401) setError('denied');
      else if (response.status === 429) setError('tooManyAttempts');
      else setError('unavailable');
    } catch {
      setError('unavailable');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      const response = await postSession('logout', {});
      if (!response.ok) throw new Error('Sign-out failed');
      setSignedIn(false);
      setSnapshot(null);
      setError('');
      setFilter('');
    } catch {
      setError('unavailable');
    } finally {
      setBusy(false);
    }
  }

  const orders = snapshot?.orders.filter(order => !filter || order.payment === filter);
  const permissions = snapshot?.permissions;
  const columns = [
    'reference', 'route', 'passengers',
    ...(permissions?.payments ? ['fare', 'payment'] : []),
    ...(permissions?.boarding ? ['boarding'] : []),
    'activity',
  ];

  return (
    <main className="inner section admin-dashboard">
      <div className="section-heading"><h2>{text.title}</h2></div>
      {signedIn === false && (
        <form className="panel admin-sign-in" method="post" onSubmit={signIn}>
          <label htmlFor="admin-username">{text.username}</label>
          <input id="admin-username" name="username" className="form-input" autoComplete="username" maxLength="50" required />
          <label htmlFor="admin-password">{text.password}</label>
          <input id="admin-password" name="password" type="password" className="form-input" autoComplete="current-password" maxLength="256" required />
          <button className="primary" disabled={busy}><ShieldCheck size={17} aria-hidden="true" />{text.signIn}</button>
        </form>
      )}
      {signedIn && (
        <div className="admin-toolbar">
          <p>{snapshot && <>
            <strong>{snapshot.account.username} · {text[snapshot.account.role]}</strong><br />
            {text.lastUpdated} {date.format(snapshot.updatedAt)}
          </>}</p>
          <button className="outline" disabled={busy} type="button" onClick={() => setRefresh(n => n + 1)}>
            <RefreshCw size={16} aria-hidden="true" />{busy ? text.updating : text.refresh}
          </button>
          <button className="outline" type="button" disabled={busy} onClick={signOut}>
            <LockKeyhole size={16} aria-hidden="true" />{text.signOut}
          </button>
        </div>
      )}
      {error && <p role="alert" className="admin-error">{text[error]}</p>}
      {snapshot && (
        <>
          <p>{snapshot.mode === 'razorpay-live' ? text.liveNote : snapshot.mode === 'razorpay-test'
            ? permissions.payments ? text.testNote : text.boardingUnavailable : text.noLedger}</p>
          {snapshot.metrics && (
            <>
              <dl className="admin-metrics">
                {metricKeys.filter(key => snapshot.metrics[key] != null).map(key => (
                  <div key={key} className="panel">
                    <dt>{text[key]}</dt>
                    <dd>{key === 'capturedPaise' ? currency.format(snapshot.metrics[key] / 100) : snapshot.metrics[key]}</dd>
                  </div>
                ))}
              </dl>
              <section className="panel admin-panel">
                <div className="admin-table-heading">
                  <h3>{permissions.payments ? text.recent : text.recentBoarding}</h3>
                  {permissions.payments && <select aria-label={text.filter} value={filter} onChange={event => setFilter(event.target.value)}>
                    <option value="">{text.all}</option>
                    {paymentStates.map(state => <option key={state} value={state}>{text[state]}</option>)}
                  </select>}
                </div>
                {orders.length ? (
                  <div className="table-wrap">
                    <table className="admin-table">
                      <thead><tr>{columns.map(key => (
                        <th scope="col" key={key}>{text[key]}</th>
                      ))}</tr></thead>
                      <tbody>{orders.map(order => (
                        <tr key={order.reference}>
                          <td>{order.reference}</td>
                          <td>{routes.find(route => route.id === order.routeId)?.name ?? order.routeId ?? '—'}</td>
                          <td>{order.passengers ?? '—'}</td>
                          {permissions.payments && <>
                            <td>{currency.format(order.amountPaise / 100)}</td>
                            <td><span className={'admin-payment ' + order.payment}>{text[order.payment]}</span></td>
                          </>}
                          {permissions.boarding && <td>{order.boarding ? text[order.boarding] : '—'}</td>}
                          <td>{order.updatedAt ? date.format(order.updatedAt) : '—'}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : <p>{text.empty}</p>}
              </section>
            </>
          )}
          {permissions.fleet && <section className="panel admin-panel">
            <h3>{text.fleet}</h3>
            <div className="table-wrap">
              <table className="admin-table">
                <thead><tr>{['vehicle', 'passengers', 'seats'].map(key => <th scope="col" key={key}>{text[key]}</th>)}</tr></thead>
                <tbody>{snapshot.fleet.map(bus => (
                  <tr key={bus.id}><td>{bus.vehicleNumber}</td><td>{bus.passengers}</td><td>{bus.seatCapacity}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </section>}
        </>
      )}
    </main>
  );
}
