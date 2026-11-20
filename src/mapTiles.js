const googleMapsKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
const keyParam = googleMapsKey ? `&key=${googleMapsKey}` : '';

// Google Maps Tile Layer for Leaflet (Roadmap / Satellite / Terrain)
export const mapTiles = {
  url: `https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}${keyParam}`,
  maxZoom: 20,
  attribution: '&copy; <a href="https://maps.google.com" target="_blank" rel="noopener noreferrer">Google Maps</a>',
};

export const googleSatelliteTiles = {
  url: `https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}${keyParam}`,
  maxZoom: 20,
  attribution: '&copy; <a href="https://maps.google.com" target="_blank" rel="noopener noreferrer">Google Maps</a>',
};

export const googleTerrainTiles = {
  url: `https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}${keyParam}`,
  maxZoom: 20,
  attribution: '&copy; <a href="https://maps.google.com" target="_blank" rel="noopener noreferrer">Google Maps</a>',
};
