import type { ReactNode } from 'react';
import { EmptyState, Loading } from './States';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Numbers and money read best end-aligned. */
  align?: 'start' | 'end';
}

export interface DataTableProps<T> {
  columns: readonly Column<T>[];
  rows: readonly T[] | undefined;
  rowKey: (row: T) => string;
  /** Visually hidden table name for screen readers. */
  caption: string;
  loading?: boolean;
  emptyMessage?: string;
  /** Optional class per row (e.g. to highlight a flagged row; never the only signal). */
  rowClass?: (row: T) => string | undefined;
}

export function DataTable<T>({ columns, rows, rowKey, caption, loading, emptyMessage, rowClass }: DataTableProps<T>) {
  if (loading) return <Loading />;
  if (!rows || rows.length === 0) return <EmptyState message={emptyMessage} />;
  return (
    <div className="rop-table-wrap">
      <table className="rop-table">
        <caption className="rop-sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" data-align={c.align}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className={rowClass?.(row)}>
              {columns.map((c) => (
                <td key={c.key} data-align={c.align}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
