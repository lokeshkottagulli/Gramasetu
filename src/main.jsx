import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BusFront, Ticket, MapPin, Wallet,
  ArrowRight, Menu, X, Route, Clock, Activity,
  Info, Navigation, ShieldCheck, Volume2, VolumeX
} from 'lucide-react';
import './style.css';
import LiveTracker from './LiveTracker.jsx';
import RouteMap from './RouteMap.jsx';
import FareCheckout from './FareCheckout.jsx';
import AdminDashboard, { adminCopy } from './AdminDashboard.jsx';
import { testCheckoutFragment } from './razorpayCheckout.js';
import { checkoutCopy } from './checkoutCopy.js';
import { translations } from './translations.js';

const initialLanguage = () => localStorage.getItem('smartbus_language') === 'te' ? 'te' : 'en';

/* ─── App ─── */
function App({ guide }) {
  const { routes, stops: allStops, schedules: scheduleDetails, fleet: demoFleet } = guide;
  const totalStops = allStops.length;
  const totalRoutes = routes.length;
  const [page, setPage] = useState(() => window.location.hash.startsWith(testCheckoutFragment) ? 'checkout' : 'home');
  const [mobile, setMobile] = useState(false);
  const [language, setLanguage] = useState(initialLanguage);
  const [speechMessage, setSpeechMessage] = useState('');
  const [speechVoices, setSpeechVoices] = useState([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const pageAudio = useRef(null);
  const heroScene = useRef(null);
  const text = translations[language];

  useEffect(() => {
    const scene = heroScene.current;
    if (!scene) return;
    const hero = scene.parentElement;

    const resize = new ResizeObserver(() => {
      scene.style.width = `${Math.max(hero.clientWidth, hero.clientHeight * (16 / 9))}px`;
    });
    resize.observe(hero);
    return () => {
      resize.disconnect();
    };
  }, [page]);

  const [heroFrom, setHeroFrom] = useState(allStops[0]);
  const [heroTo, setHeroTo] = useState(allStops[1]);
  const [routeSearch, setRouteSearch] = useState(null);
  const [checkoutTrip, setCheckoutTrip] = useState(null);
  const [mapRouteId, setMapRouteId] = useState('');
  const [mapStop, setMapStop] = useState(null);
  const visibleRoutes = routeSearch
    ? routes.filter(route => route.stops.includes(routeSearch.from) && route.stops.includes(routeSearch.to))
    : routes;
  const activeMapRouteId = visibleRoutes.find(route => route.id === mapRouteId)?.id ?? visibleRoutes[0]?.id;

  function selectMapRoute(routeId) {
    setMapRouteId(routeId);
    setMapStop(null);
  }

  function openRouteMap(routeId, stop = null) {
    selectMapRoute(routeId);
    if (stop) setMapStop({ name: stop, trip: routeSearch });
    document.getElementById('route-map-panel')?.scrollIntoView({ block: 'start' });
  }

  useEffect(() => {
    localStorage.setItem('smartbus_language', language);
    document.documentElement.lang = language;
  }, [language]);
  useEffect(() => {
    if (!('speechSynthesis' in window)) return undefined;
    const updateVoices = () => setSpeechVoices(window.speechSynthesis.getVoices());
    updateVoices();
    window.speechSynthesis.addEventListener('voiceschanged', updateVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', updateVoices);
  }, []);

  const stopReading = () => {
    const audio = pageAudio.current;
    pageAudio.current = null;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setSpeechMessage('');
  };

  const navigate = p => {
    stopReading();
    setPage(p);
    setMobile(false);
    window.scrollTo(0, 0);
  };

  const speakWithSynthesis = (speechText) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      setSpeechMessage(text.speechUnavailable);
      setIsSpeaking(false);
      return;
    }

    try {
      window.speechSynthesis.cancel();
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();

      const voices = window.speechSynthesis.getVoices();
      const availableVoices = voices.length ? voices : speechVoices;
      const voice = availableVoices.find(candidate => (
        language === 'te' ? /^te/i : /^en[-_]in/i
      ).test(candidate.lang)) || availableVoices.find(candidate => (
        language === 'te' ? /^te/i : /^en/i
      ).test(candidate.lang)) || availableVoices[0];

      if (language === 'te' && !voice) {
        setSpeechMessage(text.teluguVoiceUnavailable);
        setIsSpeaking(false);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(speechText);
      utterance.lang = language === 'te' ? 'te-IN' : 'en-IN';
      if (voice) utterance.voice = voice;
      utterance.rate = 0.95;

      utterance.onstart = () => {
        setIsSpeaking(true);
        setSpeechMessage(text.readingPage);
      };

      utterance.onend = () => {
        setIsSpeaking(false);
        setSpeechMessage('');
      };

      utterance.onerror = (err) => {
        console.warn('Speech error:', err);
        setIsSpeaking(false);
        setSpeechMessage(text.speechFailed);
      };

      window.speechSynthesis.speak(utterance);
    } catch {
      setIsSpeaking(false);
      setSpeechMessage(text.speechFailed);
    }
  };

  const readPageAloud = () => {
    if (isSpeaking) {
      stopReading();
      return;
    }

    stopReading();
    setIsSpeaking(true);

    const fareText = checkoutCopy[language];
    const summaries = {
      home: text.homePageSpeech,
      schedules: text.schedulePageSpeech,
      routes: text.routesPageSpeech,
      track: text.trackPageSpeech,
      status: text.statusPageSpeech,
      checkout: [fareText.review, fareText.pay, fareText.check, fareText.ticket].join('. '),
      admin: [adminCopy[language].title, adminCopy[language].signIn].join('. '),
    };
    const speechText = summaries[page] || text.homePageSpeech;

    // Check if a pre-recorded audio file exists
    const hasRecording = page === 'home' || (language === 'te' && ['routes', 'schedules', 'track', 'status'].includes(page));
    if (hasRecording) {
      const recording = page === 'home' ? 'gramasetu-home' : page;
      const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, '');
      const audioUrl = `${baseUrl}/audio/${language}/${recording}.mp3`;
      const audio = new Audio(audioUrl);
      pageAudio.current = audio;

      audio.onended = () => {
        if (pageAudio.current === audio) {
          pageAudio.current = null;
          setIsSpeaking(false);
          setSpeechMessage('');
        }
      };

      audio.onerror = () => {
        // Fall back to Web Speech Synthesis if audio file fails
        if (pageAudio.current === audio) {
          pageAudio.current = null;
          speakWithSynthesis(speechText);
        }
      };

      audio.play().then(
        () => {
          if (pageAudio.current === audio) {
            setSpeechMessage(text.readingPage);
          }
        },
        () => {
          // Fall back to speech synthesis if play is rejected (e.g. autoplay block)
          if (pageAudio.current === audio) {
            pageAudio.current = null;
            speakWithSynthesis(speechText);
          }
        }
      );
      return;
    }

    // Direct speech synthesis for all other pages
    speakWithSynthesis(speechText);
  };

  const Nav = ({ p, icon: Icon, label }) => (
    <button className={'navitem ' + (page === p ? 'selected' : '')} onClick={() => {
      if (p === 'routes') setRouteSearch(null);
      if (p === 'checkout' && page !== p) setCheckoutTrip(null);
      navigate(p);
    }}>
      <Icon size={17} />{label}
    </button>
  );

  const searchTrip = () => {
    if (heroFrom === heroTo) return;
    setRouteSearch({ from: heroFrom, to: heroTo });
    navigate('routes');
  };

  return (
    <>
      {/* ── HEADER ── */}
      <header>
        <div className="header inner">
          <button className="brand" onClick={() => navigate('home')}>
            <img className="brandmark" src={import.meta.env.BASE_URL + "gramasetu-brand.png"} width="52" height="52" alt="" />
            <span>{text.brandName}</span>
          </button>
          <nav className={mobile ? 'open' : ''}>
            <Nav p="home" icon={BusFront} label={text.navHome} />
            <Nav p="routes" icon={Route} label={text.navRoutes} />
            <Nav p="checkout" icon={Wallet} label={checkoutCopy[language].title} />
            <Nav p="schedules" icon={Clock} label={text.navSchedules} />
            <Nav p="track" icon={Navigation} label={text.navTrack} />
            <Nav p="status" icon={Activity} label={text.navStatus} />
            <Nav p="admin" icon={ShieldCheck} label={text.navAdmin} />
          </nav>
          <div className="accessibility-tools">
            <label className="sr-only" htmlFor="language-select">{text.languageLabel}</label>
            <select
              id="language-select"
              className="language-select"
              aria-label={text.languageLabel}
              value={language}
              onChange={event => { stopReading(); setLanguage(event.target.value); }}
            >
              <option value="en">{text.languageEn}</option>
              <option value="te">{text.languageTe}</option>
            </select>
            <button
              type="button"
              className={`listen-button ${isSpeaking ? 'active' : ''}`}
              aria-label={isSpeaking ? (language === 'te' ? 'వాయిస్ ఆపండి' : 'Stop voice') : text.readAloud}
              title={isSpeaking ? (language === 'te' ? 'వాయిస్ ఆపండి' : 'Stop voice') : text.readAloud}
              onClick={readPageAloud}
            >
              {isSpeaking ? <VolumeX size={17} /> : <Volume2 size={17} />}
              <span>{isSpeaking ? (language === 'te' ? 'ఆపండి' : 'Stop') : text.listenLabel}</span>
            </button>
          </div>
          <button className="menu" onClick={() => setMobile(!mobile)}>{mobile ? <X /> : <Menu />}</button>
        </div>
      </header>
      {speechMessage && (
        <aside className={`speech-toast ${speechMessage === text.readingPage ? 'active' : 'info'}`} role="status">
          <span>🔊 {speechMessage}</span>
          <button type="button" onClick={stopReading} aria-label="Dismiss audio">✕</button>
        </aside>
      )}

      {/* ── HOME ── */}
      {page === 'home' && (
        <>
          <section className="hero">
            <div ref={heroScene} className="hero-scene" aria-hidden="true">
              <img className="hero-bus" src={import.meta.env.BASE_URL + 'rural-bus-cutout.png'} alt="" />
            </div>
            <div className="inner hero-grid">
              <div>
                <div className="hero-eyebrow">{text.heroEyebrow}</div>
                <h1>{text.heroTitle}</h1>
                <p>{text.heroIntro}</p>
                <ul className="hero-stats">
                  <li><Ticket size={16} aria-hidden="true" /> {text.heroWalkUp}</li>
                  <li><Route size={16} aria-hidden="true" /> {text.heroVillageConnectivity}</li>
                  <li><BusFront size={16} aria-hidden="true" /> {text.heroSmartMobility}</li>
                </ul>
              </div>
              <div className="hero-visual">
                <div className="route-search-card">
                  <h2>{text.findRouteTitle}</h2>
                  <p>{text.findBus}</p>
                  <label htmlFor="route-from">{text.from}</label>
                  <select id="route-from" value={heroFrom} onChange={e => setHeroFrom(e.target.value)}>
                    {allStops.map(stop => <option key={'from-' + stop} value={stop}>{stop}</option>)}
                  </select>
                  <label htmlFor="route-to">{text.to}</label>
                  <select id="route-to" value={heroTo} onChange={e => setHeroTo(e.target.value)}>
                    {allStops.map(stop => <option key={'to-' + stop} value={stop}>{stop}</option>)}
                  </select>
                  <button className="search-button" onClick={searchTrip} disabled={heroFrom === heroTo}>
                    <BusFront size={16} /> {text.searchBuses}
                  </button>
                  <small className="fare-note">{heroFrom === heroTo ? text.chooseDifferentStops : text.walkUpNote}</small>
                </div>
              </div>
            </div>
          </section>

          <section className="inner section">
            <div className="section-heading">
              <span className="kicker">{text.whyGramasetu}</span>
              <h2>{text.featureTitle}</h2>
              <p>{text.featureIntro}</p>
            </div>
            <div className="feature-grid">
              {[
                [Ticket, checkoutCopy[language].quickTicket, checkoutCopy[language].quickTicketDescription, 'checkout'],
                [MapPin, text.featureRoutes, text.featureRoutesDesc, 'routes'],
                [Clock, text.navSchedules, text.scheduleNotice, 'schedules'],
                [Navigation, text.featureTracking, text.featureTrackingDesc, 'track'],
              ].map(([Icon, title, desc, target]) => (
                <button className="feature feature-button" key={target} onClick={() => {
                  if (target === 'checkout') setCheckoutTrip(null);
                  setRouteSearch(null);
                  navigate(target);
                }}>
                  <span className="feature-icon"><Icon /></span>
                  <h3>{title}</h3>
                  <p>{desc}</p>
                </button>
              ))}
            </div>
          </section>

          <div className="illustrated-road" aria-hidden="true">
            <svg className="illustrated-bus" viewBox="0 0 120 62" focusable="false">
              <path d="M8 16a8 8 0 0 1 8-8h77a8 8 0 0 1 6 3l13 15v23a5 5 0 0 1-5 5h-3a11 11 0 0 0-22 0H43a11 11 0 0 0-22 0h-8a5 5 0 0 1-5-5V16Z" fill="#267450" />
              <path d="M19 14h25v18H15V18a4 4 0 0 1 4-4Zm31 0h28v18H50V14Zm34 0h10l12 14H84V14Z" fill="#deedf5" />
              <path d="M8 36h104v7H8z" fill="#f3d9a2" />
              <circle cx="32" cy="51" r="8" fill="#18243c" stroke="#f4f6fb" strokeWidth="3" />
              <circle cx="93" cy="51" r="8" fill="#18243c" stroke="#f4f6fb" strokeWidth="3" />
            </svg>
            {['first', 'second'].map(stop => (
              <svg key={stop} className={`illustrated-passenger ${stop}`} viewBox="0 0 20 30" focusable="false">
                <circle cx="10" cy="5" r="4" fill="#875638" />
                <path d="M10 11v8m0-5-6 4m6-4 6-2" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                <path d="m10 19-5 8m5-8 5 7" fill="none" stroke="#18243c" strokeWidth="3" strokeLinecap="round" />
              </svg>
            ))}
          </div>
          <section className="cta">
            <div className="inner">
              <h2>{text.ctaTitle}</h2>
              <p>{text.ctaText}</p>
              <button className="primary" onClick={() => { setRouteSearch(null); navigate('routes'); }}>{text.navRoutes} <ArrowRight size={18} /></button>
            </div>
          </section>
        </>
      )}

      {page === 'schedules' && (
        <main className="inner section">
          <div className="section-heading">
            <span className="kicker">{text.scheduleKicker}</span>
            <h2>{text.scheduleTitle}</h2>
            <p>{text.scheduleIntro}</p>
          </div>
          <div className="schedule-notice">
            <Info size={18} />
            <span>{text.scheduleNotice}</span>
          </div>
          <div className="schedule-grid">
            {scheduleDetails.map((schedule, index) => (
              <article className="panel schedule-card" key={schedule.from + schedule.to}>
                <div className="schedule-card-top">
                  <span className="route-id">ROUTE {String(index + 1).padStart(2, '0')}</span>
                  <span className="schedule-service">{language === 'te' ? schedule.serviceTe : schedule.service}</span>
                </div>
                <h3>{schedule.from}<ArrowRight size={17} />{schedule.to}</h3>
                {schedule.departures ? (
                  <>
                    <p className="schedule-label"><Clock size={15} /> {text.listedDepartures}</p>
                    <div className="departure-times">
                      {schedule.departures.map(time => <time key={time}>{time}</time>)}
                    </div>
                  </>
                ) : (
                  <p className="schedule-note">{schedule.note}</p>
                )}
                {schedule.return && <p className="schedule-note">{language === 'te' ? schedule.returnTe : schedule.return}</p>}
                {schedule.departures && schedule.note && <p className="schedule-note">{language === 'te' ? schedule.noteTe : schedule.note}</p>}
              </article>
            ))}
          </div>
        </main>
      )}

      {/* ── ROUTES ── */}
      {page === 'routes' && (
        <main className="inner section">
          <div className="section-heading">
            <span className="kicker">{text.routesKicker}</span>
            <h2>{text.routesTitle}</h2>
            <p>{totalRoutes} mandal routes covering {totalStops} stops across the Alluri Sitharama Raju district.</p>
          </div>
          {routeSearch && (
            <div className="schedule-notice">
              <span>{routeSearch.from} &#8594; {routeSearch.to}</span>
              <button type="button" className="outline" onClick={() => setRouteSearch(null)}>{text.showAllRoutes}</button>
            </div>
          )}
          {visibleRoutes.length === 0 && <p role="status">{text.noDirectRoute}</p>}
          {visibleRoutes.length > 0 && (
            <RouteMap
              routes={visibleRoutes}
              routeId={activeMapRouteId}
              onSelect={selectMapRoute}
              selectedStop={mapStop?.trip === routeSearch ? mapStop.name : null}
              trip={routeSearch}
              text={text}
            />
          )}
          <div className="route-grid">
            {visibleRoutes.map(r => (
              <div className="panel route-card route-card-selectable" key={r.id}>
                <div className="route-top">
                  <span className="route-id">{r.id}</span>
                  <BusFront color="#06b6d4" />
                </div>
                <h3>
                  <button type="button" className="route-card-map-button" aria-controls="route-map-panel"
                    aria-pressed={r.id === activeMapRouteId} onClick={() => openRouteMap(r.id)}>
                    {r.name}
                  </button>
                </h3>
                <p><MapPin size={17} /> {r.stops[0]} → {r.stops[r.stops.length - 1]}</p>
                <p><Clock size={17} /> {
                  r.frequency === 'Schedule not provided' ? text.scheduleUnavailable :
                    r.frequency === 'Paderu departures listed on Bus Timings page' ? text.paderuTimingNote :
                      r.frequency === 'Frequent services; exact times not provided' ? text.frequentNoExact : r.frequency
                }</p>
                {r.base != null && <p><Wallet size={17} /> {text.faresFrom} ₹{r.base}</p>}
                <p className="connectivity"><Route size={15} /> <em>{text.connectivity}: {r.connectivity}</em></p>
                <details>
                  <summary>{text.viewStops}</summary>
                  <ol>{r.stops.map(stop => (
                    <li key={stop}>
                      <button type="button" className="route-stop-button" aria-controls="route-map-panel"
                        onClick={() => openRouteMap(r.id, stop)}>
                        <MapPin size={15} aria-hidden="true" /> {stop}
                      </button>
                    </li>
                  ))}</ol>
                </details>
                {r.base != null && <button type="button" className="outline route-checkout" onClick={() => {
                  setCheckoutTrip({ routeId: r.id, ...routeSearch });
                  navigate('checkout');
                }}>
                  <Wallet size={16} aria-hidden="true" /> {checkoutCopy[language].title}
                </button>}
              </div>
            ))}
          </div>

          <div className="panel stops" style={{ marginTop: 25 }}>
            <h3>{text.allStops} ({totalStops})</h3>
            <div className="stop-list">
              {allStops.map((s, i) => (
                <span key={s}><span className="dot">{i + 1}</span>{s}</span>
              ))}
            </div>
          </div>
        </main>
      )}


      {page === 'checkout' && <FareCheckout routes={routes} initialTrip={checkoutTrip} language={language} />}
      {page === 'admin' && <AdminDashboard routes={routes} language={language} />}

      {/* ── TRACK BUS ── */}
      {page === 'track' && <LiveTracker routes={routes} fleet={demoFleet} language={language} />}

      {/* ── STATUS ── */}
      {page === 'status' && (
        <main className="inner section">
          <div className="section-heading">
            <span className="kicker">{text.statusKicker}</span>
            <h2>{text.statusTitle}</h2>
            <p>{text.statusIntro}</p>
          </div>
          <div className="status-notice">
            <Info size={18} />
            <span>{text.statusNotice}</span>
          </div>
          <section className="status-group">
            <div className="status-group-heading">
              <h3>{text.busServiceStatus}</h3>
              <span className="demo-tag">{text.simulated}</span>
            </div>
            <div className="table-wrap panel status-table-wrap">
              <table className="status-table">
                <thead>
                  <tr><th>{text.vehicleNumber}</th><th>{text.driver}</th><th>{text.serviceStatus}</th><th>{text.capacity}</th><th>{text.traveling}</th><th>{text.emptySeats}</th></tr>
                </thead>
                <tbody>
                  {demoFleet.map(bus => (
                    <tr key={bus.id}>
                      <td>{bus.vehicleNumber}</td>
                      <td>{bus.driverName}</td>
                      <td><span className="status-simulated">{text.simulated}</span></td>
                      <td>{bus.seatCapacity}</td>
                      <td>{bus.passengers}</td>
                      <td>{Math.max(0, bus.seatCapacity - bus.passengers)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      )}

      <footer>
        <div className="inner footer-inner">
          <div className="brand footer-brand">
            <img className="brandmark" src={import.meta.env.BASE_URL + "gramasetu-brand.png"} width="52" height="52" alt="" />
            <span>{text.brandName}</span>
          </div>
          <p>{text.walkUpFooter}</p>
          <span>© 2026 {text.brandName}</span>
        </div>
      </footer>
    </>
  );
}

function GuideLoader() {
  const [guide, setGuide] = useState(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const language = initialLanguage();
  const text = translations[language];

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/guide', { signal: controller.signal })
      .then(response => {
        // Static previews serve the built app without the Node API.
        if (response.status === 404 || response.headers.get('content-type')?.includes('text/html')) {
          return import('../server/guide-data.js').then(({ guide }) => guide);
        }
        if (!response.ok) throw new Error('Guide request failed');
        return response.json();
      })
      .then(data => {
        if (!controller.signal.aborted) setGuide(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [attempt]);

  if (guide) return <App guide={guide} />;
  return (
    <main className="inner section" lang={language}>
      <p role="status">{failed ? text.guideLoadFailed : text.guideLoading}</p>
      {failed && (
        <button className="primary" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>
          {text.guideRetry}
        </button>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<GuideLoader />);
