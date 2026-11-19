import { describe, expect, it, vi } from 'vitest';
import {
  IpcValidationError,
  MAX_PRINT_HTML_BYTES,
  guardIpc,
  isPrivateIpv4,
  validatePrintJob,
  validateStationSetup,
} from './ipc-validate';

describe('validatePrintJob', () => {
  it('accepts a receipt and keeps only known fields', () => {
    expect(validatePrintJob({ kind: 'receipt', html: '<p>x</p>', extra: 1 })).toEqual({
      kind: 'receipt',
      html: '<p>x</p>',
    });
  });
  it('refuses unknown kinds, missing html, non-objects and oversized html', () => {
    expect(() => validatePrintJob({ kind: 'kitchen', html: 'x' })).toThrow(IpcValidationError);
    expect(() => validatePrintJob({ kind: 'receipt' })).toThrow(/html/);
    expect(() => validatePrintJob(null)).toThrow(IpcValidationError);
    expect(() => validatePrintJob([])).toThrow(IpcValidationError);
    expect(() => validatePrintJob({ kind: 'receipt', html: 'x'.repeat(MAX_PRINT_HTML_BYTES + 1) })).toThrow(
      /exceeds/,
    );
  });
});

describe('validateStationSetup', () => {
  it('accepts an id alone', () => {
    expect(validateStationSetup({ stationId: 'TILL-01' })).toEqual({ stationId: 'TILL-01' });
  });
  it('accepts a LAN printer, defaulting the port to 9100', () => {
    expect(validateStationSetup({ stationId: 'TILL-01', printerHost: '192.168.1.20' })).toEqual({
      stationId: 'TILL-01',
      printerHost: '192.168.1.20',
      printerPort: 9100,
    });
  });
  it('refuses a bad id, a public printer host and a bad port', () => {
    expect(() => validateStationSetup({ stationId: 'till 1' })).toThrow(/stationId/);
    expect(() => validateStationSetup({ stationId: 'TILL-01', printerHost: '8.8.8.8' })).toThrow(/private/);
    expect(() => validateStationSetup({ stationId: 'TILL-01', printerHost: 'printer.local' })).toThrow(/private/);
    expect(() =>
      validateStationSetup({ stationId: 'TILL-01', printerHost: '10.0.0.5', printerPort: 70000 }),
    ).toThrow(/printerPort/);
    expect(() => validateStationSetup('x')).toThrow(IpcValidationError);
  });
});

describe('isPrivateIpv4', () => {
  it('knows RFC1918 from the rest', () => {
    expect(isPrivateIpv4('10.1.2.3')).toBe(true);
    expect(isPrivateIpv4('172.16.0.1')).toBe(true);
    expect(isPrivateIpv4('172.32.0.1')).toBe(false);
    expect(isPrivateIpv4('192.168.0.9')).toBe(true);
    expect(isPrivateIpv4('300.1.1.1')).toBe(false);
  });
});

describe('guardIpc', () => {
  it('returns the handler result', () => {
    expect(guardIpc('t', () => 7)).toBe(7);
  });
  it('turns a validation error into { error } and logs it', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(guardIpc('t', () => validatePrintJob(null))).toEqual({
      error: 'invalid IPC payload: print job must be an object',
    });
    expect(log).toHaveBeenCalled();
  });
  it('rethrows anything else', () => {
    expect(() =>
      guardIpc('t', () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
  });
});
