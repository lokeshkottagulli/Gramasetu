import { guide } from './guide-data.js';
import { handleCheckout, productionFares } from './checkout.js';
import { handleAdmin } from './admin.js';

const publicGuide = productionFares ? {
  ...guide,
  routes: guide.routes.map(route => ({
    ...route,
    base: Object.hasOwn(productionFares, route.id) ? productionFares[route.id] / 100 : null,
  })),
} : guide;

const endpoints = new Map([
  ['/api/health', { status: 'ok' }],
  ['/api/guide', publicGuide],
  ['/api/routes', publicGuide.routes],
  ['/api/stops', guide.stops],
  ['/api/schedules', guide.schedules],
  ['/api/fleet', guide.fleet],
]);

export function handleApi(request, response, next) {
  const pathname = request.url.split('?', 1)[0];
  if (pathname !== '/api' && !pathname.startsWith('/api/')) return next();

  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-cache');
  if (pathname.startsWith('/api/admin/')) {
    response.setHeader('Cache-Control', 'no-store');
    return void handleAdmin(request, response, pathname).catch(() => {
      response.writeHead(502).end(JSON.stringify({ error: 'adminDataUnavailable' }));
    });
  }
  if (pathname.startsWith('/api/checkout/')) {
    response.setHeader('Cache-Control', 'no-store');
    return void handleCheckout(request, response, pathname).catch(() => {
      if (!response.headersSent) response.writeHead(500).end(JSON.stringify({ error: 'checkoutError' }));
      else response.end();
    });
  }
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    return response.end(JSON.stringify({ error: 'Method not allowed' }));
  }
  const data = endpoints.get(pathname);
  const body = JSON.stringify(data ?? { error: 'Endpoint not found' });
  response.writeHead(data ? 200 : 404, { 'Content-Length': Buffer.byteLength(body) });
  response.end(request.method === 'HEAD' ? undefined : body);
}
