import type { EventEmitter } from 'node:events';
import { autoUpdater as nativeUpdater } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { UpdateReadyInfo } from '../bridge-types';
import { brand } from '../brand';

/**
 * Auto-update from the public GitHub releases repo named in brand.config.json.
 * Downloads silently (first check 30 s after start, then every 6 h) and
 * installs the downloaded build when the app next quits or starts, via
 * electron-updater's autoInstallOnAppQuit. `installNow` is the explicit
 * "restart to update" path, and Quit to desktop uses it when an update waits.
 *
 * Offline is the normal state for a till for hours at a time, so every failure
 * is logged and none is allowed to throw.
 */

export const UPDATE_FIRST_CHECK_DELAY_MS = 30_000;
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export interface UpdaterHandle {
  /** The downloaded update, or null. */
  ready(): UpdateReadyInfo | null;
  /** Quit and install the downloaded update. false when none is waiting. */
  installNow(): boolean;
  stop(): void;
}

export function startUpdater(opts: {
  enabled: boolean;
  onReady: (info: UpdateReadyInfo) => void;
  /** An install's quit is under way: windows that refuse to close must let it through. */
  allowClose: () => void;
}): UpdaterHandle | null {
  if (!opts.enabled) return null;

  autoUpdater.setFeedURL({ provider: 'github', owner: brand.releasesOwner, repo: brand.releasesRepo });
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = console;

  let downloaded: UpdateReadyInfo | null = null;
  autoUpdater.on('update-downloaded', (info) => {
    downloaded = { version: info.version };
    opts.onReady(downloaded);
  });
  // Announced once an install's quit is really going: by electron-updater on
  // Windows and by Electron's own autoUpdater (Squirrel.Mac) on macOS.
  (autoUpdater as unknown as EventEmitter).on('before-quit-for-update', opts.allowClose);
  nativeUpdater.on('before-quit-for-update', opts.allowClose);
  autoUpdater.on('error', (error) => console.error('[updater]', error.message));

  const check = () => {
    autoUpdater.checkForUpdates().catch((error: unknown) => {
      console.error('[updater] check failed:', error instanceof Error ? error.message : String(error));
    });
  };
  const first = setTimeout(check, UPDATE_FIRST_CHECK_DELAY_MS);
  const every = setInterval(check, UPDATE_CHECK_INTERVAL_MS);

  return {
    ready: () => downloaded,
    installNow: () => {
      if (!downloaded) return false;
      autoUpdater.quitAndInstall(true, true);
      return true;
    },
    stop: () => {
      clearTimeout(first);
      clearInterval(every);
    },
  };
}
