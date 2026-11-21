// Every React Query key lives here, so a realtime signal can invalidate by prefix.
// Pattern: QK.<name>(...args) returns a tuple whose first item is the area name
// ('floor', 'tab', 'till', 'manage', 'stock'). Each screen agent adds keys in its own block.
export const QK = {
  // --- floor ---
  floorAreas: () => ['floor', 'areas'] as const,
  floorStatus: () => ['floor', 'status'] as const,
  // --- tab ---
  tabFreeTables: () => ['tab', 'free-tables'] as const,
  tabLines: (tabId: string) => ['tab', tabId, 'lines'] as const,
  tabTotals: (tabId: string) => ['tab', tabId, 'totals'] as const,
  tabMenu: () => ['tab', 'menu'] as const,
  tabOpenTabs: () => ['tab', 'open-tabs'] as const,
  // --- till ---
  tillOpenTabs: () => ['till', 'openTabs'] as const,
  tillSettled: () => ['till', 'settled'] as const,
  tillBill: (tabId: string) => ['till', 'bill', tabId] as const,
  tillShiftStatus: (device: string) => ['till', 'shiftStatus', device] as const,
  tillOpenShifts: () => ['till', 'openShifts'] as const,
  tillCashMovements: (shiftId: string) => ['till', 'cashMovements', shiftId] as const,
  tillSettings: () => ['till', 'settings'] as const,
  // --- manage ---
  manage: (...parts: readonly (string | number)[]) => ['manage', ...parts] as const,
  // --- stock ---
  stock: (...parts: readonly (string | number)[]) => ['stock', ...parts] as const,
} as const;

/** Realtime topic area -> the query-key prefixes refetched when that topic signals. */
export const TOPIC_PREFIXES: Readonly<Record<string, readonly (readonly string[])[]>> = {
  tabs: [['floor'], ['tab'], ['till']],
  stock: [['stock']],
};
