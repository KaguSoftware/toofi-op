// Styles first: base.css must come before the feature CSS that the routes import, so features can override it.
// Bundled locally: the CSP allows fonts from 'self' only. Three weights each, Latin and Arabic.
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-400.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-500.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-600.css';
import './styles/base.css';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { RouterProvider, createBrowserHistory, createHashHistory, createRouter } from '@tanstack/react-router';
import { AuthProvider, useAuth } from './lib/auth';
import { LocaleProvider } from './lib/i18n';
import { MUTATION_RETRY, STALE_TIME_MS, queryRetry, shouldPersistQuery } from './lib/queryPolicy';
import { ToastProvider } from './components';
import { routeTree } from './routes';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: STALE_TIME_MS, retry: queryRetry },
    mutations: { retry: MUTATION_RETRY },
  },
});

const persister = createSyncStoragePersister({ storage: window.localStorage, key: 'rop.query-cache' });

// The desktop app loads from file://, where only hash history works.
const router = createRouter({
  routeTree,
  history: window.rop ? createHashHistory() : createBrowserHistory(),
  context: { auth: { status: 'loading', role: null } },
});

function App() {
  const { status, staff } = useAuth();
  const role = staff?.role ?? null;
  // Re-run the root guard whenever the signed-in state changes.
  useEffect(() => {
    void router.invalidate();
  }, [status, role]);
  return <RouterProvider router={router} context={{ auth: { status, role } }} />;
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root missing');

createRoot(rootEl).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: 60 * 60 * 1000, dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery } }}>
      <LocaleProvider>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </LocaleProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
);
