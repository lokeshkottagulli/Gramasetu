const apiKey = import.meta.env.VITE_GEOAPIFY_API_KEY;
const openStreetMapCredit = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const mapTiles = {
  url: apiKey
    ? `https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}{r}.png?apiKey=${encodeURIComponent(apiKey)}`
    : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: apiKey
    ? `Powered by <a href="https://www.geoapify.com/">Geoapify</a> | &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> | ${openStreetMapCredit}`
    : openStreetMapCredit,
};
