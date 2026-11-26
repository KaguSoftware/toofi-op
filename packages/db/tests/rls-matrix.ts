/**
 * The RPC role matrix: every `app.*` function granted to `authenticated` is listed
 * here (or in fixtures/rpc-allowlist.json with a reason); `check:rpc-registry`
 * enforces that. rls-matrix.test.ts calls each entry as every staff role, as a
 * signed-in non-staff user and as anon:
 *
 *   a role in `allow`  must get past the function's role guard: any outcome except
 *                      FORBIDDEN or permission-denied (a business error is fine);
 *   anyone else        must be refused with FORBIDDEN or permission-denied.
 *
 * The calls really run, so pick `args` that fail harmlessly after the guard (a
 * random uuid, a wrong PIN, a malformed value) rather than ones that change data.
 *
 * DATA ONLY, APPEND ONLY. Each agent adds entries under its own section header;
 * never restructure this file.
 */
import type { StaffRole } from '@rop/core';

export interface RpcRule {
  /** Function name in schema `app`. */
  fn: string;
  /** Named arguments, as PostgREST takes them (p_*). */
  args: Record<string, unknown>;
  /** Roles whose call must get past the role guard. */
  allow: readonly StaffRole[];
  note?: string;
}

export const ALL_STAFF: readonly StaffRole[] = ['waiter', 'cashier', 'manager', 'owner'];
export const CASHIER_UP: readonly StaffRole[] = ['cashier', 'manager', 'owner'];
export const MANAGER_UP: readonly StaffRole[] = ['manager', 'owner'];
export const OWNER_ONLY: readonly StaffRole[] = ['owner'];

/** A uuid no row has, for "not found after the guard" probes. */
export const NO_ROW = '00000000-0000-4000-8000-00000000dead';

