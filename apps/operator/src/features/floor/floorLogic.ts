// Pure floor logic: grouping v_floor_status rows by area and laying tables on a grid.

export interface FloorArea {
  id: string;
  name_en: string;
  name_ar: string;
  sort: number;
}

/** One row of v_floor_status. Money is integer IQD. */
export interface FloorRow {
  table_id: string;
  label: string;
  area_id: string;
  seats: number;
  grid_x: number;
  grid_y: number;
  tab_id: string | null;
  covers: number | null;
  waiter_name: string | null;
  opened_at: string | null;
  total: number | null;
  due: number | null;
}

export interface AreaGroup {
  area: FloorArea;
  tables: FloorRow[];
}

export const MIN_COVERS = 1;
export const MAX_COVERS = 99;

export const tableIsFree = (r: FloorRow): boolean => r.tab_id === null;

/** Areas in their sort order, each with its tables in reading order (row, then column). */
export function groupByArea(areas: readonly FloorArea[], rows: readonly FloorRow[]): AreaGroup[] {
  return [...areas]
    .sort((a, b) => a.sort - b.sort)
    .map((area) => ({
      area,
      tables: rows
        .filter((r) => r.area_id === area.id)
        .sort((a, b) => a.grid_y - b.grid_y || a.grid_x - b.grid_x || a.label.localeCompare(b.label)),
    }));
}

/** grid_x / grid_y are 0-based; CSS grid lines start at 1. */
export function gridPlacement(r: Pick<FloorRow, 'grid_x' | 'grid_y'>): { gridColumn: number; gridRow: number } {
  return { gridColumn: r.grid_x + 1, gridRow: r.grid_y + 1 };
}

export function minutesOpen(openedAt: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(openedAt).getTime()) / 60000));
}

export function splitMinutes(total: number): { hours: number; minutes: number } {
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

export function clampCovers(n: number): number {
  if (!Number.isFinite(n)) return MIN_COVERS;
  return Math.min(MAX_COVERS, Math.max(MIN_COVERS, Math.trunc(n)));
}
