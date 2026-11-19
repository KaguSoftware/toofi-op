// Access to the Electron bridge (window.rop). The type is a copy of
// apps/operator-shell/src/bridge-types.ts (bridge-types.ts here). In a plain
// browser there is no bridge, so getBridge() returns a no-op mock and isDesktop() is false.
import type { RopBridge } from './bridge-types';

export type { RopBridge, StationInfo, PrintJob, PrintResult, LeaveResult } from './bridge-types';

/** True inside the Electron shell. Evaluated per call: tests set window.rop. */
export function isDesktop(): boolean {
  return typeof window !== 'undefined' && window.rop !== undefined;
}

const noop = () => () => undefined;

export const browserMock: RopBridge = {
  getStation: () => ({ stationId: '', mode: 'till', configured: true, appVersion: 'browser' }),
  saveStation: async () => ({ error: 'not-in-desktop-app' }),
  print: async () => ({ error: 'not-in-desktop-app' }),
  quitApp: async () => ({ ok: true }),
  exitFullscreen: async () => ({ ok: true }),
  onFullscreenState: noop,
  onCloseRequested: noop,
  onUpdateReady: noop,
  installUpdate: async () => ({ ok: false }),
};

/** The real bridge in the desktop app, the mock in a browser. */
export function getBridge(): RopBridge {
  return (typeof window !== 'undefined' && window.rop) || browserMock;
}
