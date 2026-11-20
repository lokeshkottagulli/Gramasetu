import React, { useEffect, useRef, useState } from 'react';

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID?.trim() || 'DEMO_MAP_ID';
const authFailureEvent = 'giri-google-maps-auth-failure';
const center = { lat: 18, lng: 82.5 };
export const googleTrackingConfigured = Boolean(apiKey);

let libraries;
let authenticationFailed = false;
function loadGoogleMaps() {
  if (authenticationFailed) return Promise.reject(new Error('Google Maps authentication failed'));
  libraries ??= new Promise((resolve, reject) => {
    if (window.google?.maps?.importLibrary) {
      resolve(window.google.maps);
      return;
    }

    const callback = 'giriGoogleMapsReady';
    const script = document.createElement('script');
    const previousAuthFailure = window.gm_authFailure;
    function finish(error) {
      clearTimeout(timeout);
      window.removeEventListener(authFailureEvent, failedAuth);
      delete window[callback];
      if (error) {
        script.remove();
        window.gm_authFailure = previousAuthFailure;
        reject(error);
      } else {
        resolve(window.google.maps);
      }
    }
    const failedAuth = () => finish(new Error('Google Maps authentication failed'));
    const timeout = setTimeout(() => finish(new Error('Google Maps load timed out')), 12000);
    window.addEventListener(authFailureEvent, failedAuth, { once: true });
    window.gm_authFailure = () => {
      authenticationFailed = true;
      window.dispatchEvent(new Event(authFailureEvent));
      previousAuthFailure?.();
    };
    window[callback] = () => finish();
    script.async = true;
    script.onerror = () => finish(new Error('Google Maps failed to load'));
    script.src = 'https://maps.googleapis.com/maps/api/js?' + new URLSearchParams({
      key: apiKey, callback, loading: 'async', v: 'quarterly', region: 'IN',
    });
    document.head.append(script);
  }).then(async maps => {
    const [mapLibrary, markerLibrary, coreLibrary] = await Promise.all([
      maps.importLibrary('maps'), maps.importLibrary('marker'), maps.importLibrary('core'),
    ]);
    return { ...mapLibrary, ...markerLibrary, ...coreLibrary };
  }).catch(error => {
    libraries = undefined;
    throw error;
  });
  return libraries;
}

function toPosition([lat, lng]) {
  return { lat, lng };
}

function markerContent(kind, icon = '') {
  const content = document.createElement('span');
  content.className = 'google-track-pin google-track-pin-' + kind;
  content.textContent = icon;
  content.setAttribute('aria-hidden', 'true');
  return content;
}

function mapMarker(layer, point, title, kind, icon, describe) {
  const marker = new layer.AdvancedMarkerElement({
    map: layer.map, position: toPosition(point), title, gmpClickable: true,
    zIndex: kind === 'bus' ? 3 : kind === 'user' ? 2 : 1,
  });
  marker.append(markerContent(kind, icon));
  const listener = marker.addListener('click', () => {
    const content = document.createElement('div');
    for (const line of describe()) {
      const row = document.createElement('div');
      row.textContent = line;
      content.append(row);
    }
    layer.info.setContent(content);
    layer.info.open({ map: layer.map, anchor: marker });
  });
  return { marker, remove() { listener.remove(); marker.map = null; } };
}

