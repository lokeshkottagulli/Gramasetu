import React, { useEffect } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { divIcon } from 'leaflet';
import { STOP_COORDS } from './LiveTracker.jsx';
import { mapTiles } from './mapTiles.js';

function pinIcon(type) {
  return divIcon({
    className: `route-map-pin route-map-pin-${type}`,
    html: '<span></span>',
    iconSize: type === 'stop' ? [20, 23] : [30, 34],
    iconAnchor: type === 'stop' ? [10, 20] : [15, 30],
    tooltipAnchor: type === 'stop' ? [0, -17] : [0, -24],
  });
}

const boardingPin = pinIcon('boarding');
const destinationPin = pinIcon('destination');
const stopPin = pinIcon('stop');

function FocusStop({ stop }) {
  const map = useMap();
  useEffect(() => {
    if (stop && Object.hasOwn(STOP_COORDS, stop)) {
      map.setView(STOP_COORDS[stop], 15);
    }
  }, [map, stop]);
  return null;
}

export default function RouteMap({ routes, routeId, onSelect, trip, selectedStop, text }) {
  const route = routes.find(candidate => candidate.id === routeId) ?? routes[0];
  const fromIndex = trip ? route.stops.indexOf(trip.from) : 0;
  const toIndex = trip ? route.stops.indexOf(trip.to) : route.stops.length - 1;
  const tripStops = route.stops.slice(Math.min(fromIndex, toIndex), Math.max(fromIndex, toIndex) + 1);
  const stops = selectedStop && !tripStops.includes(selectedStop) ? [...route.stops] : tripStops;
  if (fromIndex > toIndex) stops.reverse();
  const mappedStops = stops.filter(stop => Object.hasOwn(STOP_COORDS, stop));
  const positions = mappedStops.map(stop => STOP_COORDS[stop]);

  return (
    <section id="route-map-panel" className="panel route-map-panel" aria-label={text.routeMapTitle}>
      <label htmlFor="route-map-select">{text.routeMapTitle}</label>
      <select id="route-map-select" value={route.id} onChange={event => onSelect(event.target.value)}>
        {routes.map(option => <option key={option.id} value={option.id}>{option.id} · {option.name}</option>)}
      </select>
      {positions.length > 1 ? (
        <>
          <p>{stops[0]} → {stops[stops.length - 1]}</p>
          <p>{text.routeMapApproximate}</p>
          <MapContainer
            key={JSON.stringify([route.id, stops, selectedStop])}
            className="route-map"
            bounds={positions}
            boundsOptions={{ padding: [24, 24], maxZoom: 15 }}
            scrollWheelZoom={false}
          >
            <TileLayer {...mapTiles} />
            <FocusStop stop={selectedStop} />
            <Polyline positions={positions} pathOptions={{ color: '#554d43', weight: 6, dashArray: '1 11', lineCap: 'round' }} />
            {mappedStops.map((stop, index) => {
              const pin = stop === stops[0] ? boardingPin :
                stop === stops[stops.length - 1] ? destinationPin : stopPin;
              return (
                <Marker key={stop} position={positions[index]} icon={pin} alt={stop} title={stop}>
                  <Tooltip permanent={stop === selectedStop}>{stop}</Tooltip>
                </Marker>
              );
            })}
          </MapContainer>
        </>
      ) : <p>{text.routeMapUnavailable}</p>}
    </section>
  );
}