export const RPC_MATRIX: readonly RpcRule[] = [
  // --- foundation (Phase 0) ---
  {
    fn: 'verify_manager_pin',
    args: { p_pin: '000000', p_action: 'rls_matrix' },
    allow: ALL_STAFF,
    note: 'a wrong PIN returns {ok:false}',
  },
  { fn: 'verify_own_pin', args: { p_pin: '000000' }, allow: ALL_STAFF, note: 'PIN_NOT_SET' },
  { fn: 'set_own_pin', args: { p_pin: '1' }, allow: ALL_STAFF, note: 'PIN_FORMAT after the guard' },

  // --- backend-money ---
  {
    fn: 'open_day',
    args: {},
    allow: MANAGER_UP,
    note: 'has no harmless argument: may open the day, then DAY_ALREADY_OPEN / DAY_ALREADY_CLOSED',
  },
  {
    fn: 'close_day',
    args: {},
    allow: MANAGER_UP,
    note: 'has no harmless argument: DAY_NOT_OPEN / OPEN_TABS_EXIST, or closes the day',
  },
  { fn: 'compute_tab_totals', args: { p_tab_id: NO_ROW }, allow: ALL_STAFF, note: 'TAB_NOT_FOUND' },
  {
    fn: 'open_tab',
    args: { p_table_id: NO_ROW, p_covers: 0, p_idempotency_key: 'rls-matrix:open_tab' },
    allow: ALL_STAFF,
    note: 'DAY_NOT_OPEN / INVALID_COVERS; the replay claim rolls back',
  },
  {
    fn: 'add_items',
    args: { p_tab_id: NO_ROW, p_items: [], p_idempotency_key: 'rls-matrix:add_items' },
    allow: ALL_STAFF,
    note: 'TAB_NOT_FOUND',
  },
  { fn: 'transfer_tab', args: { p_tab_id: NO_ROW, p_table_id: NO_ROW }, allow: ALL_STAFF, note: 'TAB_NOT_FOUND' },
  { fn: 'merge_tabs', args: { p_from: NO_ROW, p_into: NO_ROW }, allow: ALL_STAFF, note: 'MERGE_SELF' },
  {
    fn: 'cancel_tab',
    args: { p_tab_id: NO_ROW, p_reason: 'rls matrix' },
    allow: ALL_STAFF,
    note: 'TAB_NOT_FOUND; a non-empty tab further needs cashier+ (PIN)',
  },
  {
    fn: 'void_item',
    args: { p_order_item_id: NO_ROW, p_reason: 'rls matrix' },
    allow: ALL_STAFF,
    note: 'LINE_NOT_FOUND',
  },
  {
    fn: 'apply_discount',
    args: {
      p_tab_id: NO_ROW,
      p_kind: 'discount_amount',
      p_value: 0,
      p_reason: 'rls matrix',
      p_idempotency_key: 'rls-matrix:apply_discount',
    },
    allow: CASHIER_UP,
    note: 'INVALID_DISCOUNT; a cashier further needs a PIN',
  },
  {
    fn: 'settle_tab',
    args: {
      p_tab_id: NO_ROW,
      p_method: 'card',
      p_amount: 1,
      p_tendered: null,
      p_device_id: 'rls-matrix',
      p_idempotency_key: 'rls-matrix:settle_tab',
    },
    allow: CASHIER_UP,
    note: 'TAB_NOT_FOUND',
  },
  { fn: 'split_evenly', args: { p_tab_id: NO_ROW, p_n: 0 }, allow: CASHIER_UP, note: 'INVALID_SPLIT' },
  { fn: 'split_by_item', args: { p_tab_id: NO_ROW, p_order_item_ids: [] }, allow: CASHIER_UP, note: 'INVALID_SPLIT' },
  {
    fn: 'refund',
    args: {
      p_payment_id: NO_ROW,
      p_amount: 1,
      p_reason: 'rls matrix',
      p_device_id: '',
      p_idempotency_key: 'rls-matrix:refund',
    },
    allow: CASHIER_UP,
    note: 'DEVICE_REQUIRED; a cashier further needs a PIN',
  },
  { fn: 'open_till_shift', args: { p_device_id: '', p_opening_float: 0 }, allow: CASHIER_UP, note: 'DEVICE_REQUIRED' },
  { fn: 'close_till_shift', args: { p_counted_cash: -1 }, allow: CASHIER_UP, note: 'INVALID_AMOUNT' },
  {
    fn: 'close_till_shift_for',
    args: { p_shift_id: NO_ROW, p_counted_cash: 0 },
    allow: CASHIER_UP,
    note: 'SHIFT_NOT_OPEN; a cashier further needs a PIN',
  },
  { fn: 'till_shift_status', args: { p_device_id: 'rls-matrix' }, allow: CASHIER_UP, note: 'returns {open:false}' },
  { fn: 'record_drawer_open', args: { p_reason: '' }, allow: CASHIER_UP, note: 'REASON_REQUIRED' },

  // --- backend-stock-analytics ---
  {
    fn: 'upsert_ingredient',
    args: { p_id: NO_ROW, p_name_en: 'x', p_name_ar: 'x', p_unit: 'g', p_reorder_point: 0, p_cost_per_unit: 0 },
    allow: MANAGER_UP,
    note: 'INGREDIENT_NOT_FOUND',
  },
  { fn: 'set_ingredient_active', args: { p_id: NO_ROW, p_active: false }, allow: MANAGER_UP, note: 'INGREDIENT_NOT_FOUND' },
  { fn: 'upsert_supplier', args: { p_id: NO_ROW, p_name: 'x', p_phone: null }, allow: MANAGER_UP, note: 'SUPPLIER_NOT_FOUND' },
  { fn: 'set_recipe', args: { p_menu_item_id: NO_ROW, p_lines: [] }, allow: MANAGER_UP, note: 'RECIPE_ITEM_NOT_FOUND' },
  {
    fn: 'receive_delivery',
    args: { p_supplier_id: null, p_lines: [], p_note: null, p_idempotency_key: 'rls-matrix:receive_delivery' },
    allow: MANAGER_UP,
    note: 'STOCK_LINES_INVALID (the claim rolls back with it)',
  },
  {
    fn: 'record_waste',
    args: { p_ingredient_id: NO_ROW, p_qty: 1, p_reason: 'x', p_idempotency_key: 'rls-matrix:record_waste' },
    allow: MANAGER_UP,
    note: 'INGREDIENT_NOT_FOUND',
  },
  { fn: 'start_count', args: {}, allow: MANAGER_UP, note: 'opens a count once; COUNT_ALREADY_OPEN after' },
  { fn: 'save_count_lines', args: { p_count_id: NO_ROW, p_lines: [] }, allow: MANAGER_UP, note: 'COUNT_NOT_FOUND' },
  { fn: 'finalize_count', args: { p_count_id: NO_ROW }, allow: MANAGER_UP, note: 'COUNT_NOT_FOUND' },
  { fn: 'analytics_daily_sales', args: { p_from: '2000-01-02', p_to: '2000-01-01' }, allow: MANAGER_UP, note: 'INVALID_RANGE' },
  { fn: 'analytics_hourly', args: { p_from: '2000-01-02', p_to: '2000-01-01' }, allow: MANAGER_UP, note: 'INVALID_RANGE' },
  {
    fn: 'analytics_best_sellers',
    args: { p_from: '2000-01-02', p_to: '2000-01-01', p_limit: 10 },
    allow: MANAGER_UP,
    note: 'INVALID_RANGE',
  },
  { fn: 'analytics_by_waiter', args: { p_from: '2000-01-02', p_to: '2000-01-01' }, allow: MANAGER_UP, note: 'INVALID_RANGE' },
  { fn: 'analytics_payment_mix', args: { p_from: '2000-01-02', p_to: '2000-01-01' }, allow: MANAGER_UP, note: 'INVALID_RANGE' },
  { fn: 'panel_headline', args: { p_from: '2000-01-02', p_to: '2000-01-01' }, allow: MANAGER_UP, note: 'INVALID_RANGE' },
  { fn: 'report_item_margins', args: { p_from: '2000-01-02', p_to: '2000-01-01' }, allow: MANAGER_UP, note: 'INVALID_RANGE' },

  // --- backend-catalog-seed ---
  // Manager and owner: floor and menu admin. Empty names fail NAME_REQUIRED after the guard.
  { fn: 'upsert_floor_area', args: { p_id: null, p_name_en: '', p_name_ar: '' }, allow: MANAGER_UP },
  { fn: 'upsert_dining_table', args: { p_id: null, p_area_id: NO_ROW, p_label: '' }, allow: MANAGER_UP },
  { fn: 'set_dining_table_active', args: { p_id: NO_ROW, p_active: false }, allow: MANAGER_UP },
  { fn: 'upsert_tax_group', args: { p_id: null, p_name: '', p_rate_bps: 0 }, allow: MANAGER_UP },
  { fn: 'upsert_menu_category', args: { p_id: null, p_name_en: '', p_name_ar: '' }, allow: MANAGER_UP },
  { fn: 'set_menu_category_active', args: { p_id: NO_ROW, p_active: false }, allow: MANAGER_UP },
  {
    fn: 'upsert_menu_item',
    args: { p_id: null, p_category_id: NO_ROW, p_name_en: '', p_name_ar: '', p_price: 0, p_tax_group_id: NO_ROW },
    allow: MANAGER_UP,
  },
  { fn: 'set_menu_item_active', args: { p_id: NO_ROW, p_active: false }, allow: MANAGER_UP },
  { fn: 'upsert_modifier_group', args: { p_id: null, p_name_en: '', p_name_ar: '' }, allow: MANAGER_UP },
  { fn: 'upsert_modifier', args: { p_id: null, p_group_id: NO_ROW, p_name_en: '', p_name_ar: '' }, allow: MANAGER_UP },
  { fn: 'set_modifier_active', args: { p_id: NO_ROW, p_active: false }, allow: MANAGER_UP },
  { fn: 'set_item_modifier_groups', args: { p_menu_item_id: NO_ROW, p_group_ids: [] }, allow: MANAGER_UP },
  { fn: 'reorder_menu', args: { p_kind: 'nope', p_ids: [] }, allow: MANAGER_UP },
  // Owner only: venue settings and staff admin.
  { fn: 'update_venue_settings', args: { p_service_charge_bps: -1 }, allow: OWNER_ONLY },
  { fn: 'set_staff_role', args: { p_staff_id: NO_ROW, p_role: 'waiter' }, allow: OWNER_ONLY },
  { fn: 'set_staff_active', args: { p_staff_id: NO_ROW, p_active: false }, allow: OWNER_ONLY },
  { fn: 'set_staff_pin', args: { p_staff_id: NO_ROW, p_pin: '1' }, allow: OWNER_ONLY },

  // --- backend-fixes (review fixes) ---
  { fn: 'stock_count_report', args: { p_count_id: NO_ROW }, allow: MANAGER_UP, note: 'COUNT_NOT_FOUND' },

  // --- backend-final ---
  { fn: 'shift_variances', args: { p_from: '2000-01-02', p_to: '2000-01-01' }, allow: MANAGER_UP, note: 'INVALID_RANGE' },

  // --- cash movements (0130) ---
  {
    fn: 'record_cash_movement',
    args: { p_kind: 'paid_out', p_amount: 0, p_reason: 'rls matrix', p_idempotency_key: 'rls-matrix:cash_movement' },
    allow: CASHIER_UP,
    note: 'INVALID_AMOUNT; a cashier further needs a PIN',
  },

  // --- analytics v2 (0131) ---
  { fn: 'analytics_overview', args: { p_from: '2000-01-02', p_to: '2000-01-01' }, allow: MANAGER_UP, note: 'INVALID_RANGE' },
  { fn: 'analytics_menu_engineering', args: { p_from: '2000-01-02', p_to: '2000-01-01' }, allow: MANAGER_UP, note: 'INVALID_RANGE' },
  { fn: 'analytics_stock_losses', args: { p_from: '2000-01-02', p_to: '2000-01-01' }, allow: MANAGER_UP, note: 'INVALID_RANGE' },
  { fn: 'analytics_staff', args: { p_from: '2000-01-02', p_to: '2000-01-01' }, allow: MANAGER_UP, note: 'INVALID_RANGE' },
  { fn: 'analytics_weekday_hour', args: { p_from: '2000-01-02', p_to: '2000-01-01' }, allow: MANAGER_UP, note: 'INVALID_RANGE' },
  { fn: 'analytics_price_changes', args: { p_from: '2000-01-02', p_to: '2000-01-01' }, allow: MANAGER_UP, note: 'INVALID_RANGE' },
  { fn: 'analytics_table_turns', args: { p_from: '2000-01-02', p_to: '2000-01-01' }, allow: MANAGER_UP, note: 'INVALID_RANGE' },
  { fn: 'analytics_attention', args: {}, allow: MANAGER_UP, note: 'read only' },

  // --- guest QR menu (0140+); the five guest functions are anon-only (fixtures/rpc-public.json) ---
  { fn: 'guest_inbox', args: {}, allow: ALL_STAFF, note: 'read only' },
  { fn: 'answer_waiter_call', args: { p_call_id: NO_ROW }, allow: ALL_STAFF, note: 'WAITER_CALL_NOT_FOUND' },
  {
    fn: 'accept_guest_order',
    args: { p_guest_order_id: NO_ROW, p_covers: null, p_idempotency_key: 'rls-matrix:accept_guest_order' },
    allow: ALL_STAFF,
    note: 'GUEST_ORDER_NOT_FOUND; the replay claim rolls back',
  },
  { fn: 'decline_guest_order', args: { p_guest_order_id: NO_ROW }, allow: ALL_STAFF, note: 'GUEST_ORDER_NOT_FOUND' },
  { fn: 'table_qr_tokens', args: {}, allow: MANAGER_UP, note: 'read only, plus one audit row' },
  {
    fn: 'set_table_guest_enabled',
    args: { p_table_id: NO_ROW, p_enabled: true },
    allow: MANAGER_UP,
    note: 'TABLE_NOT_FOUND',
  },
  {
    fn: 'set_guest_service',
    args: { p_calls_enabled: null, p_orders_enabled: null },
    allow: MANAGER_UP,
    note: 'INVALID_ARGUMENT',
  },
  { fn: 'rotate_table_token', args: { p_table_id: NO_ROW }, allow: OWNER_ONLY, note: 'TABLE_NOT_FOUND' },
];
