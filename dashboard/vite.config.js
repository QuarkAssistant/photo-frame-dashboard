import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { createApi } from './server/app.js';

const root = path.dirname(fileURLToPath(import.meta.url));

// The wall tablet runs Android WebView 106 — keep JS output within Chromium 106.
// CSS targets chrome61 on purpose: the tablet's WebView rejects 4/8-digit hex colours
// (#0000, #ffffffbf) even though Chrome 106 should support them, and a newer target lets
// the minifier rewrite transparent/rgba() into that form.
export default defineConfig({
  build: {
    target: 'chrome106',
    cssTarget: 'chrome61',
  },
  server: { host: true },
  plugins: [
    {
      name: 'coelho-api',
      configureServer(server) {
        const api = createApi({ root });
        server.middlewares.use((req, res, next) => {
          if (!(req.url || '').startsWith('/api')) return next();
          api(req, res).catch(next);
        });
      },
    },
  ],
});
