// The renderer-facing contract of the Electron shell: wire types plus RopBridge,
// the shape of `window.rop`. Self-contained (no imports) so apps/operator can
// copy this file as it is.

export type StationMode = 'till';

export interface StationInfo {
  stationId: string;
  mode: StationMode;
  /** false <=> userData/station.json does not exist yet (first run, show setup). */
  configured: boolean;
  /** Set when station.json exists but could not be read; the renderer must refuse to trade. */
  configError?: string;
  /** Thermal printer from station.json, when one is configured. */
  printer?: { host: string; port: number };
  /** app.getVersion(): the shell build, which is what auto-update replaces. */
  appVersion: string;
  /** Pixels at the top-left that the macOS traffic lights cover; 0 elsewhere. */
  titleBarInset?: number;
  /**
   * Kiosk is on: staff are kept inside the app. Leaving (quitApp, exitFullscreen)
   * is the renderer's decision, taken after it has checked a manager PIN.
   */
  locked?: boolean;
}

/** What the first-run setup screen sends. Only accepted while unconfigured. */
export interface StationSetupRequest {
  stationId: string;
  /** Private IPv4 of the 80mm network printer (TCP 9100), if the till has one. */
  printerHost?: string;
  printerPort?: number;
}

export type StationSetupResult =
  | { ok: true }
  | { ok: false; error: 'already-configured' | 'write-failed' };

export interface PrintJob {
  kind: 'receipt' | 'reprint';
  /** The receipt as a self-contained HTML document, rendered to a bitmap in main. */
  html: string;
}

export interface PrintResult {
  ok: boolean;
  error?: 'no-printer' | 'not-configured' | string;
}

export type LeaveResult = { ok: true } | { ok: false; error: 'no-window' };

export interface UpdateReadyInfo {
  version: string;
}

type Unsubscribe = () => void;
type Rejected = { error: string };

export interface RopBridge {
  /** Sync on purpose: static for the life of the process. */
  getStation(): StationInfo;
  /** First run only: writes station.json, then the app relaunches. */
  saveStation(req: StationSetupRequest): Promise<StationSetupResult | Rejected>;
  print(job: PrintJob): Promise<PrintResult | Rejected>;
  /** Quit to desktop. The renderer must have verified a manager PIN first. */
  quitApp(): Promise<LeaveResult>;
  /** Drop kiosk until the next sign-in. The renderer must have verified a manager PIN first. */
  exitFullscreen(): Promise<LeaveResult>;
  /** Called with the current state on subscribe, then on every change. */
  onFullscreenState(cb: (fullscreen: boolean) => void): Unsubscribe;
  /** macOS red traffic light pressed; main held the close. Show the quit/PIN dialog. */
  onCloseRequested(cb: () => void): Unsubscribe;
  /** An update has downloaded; null withdraws it. Called at once if one is already waiting. */
  onUpdateReady(cb: (info: UpdateReadyInfo | null) => void): Unsubscribe;
  /** Quit and install the downloaded update now. */
  installUpdate(): Promise<{ ok: boolean }>;
}

declare global {
  interface Window {
    rop?: RopBridge;
  }
}