export default function GoogleTrackingMap({ route, routeCoords, stops, buses, userPos, followUser, text, onError }) {
  const container = useRef(null);
  const busMarkers = useRef(new Map());
  const userMarker = useRef(null);
  const [layer, setLayer] = useState(null);

  useEffect(() => {
    let active = true;
    let info;
    const element = container.current;
    window.addEventListener(authFailureEvent, onError);
    loadGoogleMaps().then(api => {
      if (!active) return;
      const map = new api.Map(element, {
        center, zoom: 10, maxZoom: 18, mapId, gestureHandling: 'greedy',
        streetViewControl: false, mapTypeControl: false,
      });
      info = new api.InfoWindow();
      setLayer({ ...api, map, info });
    }).catch(() => { if (active) onError(); });
    return () => {
      active = false;
      info?.close();
      window.removeEventListener(authFailureEvent, onError);
      element.replaceChildren();
    };
  }, [onError]);

  useEffect(() => {
    if (!layer) return;
    const line = new layer.Polyline({
      map: layer.map, path: routeCoords.map(toPosition),
      strokeColor: '#06b6d4', strokeOpacity: 0.85, strokeWeight: 4, clickable: false,
    });
    const markers = stops.map(({ name, pos }, index) => mapMarker(
      layer, pos, name, index === 0 || index === stops.length - 1 ? 'terminus' : 'stop', '',
      () => [name, text.stopCount.replace('{current}', index + 1).replace('{total}', stops.length), route.id + ' — ' + route.name],
    ));
    return () => {
      layer.info.close();
      line.setMap(null);
      markers.forEach(marker => marker.remove());
    };
  }, [layer, route, routeCoords, stops, text]);

  useEffect(() => {
    if (!layer) return;
    if (followUser && userPos) {
      layer.map.panTo(toPosition(userPos));
      return;
    }
    const points = userPos ? [...routeCoords, userPos] : routeCoords;
    if (points.length > 1) {
      const bounds = new layer.LatLngBounds();
      points.forEach(point => bounds.extend(toPosition(point)));
      layer.map.fitBounds(bounds, 40);
    } else if (points.length === 1) {
      layer.map.setCenter(toPosition(points[0]));
      layer.map.setZoom(14);
    }
  }, [layer, routeCoords, userPos, followUser]);

  useEffect(() => {
    if (!layer) return;
    const current = userMarker.current;
    if (!userPos) {
      current?.remove();
      userMarker.current = null;
    } else if (current) {
      current.marker.position = toPosition(userPos);
      current.circle.setCenter(toPosition(userPos));
    } else {
      const location = mapMarker(layer, userPos, text.yourLocation, 'user', '', () => [text.yourLocation]);
      const circle = new layer.Circle({
        map: layer.map, center: toPosition(userPos), radius: 300,
        strokeColor: '#3b82f6', strokeWeight: 1, fillColor: '#3b82f6', fillOpacity: 0.1, clickable: false,
      });
      userMarker.current = { ...location, circle, remove() { location.remove(); circle.setMap(null); } };
    }
  }, [layer, userPos, text]);

  useEffect(() => {
    if (!layer) return;
    const active = new Set();
    for (const bus of buses) {
      if (!bus.position) continue;
      active.add(bus.id);
      let entry = busMarkers.current.get(bus.id);
      if (!entry) {
        const describe = () => {
          const current = entry.bus;
          return [current.label, text.vehicle + ' ' + current.vehicleNumber, text.driver + ' ' + current.driverName,
            text.seats + ' ' + current.passengers + '/' + current.seatCapacity + ' ' + text.occupied,
            text.nearStop + ' ' + current.nearStop, text.nextStop + ' ' + current.nextStop,
            text.speed + ' ' + current.speedKmh + ' km/h', current.directionText];
        };
        entry = mapMarker(layer, bus.position, bus.label, 'bus', '🚌', describe);
        busMarkers.current.set(bus.id, entry);
      }
      entry.bus = bus;
      entry.marker.position = toPosition(bus.position);
    }
    for (const [id, entry] of busMarkers.current) {
      if (!active.has(id)) {
        entry.remove();
        busMarkers.current.delete(id);
      }
    }
  }, [layer, buses, text]);

  useEffect(() => () => {
    userMarker.current?.remove();
    userMarker.current = null;
    busMarkers.current.forEach(marker => marker.remove());
    busMarkers.current.clear();
  }, [layer, text]);

  return (
    <div className="google-track-wrap">
      <div ref={container} className="google-track-map" aria-label={text.googleTrackingMap} />
      {!layer && <p role="status" className="google-track-loading">{text.googleMapsLoading}</p>}
    </div>
  );
}
