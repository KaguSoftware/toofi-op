import { isPrivateIpv4, stationRegex } from './ipc-validate';

/** The on-disk shape of station.json (snake_case; may be hand-written). */
export interface StationFile {
  station_id?: string;
  mode?: string;
  printer?: { host?: string; port?: number };
}

export type ParsedStation =
  | { ok: true; stationId: string; printer?: { host: string; port: number } }
  | { ok: false; reason: string };

/**
 * Validate a station.json's text with the same rules as first-run setup
 * (station id pattern, private LAN IPv4 printer). Pure: no electron, no fs.
 */
export function parseStationFile(text: string): ParsedStation {
  let raw: StationFile;
  try {
    raw = JSON.parse(text) as StationFile;
  } catch {
    return { ok: false, reason: 'not valid JSON' };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, reason: 'not a JSON object' };
  const stationId = typeof raw.station_id === 'string' ? raw.station_id.trim() : '';
  if (!stationId) return { ok: false, reason: 'no station_id' };
  if (stationId.length > 32 || !stationRegex.test(stationId)) return { ok: false, reason: `station_id ${JSON.stringify(stationId)} does not look like TILL-01` };
  if (raw.mode !== 'till') return { ok: false, reason: `unknown mode ${JSON.stringify(raw.mode)}` };
  if (raw.printer === undefined || raw.printer === null) return { ok: true, stationId };
  if (typeof raw.printer !== 'object' || typeof raw.printer.host !== 'string') return { ok: false, reason: 'printer.host must be a string' };
  if (!isPrivateIpv4(raw.printer.host)) return { ok: false, reason: 'printer.host must be a private (LAN) IPv4 address' };
  const port = raw.printer.port ?? 9100;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, reason: 'printer.port must be 1-65535' };
  return { ok: true, stationId, printer: { host: raw.printer.host, port } };
}
