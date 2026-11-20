import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { translations } from './translations.js';
import { mapTiles } from './mapTiles.js';
import GoogleTrackingMap, { googleTrackingConfigured } from './GoogleTrackingMap.jsx';

/* ───────────────────────────────────────────────────────────────
   GEO-COORDINATES FOR ASR DISTRICT STOPS
   Real approximate lat/lng for each stop in the mandal routes.
   ─────────────────────────────────────────────────────────────── */
export const STOP_COORDS = {
  // ── Paderu Mandal (ASR-01) ──
  'Paderu RTC Complex': [17.9570, 82.6500],
  'Paderu Junction': [17.9530, 82.6540],
  'Modamamba Junction': [17.9400, 82.6350],
  'Gonduru': [17.9200, 82.6100],
  'Minumuluru': [17.8900, 82.5800],
  'Vantlamamidi': [17.8600, 82.5500],
  'Visakhapatnam': [17.6868, 83.2185],
  'Anakapalli': [17.6910, 83.0040],
  'Araku': [18.3270, 82.8760],
  'Chintapalli': [17.7850, 82.0260],

  // ── Araku Valley (ASR-02) ──
  'Araku RTC Complex': [18.3290, 82.8750],
  'Araku Junction': [18.3250, 82.8780],
  'Padmapuram': [18.3130, 82.8650],
  'Chompi': [18.3000, 82.8400],
  'Sunkarametta': [18.2800, 82.8200],
  'Madagada': [18.2600, 82.8000],
  'Rajahmundry': [17.0005, 81.8040],
  'Vizianagaram': [18.1066, 83.3956],

  // ── Ananthagiri (ASR-03) ──
  'Ananthagiri Bus Stop': [18.2340, 82.9960],
  'Kasipatnam': [18.2100, 82.9700],
  'Borra Junction (Borra Caves)': [18.2750, 83.0370],
  'Damuku': [18.2500, 83.0100],
  'Tyda': [18.1800, 83.0500],
  'Chilakalagadda': [18.1500, 83.0800],
  'Visakhapatnam (via S. Kota)': [17.7500, 83.1800],

  // ── Dumbriguda (ASR-04) ──
  'Dumbriguda Bus Stop': [18.4600, 82.8400],
  'Killoguda': [18.4300, 82.8550],
  'Araku-Dumbriguda Road Junction': [18.3900, 82.8650],
  'Paderu': [17.9560, 82.6510],
  'Koraput (Odisha border)': [18.8120, 82.7110],

  // ── Hukumpeta (ASR-05) ──
  'Hukumpeta Bus Stop': [18.0800, 82.5000],
  'Sukuru': [18.0500, 82.5200],
  'Kontili': [18.0200, 82.5500],
  'Bakuru Road Junction': [17.9900, 82.5800],
  'Dumbriguda': [18.4580, 82.8390],

  // ── Pedabayalu (ASR-06) ──
  'Pedabayalu Bus Stop': [18.0900, 82.4600],
  'Gomangi': [18.0600, 82.4800],
  'Rudakota': [18.0300, 82.5100],
  'Kinchavanipalem': [18.0000, 82.5400],
  'Munchingput': [18.1700, 82.3200],

  // ── Munchingput (ASR-07) ──
  'Munchingput Bus Stop': [18.1750, 82.3250],
  'Jolaput': [18.2000, 82.3000],
  'Kilagada': [18.2300, 82.2800],
  'Baramanaguda': [18.2600, 82.2600],
  'Pedabayalu': [18.0920, 82.4620],
  'Odisha Border': [18.3200, 82.2200],

  // ── G. Madugula (ASR-08) ──
  'G. Madugula Bus Stop': [17.8900, 82.3800],
  'Nurmathi': [17.8700, 82.4000],
  'Gemmeli': [17.8500, 82.4300],
  'Gaduthuru': [17.8300, 82.4600],

  // ── Chintapalli (ASR-09) ──
  'Chintapalli RTC Bus Stand': [17.7870, 82.0280],
  'Lambasingi Junction': [17.8000, 82.1000],
  'Tajangi': [17.7700, 82.0500],
  'Lothugedda': [17.7500, 82.0700],
  'Narsipatnam': [17.6660, 82.6130],
  'Sileru': [18.1800, 81.8600],

  // ── G.K. Veedhi (ASR-10) ──
  'Gudem Kotha Veedhi Bus Stop': [17.9000, 81.7500],
  'Dharakonda': [17.9300, 81.7800],
  'Donkarayi': [18.1200, 81.8200],
  'R.V. Nagar': [18.0500, 81.8400],
  'Bhadrachalam': [17.6690, 80.8930],

  // ── Koyyuru (ASR-11) ──
  'Koyyuru Bus Stop': [17.6300, 82.4000],
  'Mampa': [17.6500, 82.4300],
  'Rajendrapalem': [17.6700, 82.4600],
  'Cheedikada Junction': [17.6900, 82.5000],
};

