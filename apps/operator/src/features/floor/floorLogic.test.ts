import { describe, expect, it } from 'vitest';
import { clampCovers, groupByArea, gridPlacement, minutesOpen, splitMinutes, tableIsFree, type FloorRow } from './floorLogic';

const row = (over: Partial<FloorRow>): FloorRow => ({
  table_id: 't',
  label: 'T',
  area_id: 'a1',
  seats: 4,
  grid_x: 0,
  grid_y: 0,
  tab_id: null,
  covers: null,
  waiter_name: null,
  opened_at: null,
  total: null,
  due: null,
  ...over,
});

describe('groupByArea', () => {
  it('keeps area order, puts tables in reading order, drops empty areas of no tables', () => {
    const areas = [
      { id: 'a1', name_en: 'Hall', name_ar: 'h', sort: 0 },
      { id: 'a2', name_en: 'Patio', name_ar: 'p', sort: 1 },
    ];
    const rows = [
      row({ table_id: 'b', area_id: 'a1', grid_x: 1, grid_y: 0 }),
      row({ table_id: 'c', area_id: 'a1', grid_x: 0, grid_y: 1 }),
      row({ table_id: 'a', area_id: 'a1', grid_x: 0, grid_y: 0 }),
    ];
    const groups = groupByArea(areas, rows);
    expect(groups.map((g) => g.area.id)).toEqual(['a1', 'a2']);
    expect(groups[0]?.tables.map((t) => t.table_id)).toEqual(['a', 'b', 'c']);
    expect(groups[1]?.tables).toEqual([]);
  });
});

describe('gridPlacement', () => {
  it('maps grid_x/grid_y (0-based) to CSS grid lines (1-based)', () => {
    expect(gridPlacement(row({ grid_x: 2, grid_y: 3 }))).toEqual({ gridColumn: 3, gridRow: 4 });
  });
});

describe('minutes open', () => {
  const now = new Date('2026-11-20T12:00:00Z');
  it('is whole minutes elapsed, never negative', () => {
    expect(minutesOpen('2026-11-20T11:15:30Z', now)).toBe(44);
    expect(minutesOpen('2026-11-20T12:05:00Z', now)).toBe(0);
  });
  it('splits into hours and minutes', () => {
    expect(splitMinutes(44)).toEqual({ hours: 0, minutes: 44 });
    expect(splitMinutes(125)).toEqual({ hours: 2, minutes: 5 });
  });
});

describe('misc', () => {
  it('table is free without a tab', () => {
    expect(tableIsFree(row({}))).toBe(true);
    expect(tableIsFree(row({ tab_id: 'x' }))).toBe(false);
  });
  it('clamps covers to 1..99', () => {
    expect(clampCovers(0)).toBe(1);
    expect(clampCovers(150)).toBe(99);
    expect(clampCovers(Number.NaN)).toBe(1);
    expect(clampCovers(6.7)).toBe(6);
  });
});
