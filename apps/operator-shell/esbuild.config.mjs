// Bundle main + preload to single CJS files. A SANDBOXED preload cannot
// require() sibling modules, so one self-contained file per entry is what lets
// index.ts set sandbox: true. electron is provided by the runtime and
// electron-updater resolves from the asar's node_modules, so both stay external.
//
// Baked in at build time:
//   __BRAND__        the repo-root brand.config.json (names, releases repo)
//   __SUPABASE_URL__ SUPABASE_URL (or VITE_SUPABASE_URL), for the CSP connect-src
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const brand = JSON.parse(readFileSync(new URL('../../brand.config.json', import.meta.url), 'utf8'));
const supabaseUrl = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').trim();

const shared = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20', // Electron 33 ships Node 20
  sourcemap: true,
  external: ['electron', 'electron-updater'],
  define: {
    __BRAND__: JSON.stringify(brand),
    __SUPABASE_URL__: JSON.stringify(supabaseUrl),
  },
  logLevel: 'info',
};

await build({ ...shared, entryPoints: ['src/main/index.ts'], outfile: 'dist/main/index.js' });
await build({ ...shared, entryPoints: ['src/preload/index.ts'], outfile: 'dist/preload/index.js' });
