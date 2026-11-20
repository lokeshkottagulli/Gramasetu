import './load-env.js';
import { createServer, preview } from 'vite';
import { handleApi } from './api.js';

const config = {
  configFile: false,
  plugins: [{
    name: 'smartbus-api',
    configureServer(server) {
      server.middlewares.use(handleApi);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handleApi);
    },
  }],
};

if (process.argv.includes('--preview')) {
  const server = await preview(config);
  server.printUrls();
} else {
  const server = await createServer(config);
  await server.listen();
  server.printUrls();
}
