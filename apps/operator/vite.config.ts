import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import brand from '../../brand.config.json' with { type: 'json' };

const LOCAL_STACK = 'http://127.0.0.1:55421 ws://127.0.0.1:55421';

/** Origin(s) for connect-src: the Supabase URL over https and wss. */
export function connectSrc(supabaseUrl: string | undefined, dev: boolean): string {
  const parts = ["'self'"];
  if (supabaseUrl) {
    const u = new URL(supabaseUrl);
    parts.push(`${u.protocol}//${u.host}`, `${u.protocol === 'https:' ? 'wss:' : 'ws:'}//${u.host}`);
  }
  if (dev) parts.push(LOCAL_STACK, 'ws://localhost:*', 'http://localhost:*');
  return parts.join(' ');
}

/** Fills the CSP meta in index.html. Build uses the env URL; dev adds the local stack and HMR. */
function cspPlugin(supabaseUrl: string | undefined): Plugin {
  let dev = false;
  return {
    name: 'rop:csp',
    configResolved: (c) => {
      dev = c.command === 'serve';
    },
    transformIndexHtml: (html) =>
      html.replace('__CONNECT_SRC__', connectSrc(supabaseUrl, dev)).replace(
        "script-src 'self'",
        // Vite's React refresh preamble is an inline script, dev only.
        dev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
      ),
  };
}

/** Puts the product name from brand.config.json in the document title. */
function titlePlugin(): Plugin {
  return {
    name: 'rop:title',
    transformIndexHtml: (html) => html.replace('<title>Operator</title>', `<title>${brand.productName}</title>`),
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react(), cspPlugin(env.VITE_SUPABASE_URL), titlePlugin()],
    // The product name is a placeholder kept in brand.config.json; nothing else spells it out.
    define: { __PRODUCT_NAME__: JSON.stringify(brand.productName) },
    // The built SPA is loaded from file:// inside the Electron shell.
    base: './',
    server: { port: 5174, strictPort: true },
  };
});
