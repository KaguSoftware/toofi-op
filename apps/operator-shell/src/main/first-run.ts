import { app } from 'electron';
import type { StationSetupRequest, StationSetupResult } from '../bridge-types';
import { StationExistsError, hasValidStationFile, writeStation, type StationFile } from './station';

/** Long enough for the IPC reply to reach the renderer. */
export const RELAUNCH_DELAY_MS = 150;

/**
 * First-run completion: the setup screen's answer becomes station.json, then
 * the process restarts so `app.whenReady` re-decides everything it decided
 * from the file once (kiosk flags, printer). Refuses outright when a file
 * already exists: a configured station is never re-pointed from the renderer.
 */
export function completeFirstRun(
  req: StationSetupRequest,
  deps: { relaunch?: () => void } = {},
): StationSetupResult {
  if (hasValidStationFile()) return { ok: false, error: 'already-configured' };
  const file: StationFile = { station_id: req.stationId, mode: 'till' };
  if (req.printerHost) file.printer = { host: req.printerHost, port: req.printerPort ?? 9100 };
  try {
    writeStation(file);
  } catch (error) {
    if (error instanceof StationExistsError) return { ok: false, error: 'already-configured' };
    console.error('[station] first-run write failed:', error instanceof Error ? error.message : String(error));
    return { ok: false, error: 'write-failed' };
  }
  console.log('[station] first run complete:', req.stationId, '- relaunching');
  const relaunch =
    deps.relaunch ??
    (() => {
      app.relaunch();
      app.exit(0);
    });
  setTimeout(relaunch, RELAUNCH_DELAY_MS);
  return { ok: true };
}
