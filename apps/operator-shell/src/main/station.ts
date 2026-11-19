import * as fs from 'node:fs';
import * as path from 'node:path';
import { app } from 'electron';
import type { StationInfo } from '../bridge-types';
import { parseStationFile, type StationFile } from './station-file';

export type { StationFile };

// Station identity = the MACHINE's role, not the human. station.json lives in
// userData (snake_case keys; template: station.json.example at the package
// root). It is written exactly once, by the first-run setup screen
// (completeFirstRun) or by hand.

export type StationConfig = StationInfo;

/** Thrown by writeStation when station.json already exists: never overwrite
 *  a file that may hold the venue's printer address. */
export class StationExistsError extends Error {
  constructor(file: string) {
    super(`station.json already exists at ${file}`);
    this.name = 'StationExistsError';
  }
}

/**
 * The identity a machine gets when it HAS NONE. `station_id` prefixes every
 * idempotency key and is the device on every audit row, so a machine with no
 * identity must not be handed a plausible one: if this ever reaches a row it
 * is legibly wrong, and `canTrade()` stops it getting that far.
 */
export const UNCONFIGURED_STATION_ID = 'UNCONFIGURED';

const DEV_DEFAULTS = { stationId: UNCONFIGURED_STATION_ID, mode: 'till' as const };

let cached: StationConfig | null = null;

export function stationFilePath(): string {
  return path.join(app.getPath('userData'), 'station.json');
}

function readStationFile(file: string) {
  try {
    return parseStationFile(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return { ok: false as const, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** True when station.json exists AND passes validation (an invalid one does not count as configured). */
export function hasValidStationFile(): boolean {
  const file = stationFilePath();
  return fs.existsSync(file) && readStationFile(file).ok;
}

/**
 * Read station.json once per process.
 *  - MISSING file: `configured: false`. First run, the renderer shows setup.
 *  - PRESENT but invalid (re-validated with the first-run rules): ignored, same as missing.
 */
export function loadStation(): StationConfig {
  if (cached) return cached;
  const file = stationFilePath();
  const appVersion = app.getVersion();
  if (!fs.existsSync(file)) {
    console.warn(`[station] ${file} missing: first run, station unconfigured`);
    cached = { ...DEV_DEFAULTS, configured: false, appVersion };
    return cached;
  }
  const parsed = readStationFile(file);
  if (!parsed.ok) {
    // A hand-written file is re-validated like first-run input. Invalid: ignore it and run setup again.
    console.warn(`[station] ${file} is invalid (${parsed.reason}): ignored, first run`);
    cached = { ...DEV_DEFAULTS, configured: false, appVersion };
    return cached;
  }
  cached = { stationId: parsed.stationId, mode: 'till', printer: parsed.printer, configured: true, appVersion };
  return cached;
}

/**
 * The one write path. Refuses to replace an existing file; writes a sibling
 * .tmp then renames so a crash mid-write never leaves a half file that would
 * read as "broken install" on the next boot.
 */
export function writeStation(config: StationFile): void {
  const file = stationFilePath();
  if (hasValidStationFile()) throw new StationExistsError(file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2));
  fs.renameSync(tmp, file);
  resetStationCache();
}

export function resetStationCache(): void {
  cached = null;
}

/**
 * May this machine act as a station (take a sale, print)? A station with no
 * valid station.json refuses to trade rather than guess. Not a hard refusal to
 * boot: the setup screen that fixes the problem is rendered by this very window.
 */
export function canTrade(station: StationConfig = loadStation()): boolean {
  return station.configured && !station.configError && station.stationId !== UNCONFIGURED_STATION_ID;
}
