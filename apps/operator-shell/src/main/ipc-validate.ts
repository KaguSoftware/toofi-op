import type { PrintJob, StationSetupRequest } from '../bridge-types';

/**
 * Runtime validation for everything crossing the IPC boundary. TypeScript
 * annotations are erased at runtime, so whatever the renderer sends reaches a
 * handler unless it is checked here. Every validator returns a NEW object with
 * only known fields, so an extra property cannot ride along.
 */

export class IpcValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IpcValidationError';
  }
}

function fail(what: string): never {
  throw new IpcValidationError(`invalid IPC payload: ${what}`);
}

function requireObject(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`${what} must be an object`);
  return value as Record<string, unknown>;
}

function requireString(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') fail(`${field} must be a string`);
  const s = value as string;
  if (s.length === 0) fail(`${field} must not be empty`);
  if (s.length > max) fail(`${field} exceeds ${max} characters`);
  return s;
}

/** Wrap a sync IPC handler so a malformed argument is refused, not acted on. */
export function guardIpc<T>(name: string, fn: () => T): T | { error: string } {
  try {
    return fn();
  } catch (error) {
    if (error instanceof IpcValidationError) {
      // Deliberately visible: a malformed message is a bug in our own renderer,
      // and on a kiosk this log is the only place it surfaces.
      console.error(`[ipc:${name}]`, error.message);
      return { error: error.message };
    }
    throw error;
  }
}

/** Station id, e.g. 'TILL-01'. */
export const stationRegex = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*$/;

const ipv4Regex = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;

/** RFC1918: a receipt printer lives on the venue LAN, never on the internet. */
export function isPrivateIpv4(addr: string): boolean {
  if (!ipv4Regex.test(addr)) return false;
  return /^10\./.test(addr) || /^192\.168\./.test(addr) || /^172\.(1[6-9]|2\d|3[01])\./.test(addr);
}

const PRINT_KINDS = ['receipt', 'reprint'] as const;
/** A receipt's HTML: generous, but bounded (a runaway DOM string is a bug). */
export const MAX_PRINT_HTML_BYTES = 512 * 1024;

export function validatePrintJob(value: unknown): PrintJob {
  const raw = requireObject(value, 'print job');
  const kind = requireString(raw.kind, 'kind', 16);
  if (!(PRINT_KINDS as readonly string[]).includes(kind)) fail(`unknown print kind '${kind}'`);
  const html = requireString(raw.html, 'html', MAX_PRINT_HTML_BYTES);
  return { kind: kind as PrintJob['kind'], html };
}

/** What the first-run screen sends: an id and, optionally, the till's printer. */
export function validateStationSetup(value: unknown): StationSetupRequest {
  const raw = requireObject(value, 'station setup');
  const stationId = requireString(raw.stationId, 'stationId', 32);
  if (!stationRegex.test(stationId)) fail('stationId must look like TILL-01');
  if (raw.printerHost === undefined || raw.printerHost === null || raw.printerHost === '') {
    return { stationId };
  }
  const printerHost = requireString(raw.printerHost, 'printerHost', 15);
  if (!isPrivateIpv4(printerHost)) fail('printerHost must be a private (LAN) IPv4 address');
  let printerPort = 9100;
  if (raw.printerPort !== undefined && raw.printerPort !== null) {
    const p = raw.printerPort;
    if (typeof p !== 'number' || !Number.isInteger(p) || p < 1 || p > 65535) fail('printerPort must be 1-65535');
    printerPort = p;
  }
  return { stationId, printerHost, printerPort };
}