/* ─── Distance helper (Haversine km) ─── */
function calcDistanceKm(a, b) {
  if (!a || !b) return 0;
  const R = 6371;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLon = (b[1] - a[1]) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/* ─── Custom map icons ─── */
const createIcon = (color, size = 12) =>
  L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};border:2.5px solid #fff;
      box-shadow:0 2px 8px rgba(0,0,0,.35);
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });

const busIcon = L.divIcon({
  className: '',
  html: `<div style="
    display:flex;align-items:center;justify-content:center;
    width:36px;height:36px;border-radius:50%;
    background:#06b6d4;border:3px solid #fff;
    box-shadow:0 3px 12px rgba(0,0,0,.4);
    color:#fff;font-size:18px;
    transition:transform 0.3s ease-out;
  ">🚌</div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

const userIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:18px;height:18px;border-radius:50%;
    background:#3b82f6;border:3px solid #fff;
    box-shadow:0 0 0 6px rgba(59,130,246,.25),0 3px 12px rgba(0,0,0,.35);
    animation:pulse-user 2s infinite;
  "></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const stopIcon = createIcon('#ef4444', 10);
const stopIconGreen = createIcon('#10b981', 13);

/* ─── Component to auto-fit the map to bounds ─── */
function FitBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [bounds, map]);
  return null;
}

/* ─── Component to re-center when user location changes ─── */
function PanToUser({ position, shouldPan }) {
  const map = useMap();
  useEffect(() => {
    if (shouldPan && position) {
      map.setView(position, map.getZoom());
    }
  }, [position, shouldPan, map]);
  return null;
}

/* ═══════════════════════════════════════════════════════════════
   LIVE TRACKER COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function LiveTracker({ routes, fleet, language = 'en' }) {
  const text = translations[language];
  const [trackRoute, setTrackRoute] = useState(routes[0].id);
  const [userPos, setUserPos] = useState(null);
  const [gpsError, setGpsError] = useState('');
  const [followUser, setFollowUser] = useState(false);
  const [googleMapsFailed, setGoogleMapsFailed] = useState(false);
  const useFallbackMap = useCallback(() => setGoogleMapsFailed(true), []);
  const [buses, setBuses] = useState([]);
  const [simSpeed, setSimSpeed] = useState(3); // 1 = Real-time 35km/h, 3 = Calm cruise (Default), 8 = Fast preview, 0 = Pause
  const watchId = useRef(null);
  const animFrame = useRef(null);
  const simSpeedRef = useRef(simSpeed);

  useEffect(() => {
    simSpeedRef.current = simSpeed;
  }, [simSpeed]);

  const route = useMemo(() => routes.find(r => r.id === trackRoute) || routes[0], [trackRoute, routes]);

  /* Get the coordinate path for the selected route */
  const routeCoords = useMemo(() => {
    return route.stops
      .map(s => STOP_COORDS[s])
      .filter(Boolean);
  }, [route]);

  const stopMarkers = useMemo(() => {
    return route.stops
      .map(name => ({ name, pos: STOP_COORDS[name] }))
      .filter(m => m.pos);
  }, [route]);

  /* Build physical segment road lengths in kilometers */
  const routeSegments = useMemo(() => {
    if (routeCoords.length < 2) return { totalKm: 1, segments: [] };
    let cum = 0;
    const segments = [];
    for (let i = 0; i < routeCoords.length - 1; i++) {
      const len = calcDistanceKm(routeCoords[i], routeCoords[i + 1]);
      segments.push({
        from: routeCoords[i],
        to: routeCoords[i + 1],
        startKm: cum,
        lenKm: len,
        endKm: cum + len,
        fromStop: route.stops[i] || '',
        toStop: route.stops[i + 1] || '',
      });
      cum += len;
    }
    return { totalKm: Math.max(cum, 1), segments };
  }, [routeCoords, route.stops]);

  /* Interpolate position along the physical route at exact kilometer */
  const getPositionAtKm = useCallback((distKm, segments, totalKm) => {
    if (!segments || segments.length === 0) return routeCoords[0] || [18.0, 82.5];
    const clamped = Math.max(0, Math.min(distKm, totalKm));
    for (const seg of segments) {
      if (clamped >= seg.startKm && clamped <= seg.endKm) {
        const t = seg.lenKm > 0 ? (clamped - seg.startKm) / seg.lenKm : 0;
        return [
          seg.from[0] + (seg.to[0] - seg.from[0]) * t,
          seg.from[1] + (seg.to[1] - seg.from[1]) * t,
        ];
      }
    }
    return segments[segments.length - 1].to;
  }, [routeCoords]);

  /* ── Live GPS tracking (Passenger's real location) ── */
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError(text.gpsUnsupported);
      return;
    }

    watchId.current = navigator.geolocation.watchPosition(
      pos => {
        setUserPos([pos.coords.latitude, pos.coords.longitude]);
        setGpsError('');
      },
      err => {
        switch (err.code) {
          case 1: setGpsError(text.gpsDenied); break;
          case 2: setGpsError(text.gpsPositionUnavailable); break;
          case 3: setGpsError(text.gpsTimeout); break;
          default: setGpsError(text.gpsUnknown);
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );

    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, [text]);

  /* ── Realistic Bus Movement Simulation ── */
  useEffect(() => {
    if (routeCoords.length < 2 || routeSegments.segments.length === 0) return;

    const totalKm = routeSegments.totalKm;
    const originStop = route.stops[0];
    const termStop = route.stops[route.stops.length - 1];

    /* Spawn 2 buses:
       Bus A: starts at 15% of the route, moving outbound towards destination
       Bus B: starts at 75% of the route, moving inbound towards origin
    */
    const busList = [
      {
        ...fleet[0],
        id: route.id + '-A',
        label: route.id + ' Bus A',
        distKm: totalKm * 0.15,
        dir: 1, // 1 = forward, -1 = return
        baseSpeedKmh: 36, // realistic 36 km/h bus speed
        speedKmh: 36,
        dwellTimer: 0,
        position: getPositionAtKm(totalKm * 0.15, routeSegments.segments, totalKm),
        nearStop: originStop,
        nextStop: route.stops[1] || termStop,
        directionText: `Toward ${termStop}`,
        statusText: 'Moving',
      },
      {
        ...fleet[1],
        id: route.id + '-B',
        label: route.id + ' Bus B',
        distKm: totalKm * 0.75,
        dir: -1,
        baseSpeedKmh: 38,
        speedKmh: 38,
        dwellTimer: 0,
        position: getPositionAtKm(totalKm * 0.75, routeSegments.segments, totalKm),
        nearStop: termStop,
        nextStop: originStop,
        directionText: `Toward ${originStop}`,
        statusText: 'Moving',
      },
    ];

    let lastTime = performance.now();
    let lastRenderTime = 0;

    function animate(now) {
      const dt = Math.min((now - lastTime) / 1000, 0.1); // clamped delta time in seconds
      lastTime = now;

      const currentSimSpeed = simSpeedRef.current;

      busList.forEach(bus => {
        if (currentSimSpeed === 0) {
          // Paused
          bus.speedKmh = 0;
          bus.statusText = 'Paused';
          return;
        }

        // Handle temporary dwell at terminus
        if (bus.dwellTimer > 0) {
          bus.dwellTimer -= dt * currentSimSpeed;
          bus.speedKmh = 0;
          bus.statusText = 'At terminus (turnaround)';
          return;
        }

        // Effective speed in km per second (36 km/h = 0.010 km/s)
        const effectiveSpeedKmh = bus.baseSpeedKmh * currentSimSpeed;
        bus.speedKmh = Math.round(effectiveSpeedKmh);
        bus.statusText = `${bus.speedKmh} km/h`;

        const speedKmPerSec = effectiveSpeedKmh / 3600;
        bus.distKm += speedKmPerSec * dt * bus.dir;

        // Turnaround at terminus with brief pause
        if (bus.distKm >= totalKm) {
          bus.distKm = totalKm;
          bus.dir = -1;
          bus.dwellTimer = 4; // brief turnaround pause
          bus.directionText = `Toward ${originStop}`;
        } else if (bus.distKm <= 0) {
          bus.distKm = 0;
          bus.dir = 1;
          bus.dwellTimer = 4;
          bus.directionText = `Toward ${termStop}`;
        }

        // Update exact coordinates
        bus.position = getPositionAtKm(bus.distKm, routeSegments.segments, totalKm);

        // Find nearest stop and next stop
        let minDist = Infinity;
        let nearest = route.stops[0];
        let nearestIdx = 0;

        stopMarkers.forEach((s, idx) => {
          const d = Math.hypot(s.pos[0] - bus.position[0], s.pos[1] - bus.position[1]);
          if (d < minDist) {
            minDist = d;
            nearest = s.name;
            nearestIdx = idx;
          }
        });
        bus.nearStop = nearest;

        // Next stop calculation
        const nextIdx = bus.dir === 1 ? Math.min(nearestIdx + 1, route.stops.length - 1) : Math.max(nearestIdx - 1, 0);
        bus.nextStop = route.stops[nextIdx] || (bus.dir === 1 ? termStop : originStop);
      });

      // Throttle React state re-renders to ~20-30 fps for smooth rendering without high CPU usage
      if (now - lastRenderTime >= 40) {
        setBuses(busList.map(b => ({ ...b })));
        lastRenderTime = now;
      }

      animFrame.current = requestAnimationFrame(animate);
    }

    animFrame.current = requestAnimationFrame(animate);

    return () => {
      if (animFrame.current) cancelAnimationFrame(animFrame.current);
    };
  }, [trackRoute, routeCoords, routeSegments, stopMarkers, route.id, route.stops, getPositionAtKm, fleet]);

  /* ── ETA helper (calculated at realistic 35 km/h bus speed) ── */
  const etaMin = useCallback((km) => {
    if (km == null) return '—';
    const mins = Math.round((km / 35) * 60);
    if (mins < 1) return '< 1 min';
    if (mins >= 120) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    return `${mins} min`;
  }, []);

  /* bounds for initial fit */
  const mapBounds = useMemo(() => {
    const pts = [...routeCoords];
    if (userPos) pts.push(userPos);
    return pts;
  }, [routeCoords, userPos]);

  return (
    <main className="inner section">
      <div className="section-heading">
        <span className="kicker">{text.trackKicker}</span>
        <h2>{text.trackTitle}</h2>
        <p>{text.trackIntro}</p>
      </div>

      {/* Controls */}
      <div className="tracker-controls panel">
        <div className="tracker-row">
          <div className="tracker-field">
            <label>{text.selectTrackRoute}</label>
            <select value={trackRoute} onChange={e => setTrackRoute(e.target.value)}>
              {routes.map(r => (
                <option key={r.id} value={r.id}>
                  {r.id} — {r.name}
                </option>
              ))}
            </select>
          </div>

          <div className="tracker-field" style={{ maxWidth: '300px' }}>
            <label>{text.simulationSpeed}</label>
            <div className="speed-buttons">
              <button
                type="button"
                className={simSpeed === 1 ? 'active' : ''}
                onClick={() => setSimSpeed(1)}
                title={text.normalSpeedHint}
              >
                {text.normalSpeed}
              </button>
              <button
                type="button"
                className={simSpeed === 3 ? 'active' : ''}
                onClick={() => setSimSpeed(3)}
                title={text.calmSpeedHint}
              >
                {text.calmSpeed}
              </button>
              <button
                type="button"
                className={simSpeed === 8 ? 'active' : ''}
                onClick={() => setSimSpeed(8)}
                title={text.fastSpeedHint}
              >
                {text.fastSpeed}
              </button>
              <button
                type="button"
                className={simSpeed === 0 ? 'active' : ''}
                onClick={() => setSimSpeed(0)}
                title={text.pause}
                aria-label={text.pause}
              >
                ⏸
              </button>
            </div>
          </div>

          <div className="tracker-field" style={{ flex: '0 0 auto' }}>
            <label>&nbsp;</label>
            <button
              type="button"
              className={followUser ? 'primary' : 'outline'}
              onClick={() => setFollowUser(!followUser)}
              style={{ whiteSpace: 'nowrap' }}
            >
              📍 {followUser ? text.followingMe : text.centerOnMe}
            </button>
          </div>
        </div>

        {gpsError && <p className="gps-error">⚠️ {gpsError}</p>}

        {/* Bus info cards */}
        <div className="bus-cards">
          {buses.map(bus => {
            const d = userPos ? calcDistanceKm(userPos, bus.position) : null;
            return (
              <div className="bus-card" key={bus.id}>
                <div className="bus-card-header">
                  <span>🚌</span>
                  <strong>{bus.label}</strong>
                  <span
                    className="bus-status"
                    style={{ color: bus.speedKmh > 0 ? '#10b981' : '#f59e0b' }}
                  >
                    ● {bus.speedKmh > 0 ? `${bus.speedKmh} km/h` : text.atStop}
                  </span>
                </div>
                <div className="bus-card-body">
                  <div>
                    <small>{text.nearStop}</small>
                    <span title={bus.nearStop}>{bus.nearStop}</span>
                  </div>
                  <div>
                    <small>{text.distanceFromYou}</small>
                    <span>{d != null ? `${d.toFixed(1)} km` : '—'}</span>
                  </div>
                  <div>
                    <small>{text.etaToStop}</small>
                    <span>{etaMin(d)}</span>
                  </div>
                  <div>
                    <small>{text.heading}</small>
                    <span title={bus.directionText}>{bus.directionText}</span>
                  </div>
                  <div>
                    <small>{text.nextStop}</small>
                    <span title={bus.nextStop}>{bus.nextStop}</span>
                  </div>
                  <div>
                    <small>{text.routeDistance}</small>
                    <span>{routeSegments.totalKm.toFixed(0)} km total</span>
                  </div>
                  <div>
                    <small>{text.vehicleNumber}</small>
                    <span>{bus.vehicleNumber}</span>
                  </div>
                  <div>
                    <small>{text.driver}</small>
                    <span>{bus.driverName}</span>
                  </div>
                  <div>
                    <small>{text.capacity}</small>
                    <span>{bus.seatCapacity} seats</span>
                  </div>
                  <div>
                    <small>{text.passengersTraveling}</small>
                    <span>{bus.passengers}</span>
                  </div>
                  <div>
                    <small>{text.emptySeats}</small>
                    <span>{Math.max(0, bus.seatCapacity - bus.passengers)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Map */}
      <div className="tracker-map-wrap panel">
        {googleMapsFailed && <p role="status" className="google-track-fallback">{text.googleMapsFallback}</p>}
        {googleTrackingConfigured && !googleMapsFailed ? (
          <GoogleTrackingMap route={route} routeCoords={routeCoords} stops={stopMarkers} buses={buses}
            userPos={userPos} followUser={followUser} text={text} onError={useFallbackMap} />
        ) : <MapContainer
          center={routeCoords[0] || [18.0, 82.5]}
          zoom={10}
          scrollWheelZoom={true}
          style={{ height: '520px', width: '100%', borderRadius: '12px' }}
        >
          <TileLayer {...mapTiles} />

          <FitBounds bounds={mapBounds} />
          <PanToUser position={userPos} shouldPan={followUser} />

          {/* Route polyline */}
          {routeCoords.length >= 2 && (
            <Polyline
              positions={routeCoords}
              pathOptions={{ color: '#06b6d4', weight: 4, opacity: 0.7, dashArray: '8 6' }}
            />
          )}

          {/* Stop markers */}
          {stopMarkers.map((s, i) => (
            <Marker
              key={s.name}
              position={s.pos}
              icon={i === 0 || i === stopMarkers.length - 1 ? stopIconGreen : stopIcon}
            >
              <Popup>
                <strong>{s.name}</strong><br />
                <small>{text.stopCount.replace('{current}', i + 1).replace('{total}', stopMarkers.length)}</small><br />
                <small style={{ color: '#6b7280' }}>{route.id} — {route.name}</small>
              </Popup>
            </Marker>
          ))}

          {/* User location */}
          {userPos && (
            <>
              <Circle
                center={userPos}
                radius={300}
                pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.1, weight: 1 }}
              />
              <Marker position={userPos} icon={userIcon}>
                <Popup><strong>📍 {text.yourLocation}</strong></Popup>
              </Marker>
            </>
          )}

          {/* Bus markers */}
          {buses.map(bus => bus.position && (
            <Marker key={bus.id} position={bus.position} icon={busIcon}>
              <Popup>
                <strong>🚌 {bus.label}</strong><br />
                {text.vehicle}: {bus.vehicleNumber}<br />
                {text.driver}: {bus.driverName}<br />
                {text.seats}: {bus.passengers}/{bus.seatCapacity} {text.occupied} ({Math.max(0, bus.seatCapacity - bus.passengers)} {text.empty})<br />
                {text.nearStop}: {bus.nearStop}<br />
                {text.nextStop}: {bus.nextStop}<br />
                {text.speed}: {bus.speedKmh} km/h<br />
                <small style={{ color: '#6b7280' }}>{bus.directionText}</small>
              </Popup>
            </Marker>
          ))}
        </MapContainer>}

        {/* Legend */}
        <div className="map-legend">
          <span><span className="legend-dot" style={{ background: '#3b82f6' }}></span> {text.yourLocation}</span>
          <span><span className="legend-dot" style={{ background: '#06b6d4' }}></span> {text.busSimulated}</span>
          <span><span className="legend-dot" style={{ background: '#10b981' }}></span> {text.originTerminus}</span>
          <span><span className="legend-dot" style={{ background: '#ef4444' }}></span> {text.enRouteStop}</span>
        </div>
      </div>

      <p className="disclaimer" style={{ maxWidth: 790, margin: '20px auto 0' }}>
        ⓘ {text.trackingDisclaimer}
      </p>
    </main>
  );
}
