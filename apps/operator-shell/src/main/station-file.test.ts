import { describe, expect, it } from 'vitest';
import { parseStationFile } from './station-file';

const j = (o: unknown) => JSON.stringify(o);

describe('parseStationFile', () => {
  it('accepts a valid file with a LAN printer', () => {
    expect(parseStationFile(j({ station_id: 'TILL-01', mode: 'till', printer: { host: '192.168.1.50' } }))).toEqual({
      ok: true,
      stationId: 'TILL-01',
      printer: { host: '192.168.1.50', port: 9100 },
    });
  });
  it('accepts a file with no printer', () => {
    expect(parseStationFile(j({ station_id: 'TILL-01', mode: 'till' })).ok).toBe(true);
  });
  it.each([
    ['bad json', '{nope'],
    ['no id', j({ mode: 'till' })],
    ['lowercase id', j({ station_id: 'till 1', mode: 'till' })],
    ['unknown mode', j({ station_id: 'TILL-01', mode: 'kds' })],
    ['public printer', j({ station_id: 'TILL-01', mode: 'till', printer: { host: '8.8.8.8' } })],
    ['hostname printer', j({ station_id: 'TILL-01', mode: 'till', printer: { host: 'printer.local' } })],
    ['bad port', j({ station_id: 'TILL-01', mode: 'till', printer: { host: '10.0.0.5', port: 99999 } })],
  ])('rejects %s', (_n, text) => {
    expect(parseStationFile(text).ok).toBe(false);
  });
});
