import { afterEach } from 'vitest';

// Unmount between tests; guarded because node-environment suites have no DOM.
afterEach(async () => {
  if (typeof document === 'undefined') return;
  const { cleanup } = await import('@testing-library/react');
  cleanup();
});
