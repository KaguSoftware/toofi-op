
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "app": {
          Tables: {
            "pin_attempts": {
                  Row: {
                    "actor_id": string,"at": string,"id": number,"ok": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id": string,"at"?: string,"id"?: never,"ok": boolean
                  }
                  Update: {
                    "actor_id"?: string,"at"?: string,"id"?: never,"ok"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"pin_grants": {
                  Row: {
                    "action": string,"actor_id": string,"authorizer_id": string,"consumed_at": string | null,"created_at": string,"entity_id": string | null,"expires_at": string,"id": string,"value": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id": string,"authorizer_id": string,"consumed_at"?: string | null,"created_at"?: string,"entity_id"?: string | null,"expires_at"?: string,"id"?: string,"value"?: number | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string,"authorizer_id"?: string,"consumed_at"?: string | null,"created_at"?: string,"entity_id"?: string | null,"expires_at"?: string,"id"?: string,"value"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"rpc_replays": {
                  Row: {
                    "actor_id": string | null,"created_at": string,"key": string,"result": Json | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"created_at"?: string,"key": string,"result"?: Json | null
                  }
                  Update: {
                    "actor_id"?: string | null,"created_at"?: string,"key"?: string,"result"?: Json | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "add_items":
{ Args: { "p_idempotency_key": string,"p_items": Json,"p_tab_id": string }; Returns: Json
                           },
"analytics_best_sellers":
{ Args: { "p_from": string,"p_limit"?: number,"p_to": string }; Returns: Json
                           },
"analytics_by_waiter":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
                           },
"analytics_daily_sales":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
                           },
"analytics_guard":
{ Args: { "p_from": string,"p_to": string }; Returns: undefined
                           },
"analytics_hourly":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
                           },
"analytics_live_tabs":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Tables']["tabs"]['Row'][]
                          SetofOptions: {
        from: "*"
        to: "tabs"
        isOneToOne: false
        isSetofReturn: true
      } },
"analytics_payment_mix":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
                           },
"apply_discount":
{ Args: { "p_idempotency_key": string,"p_kind": Database["public"]['Enums']["adjustment_kind"],"p_reason": string,"p_tab_id": string,"p_value": number }; Returns: Json
                           },
"audit_shift_mismatch":
{ Args: { "p_action": string,"p_device_id": string,"p_entity": string,"p_entity_id": string,"p_method": Database["public"]['Enums']["payment_method"],"p_shift_id": string }; Returns: undefined
                           },
"business_date":
{ Args: { "p_at"?: string }; Returns: string
                           },
"cancel_tab":
{ Args: { "p_reason": string,"p_tab_id": string }; Returns: Json
                           },
"claim_replay":
{ Args: { "p_key": string }; Returns: Json
                           },
"close_day":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"close_shift":
{ Args: { "p_authorized_by": string,"p_counted_cash": number,"p_shift": Omit<Database["public"]['Tables']["till_shifts"]['Row'], Database["public"]['Tables']["till_shifts"]['ComputedFields']> }; Returns: Json
                           },
"close_till_shift":
{ Args: { "p_counted_cash": number }; Returns: Json
                           },
"close_till_shift_for":
{ Args: { "p_counted_cash": number,"p_shift_id": string }; Returns: Json
                           },
"compute_tab_totals":
{ Args: { "p_tab_id": string }; Returns: Json
                           },
"consume_pin_grant":
{ Args: { "p_action": string,"p_entity_id"?: string,"p_value"?: number }; Returns: string
                           },
"current_venue":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"finalize_count":
{ Args: { "p_count_id": string }; Returns: Json
                           },
"finish_replay":
{ Args: { "p_key": string,"p_result": Json }; Returns: Json
                           },
"ingredient_on_hand":
{ Args: { "p_ingredient_id": string }; Returns: number
                           },
"is_staff":
{ Args: { "p_roles": (Database["public"]['Enums']["staff_role"])[] }; Returns: boolean
                           },
"lock_open_count":
{ Args: { "p_count_id": string }; Returns: Database["public"]['Tables']["stock_counts"]['Row']
                          SetofOptions: {
        from: "*"
        to: "stock_counts"
        isOneToOne: true
        isSetofReturn: false
      } },
"lock_open_tab":
{ Args: { "p_tab_id": string }; Returns: Database["public"]['Tables']["tabs"]['Row']
                          SetofOptions: {
        from: "*"
        to: "tabs"
        isOneToOne: true
        isSetofReturn: false
      } },
"merge_tabs":
{ Args: { "p_from": string,"p_into": string }; Returns: Json
                           },
"open_day":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"open_tab":
{ Args: { "p_covers": number,"p_idempotency_key": string,"p_table_id": string }; Returns: Json
                           },
"open_till_shift":
{ Args: { "p_device_id": string,"p_opening_float": number }; Returns: Json
                           },
"panel_headline":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
                           },
"pin_answer":
{ Args: { "p_actor": string,"p_extra"?: Json,"p_ok": boolean }; Returns: Json
                           },
"pin_is_weak":
{ Args: { "p_pin": string }; Returns: boolean
                           },
"pin_locked":
{ Args: { "p_actor": string }; Returns: boolean
                           },
"purge_housekeeping":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"receive_delivery":
{ Args: { "p_idempotency_key": string,"p_lines": Json,"p_note": string,"p_supplier_id": string }; Returns: Json
                           },
"record_cash_movement":
{ Args: { "p_amount": number,"p_idempotency_key": string,"p_kind": Database["public"]['Enums']["cash_movement_kind"],"p_reason": string }; Returns: Json
                           },
"record_drawer_open":
{ Args: { "p_reason": string }; Returns: Json
                           },
"record_waste":
{ Args: { "p_idempotency_key": string,"p_ingredient_id": string,"p_qty": number,"p_reason": string }; Returns: Json
                           },
"refund":
{ Args: { "p_amount": number,"p_device_id": string,"p_idempotency_key": string,"p_payment_id": string,"p_reason": string }; Returns: Json
                           },
"reorder_menu":
{ Args: { "p_ids": (string)[],"p_kind": string }; Returns: undefined
                           },
"report_item_margins":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
                           },
"revoke_user_sessions":
{ Args: { "p_user_id": string }; Returns: number
                           },
"round_div":
{ Args: { "p_d": number,"p_n": number }; Returns: number
                           },
"sales_by_day":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "card": number,"cash": number,"covers": number,"day": string,"discounts": number,"gross": number,"net": number,"payments": number,"refunds": number,"tabs": number,"voids": number,"voids_count": number
            }[]
                           },
"save_count_lines":
{ Args: { "p_count_id": string,"p_lines": Json }; Returns: Json
                           },
"set_dining_table_active":
{ Args: { "p_active": boolean,"p_id": string }; Returns: undefined
                           },
"set_ingredient_active":
{ Args: { "p_active": boolean,"p_id": string }; Returns: Json
                           },
"set_item_modifier_groups":
{ Args: { "p_group_ids": (string)[],"p_menu_item_id": string }; Returns: undefined
                           },
"set_menu_category_active":
{ Args: { "p_active": boolean,"p_id": string }; Returns: undefined
                           },
"set_menu_item_active":
{ Args: { "p_active": boolean,"p_id": string }; Returns: undefined
                           },
"set_modifier_active":
{ Args: { "p_active": boolean,"p_id": string }; Returns: undefined
                           },
"set_own_pin":
{ Args: { "p_pin": string }; Returns: undefined
                           },
"set_recipe":
{ Args: { "p_lines": Json,"p_menu_item_id": string }; Returns: Json
                           },
"set_staff_active":
{ Args: { "p_active": boolean,"p_staff_id": string }; Returns: undefined
                           },
"set_staff_pin":
{ Args: { "p_pin": string,"p_staff_id": string }; Returns: undefined
                           },
"set_staff_role":
{ Args: { "p_role": Database["public"]['Enums']["staff_role"],"p_staff_id": string }; Returns: undefined
                           },
"settle_tab":
{ Args: { "p_amount": number,"p_device_id": string,"p_idempotency_key": string,"p_method": Database["public"]['Enums']["payment_method"],"p_tab_id": string,"p_tendered": number }; Returns: Json
                           },
"shift_variances":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
                           },
"split_by_item":
{ Args: { "p_order_item_ids": (string)[],"p_tab_id": string }; Returns: Json
                           },
"split_evenly":
{ Args: { "p_n": number,"p_tab_id": string }; Returns: Json
                           },
"staff_role":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["staff_role"]
                           },
"start_count":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"stock_count_report":
{ Args: { "p_count_id": string }; Returns: Json
                           },
"tab_after_change":
{ Args: { "p_tab_id": string }; Returns: Json
                           },
"tab_line_discounts":
{ Args: { "p_tab_id": string }; Returns: {
              "discount": number,"line_total": number,"order_item_id": string,"tax_rate_bps": number
            }[]
                           },
"till_shift_status":
{ Args: { "p_device_id": string }; Returns: Json
                           },
"transfer_tab":
{ Args: { "p_tab_id": string,"p_table_id": string }; Returns: Json
                           },
"update_venue_settings":
{ Args: { "p_receipt_footer_ar"?: string,"p_receipt_footer_en"?: string,"p_receipt_header_ar"?: string,"p_receipt_header_en"?: string,"p_service_charge_bps"?: number,"p_variance_alert_iqd"?: number,"p_venue_name"?: string }; Returns: undefined
                           },
"upsert_dining_table":
{ Args: { "p_area_id": string,"p_grid_x"?: number,"p_grid_y"?: number,"p_id": string,"p_label": string,"p_seats"?: number }; Returns: string
                           },
"upsert_floor_area":
{ Args: { "p_id": string,"p_name_ar": string,"p_name_en": string,"p_sort"?: number }; Returns: string
                           },
"upsert_ingredient":
{ Args: { "p_cost_per_unit": number,"p_id": string,"p_name_ar": string,"p_name_en": string,"p_reorder_point": number,"p_unit": Database["public"]['Enums']["stock_unit"] }; Returns: Json
                           },
"upsert_menu_category":
{ Args: { "p_id": string,"p_name_ar": string,"p_name_en": string,"p_sort"?: number }; Returns: string
                           },
"upsert_menu_item":
{ Args: { "p_category_id": string,"p_id": string,"p_name_ar": string,"p_name_en": string,"p_price": number,"p_sort"?: number,"p_tax_group_id": string }; Returns: string
                           },
"upsert_modifier":
{ Args: { "p_group_id": string,"p_id": string,"p_name_ar": string,"p_name_en": string,"p_price_delta"?: number }; Returns: string
                           },
"upsert_modifier_group":
{ Args: { "p_id": string,"p_max_select"?: number,"p_min_select"?: number,"p_name_ar": string,"p_name_en": string }; Returns: string
                           },
"upsert_supplier":
{ Args: { "p_id": string,"p_name": string,"p_phone": string }; Returns: Json
                           },
"upsert_tax_group":
{ Args: { "p_id": string,"p_name": string,"p_rate_bps": number }; Returns: string
                           },
"variance_alert_threshold":
{ Args: { "p_venue_id": string }; Returns: number
                           },
"venue_timezone":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"verify_manager_pin":
{ Args: { "p_action": string,"p_entity_id"?: string,"p_pin": string,"p_value"?: number }; Returns: Json
                           },
"verify_own_pin":
{ Args: { "p_pin": string }; Returns: Json
                           },
"void_item":
{ Args: { "p_order_item_id": string,"p_reason": string }; Returns: Json
                           },
"write_audit":
{ Args: { "p_action": string,"p_after"?: Json,"p_authorized_by"?: string,"p_before"?: Json,"p_entity": string,"p_entity_id"?: string,"p_reason"?: string }; Returns: string
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"after": Json | null,"authorized_by": string | null,"before": Json | null,"created_at": string,"entity": string,"entity_id": string | null,"id": string,"reason": string | null,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"after"?: Json | null,"authorized_by"?: string | null,"before"?: Json | null,"created_at"?: string,"entity": string,"entity_id"?: string | null,"id"?: string,"reason"?: string | null,"venue_id"?: string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"after"?: Json | null,"authorized_by"?: string | null,"before"?: Json | null,"created_at"?: string,"entity"?: string,"entity_id"?: string | null,"id"?: string,"reason"?: string | null,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"cash_movements": {
                  Row: {
                    "amount": number,"authorized_by": string | null,"created_at": string,"day_session_id": string | null,"id": string,"idempotency_key": string,"kind": Database["public"]['Enums']["cash_movement_kind"],"reason": string,"staff_id": string,"till_shift_id": string,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"authorized_by"?: string | null,"created_at"?: string,"day_session_id"?: string | null,"id"?: string,"idempotency_key": string,"kind": Database["public"]['Enums']["cash_movement_kind"],"reason": string,"staff_id": string,"till_shift_id": string,"venue_id"?: string
                  }
                  Update: {
                    "amount"?: number,"authorized_by"?: string | null,"created_at"?: string,"day_session_id"?: string | null,"id"?: string,"idempotency_key"?: string,"kind"?: Database["public"]['Enums']["cash_movement_kind"],"reason"?: string,"staff_id"?: string,"till_shift_id"?: string,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cash_movements_authorized_by_fkey"
      columns: ["authorized_by"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cash_movements_day_session_id_fkey"
      columns: ["day_session_id"]
isOneToOne: false
      referencedRelation: "day_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cash_movements_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cash_movements_till_shift_id_fkey"
      columns: ["till_shift_id"]
isOneToOne: false
      referencedRelation: "till_shifts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cash_movements_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"day_sessions": {
                  Row: {
                    "business_date": string,"closed_at": string | null,"closed_by": string | null,"created_at": string,"id": string,"opened_at": string,"opened_by": string,"summary": Json | null,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_date": string,"closed_at"?: string | null,"closed_by"?: string | null,"created_at"?: string,"id"?: string,"opened_at"?: string,"opened_by": string,"summary"?: Json | null,"venue_id"?: string
                  }
                  Update: {
                    "business_date"?: string,"closed_at"?: string | null,"closed_by"?: string | null,"created_at"?: string,"id"?: string,"opened_at"?: string,"opened_by"?: string,"summary"?: Json | null,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "day_sessions_closed_by_fkey"
      columns: ["closed_by"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "day_sessions_opened_by_fkey"
      columns: ["opened_by"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "day_sessions_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"deliveries": {
                  Row: {
                    "created_at": string,"id": string,"idempotency_key": string,"note": string | null,"received_at": string,"received_by": string,"supplier_id": string | null,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"idempotency_key": string,"note"?: string | null,"received_at"?: string,"received_by": string,"supplier_id"?: string | null,"venue_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"idempotency_key"?: string,"note"?: string | null,"received_at"?: string,"received_by"?: string,"supplier_id"?: string | null,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "deliveries_received_by_fkey"
      columns: ["received_by"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deliveries_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deliveries_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"delivery_lines": {
                  Row: {
                    "created_at": string,"delivery_id": string,"id": string,"ingredient_id": string,"qty": number,"unit_cost": number,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"delivery_id": string,"id"?: string,"ingredient_id": string,"qty": number,"unit_cost": number,"venue_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"delivery_id"?: string,"id"?: string,"ingredient_id"?: string,"qty"?: number,"unit_cost"?: number,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "delivery_lines_delivery_id_fkey"
      columns: ["delivery_id"]
isOneToOne: false
      referencedRelation: "deliveries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "delivery_lines_ingredient_id_fkey"
      columns: ["ingredient_id"]
isOneToOne: false
      referencedRelation: "ingredients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "delivery_lines_ingredient_id_fkey"
      columns: ["ingredient_id"]
isOneToOne: false
      referencedRelation: "v_ingredient_on_hand"
      referencedColumns: ["ingredient_id"]
    },{
      foreignKeyName: "delivery_lines_ingredient_id_fkey"
      columns: ["ingredient_id"]
isOneToOne: false
      referencedRelation: "v_low_stock"
      referencedColumns: ["ingredient_id"]
    },{
      foreignKeyName: "delivery_lines_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"dining_tables": {
                  Row: {
                    "area_id": string,"created_at": string,"grid_x": number,"grid_y": number,"id": string,"is_active": boolean,"label": string,"seats": number,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "area_id": string,"created_at"?: string,"grid_x"?: number,"grid_y"?: number,"id"?: string,"is_active"?: boolean,"label": string,"seats"?: number,"venue_id"?: string
                  }
                  Update: {
                    "area_id"?: string,"created_at"?: string,"grid_x"?: number,"grid_y"?: number,"id"?: string,"is_active"?: boolean,"label"?: string,"seats"?: number,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "dining_tables_area_id_fkey"
      columns: ["area_id"]
isOneToOne: false
      referencedRelation: "floor_areas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dining_tables_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"drawer_events": {
                  Row: {
                    "created_at": string,"id": string,"reason": string,"staff_id": string,"till_shift_id": string,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"reason": string,"staff_id": string,"till_shift_id": string,"venue_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"reason"?: string,"staff_id"?: string,"till_shift_id"?: string,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "drawer_events_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "drawer_events_till_shift_id_fkey"
      columns: ["till_shift_id"]
isOneToOne: false
      referencedRelation: "till_shifts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "drawer_events_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"floor_areas": {
                  Row: {
                    "created_at": string,"id": string,"name_ar": string,"name_en": string,"sort": number,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name_ar": string,"name_en": string,"sort"?: number,"venue_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name_ar"?: string,"name_en"?: string,"sort"?: number,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "floor_areas_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"ingredients": {
                  Row: {
                    "cost_per_unit": number,"created_at": string,"id": string,"is_active": boolean,"name_ar": string,"name_en": string,"reorder_point": number,"unit": Database["public"]['Enums']["stock_unit"],"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cost_per_unit"?: number,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name_ar": string,"name_en": string,"reorder_point"?: number,"unit": Database["public"]['Enums']["stock_unit"],"venue_id"?: string
                  }
                  Update: {
                    "cost_per_unit"?: number,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name_ar"?: string,"name_en"?: string,"reorder_point"?: number,"unit"?: Database["public"]['Enums']["stock_unit"],"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ingredients_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"menu_categories": {
                  Row: {
                    "created_at": string,"id": string,"is_active": boolean,"name_ar": string,"name_en": string,"sort": number,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"name_ar": string,"name_en": string,"sort"?: number,"venue_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"name_ar"?: string,"name_en"?: string,"sort"?: number,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "menu_categories_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"menu_item_modifier_groups": {
                  Row: {
                    "created_at": string,"group_id": string,"menu_item_id": string,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"group_id": string,"menu_item_id": string,"venue_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"group_id"?: string,"menu_item_id"?: string,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "menu_item_modifier_groups_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "modifier_groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "menu_item_modifier_groups_menu_item_id_fkey"
      columns: ["menu_item_id"]
isOneToOne: false
      referencedRelation: "menu_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "menu_item_modifier_groups_menu_item_id_fkey"
      columns: ["menu_item_id"]
isOneToOne: false
      referencedRelation: "v_item_cost"
      referencedColumns: ["menu_item_id"]
    },{
      foreignKeyName: "menu_item_modifier_groups_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"menu_items": {
                  Row: {
                    "category_id": string,"created_at": string,"id": string,"is_active": boolean,"name_ar": string,"name_en": string,"price": number,"sort": number,"tax_group_id": string,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category_id": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name_ar": string,"name_en": string,"price": number,"sort"?: number,"tax_group_id": string,"venue_id"?: string
                  }
                  Update: {
                    "category_id"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name_ar"?: string,"name_en"?: string,"price"?: number,"sort"?: number,"tax_group_id"?: string,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "menu_items_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "menu_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "menu_items_tax_group_id_fkey"
      columns: ["tax_group_id"]
isOneToOne: false
      referencedRelation: "tax_groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "menu_items_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"modifier_groups": {
                  Row: {
                    "created_at": string,"id": string,"max_select": number,"min_select": number,"name_ar": string,"name_en": string,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"max_select"?: number,"min_select"?: number,"name_ar": string,"name_en": string,"venue_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"max_select"?: number,"min_select"?: number,"name_ar"?: string,"name_en"?: string,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "modifier_groups_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"modifiers": {
                  Row: {
                    "created_at": string,"group_id": string,"id": string,"is_active": boolean,"name_ar": string,"name_en": string,"price_delta": number,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"group_id": string,"id"?: string,"is_active"?: boolean,"name_ar": string,"name_en": string,"price_delta"?: number,"venue_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"group_id"?: string,"id"?: string,"is_active"?: boolean,"name_ar"?: string,"name_en"?: string,"price_delta"?: number,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "modifiers_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "modifier_groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "modifiers_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"order_item_modifiers": {
                  Row: {
                    "created_at": string,"id": string,"modifier_id": string,"name_ar": string,"name_en": string,"order_item_id": string,"price_delta": number,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"modifier_id": string,"name_ar": string,"name_en": string,"order_item_id": string,"price_delta": number,"venue_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"modifier_id"?: string,"name_ar"?: string,"name_en"?: string,"order_item_id"?: string,"price_delta"?: number,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_item_modifiers_modifier_id_fkey"
      columns: ["modifier_id"]
isOneToOne: false
      referencedRelation: "modifiers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_item_modifiers_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: false
      referencedRelation: "order_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_item_modifiers_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"order_items": {
                  Row: {
                    "created_at": string,"id": string,"line_total": number,"menu_item_id": string,"name_ar": string,"name_en": string,"note": string | null,"order_id": string,"qty": number,"tab_id": string,"tax_rate_bps": number,"unit_price": number,"venue_id": string,"void_authorized_by": string | null,"void_reason": string | null,"voided_at": string | null,"voided_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"line_total": number,"menu_item_id": string,"name_ar": string,"name_en": string,"note"?: string | null,"order_id": string,"qty": number,"tab_id": string,"tax_rate_bps": number,"unit_price": number,"venue_id"?: string,"void_authorized_by"?: string | null,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"line_total"?: number,"menu_item_id"?: string,"name_ar"?: string,"name_en"?: string,"note"?: string | null,"order_id"?: string,"qty"?: number,"tab_id"?: string,"tax_rate_bps"?: number,"unit_price"?: number,"venue_id"?: string,"void_authorized_by"?: string | null,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_items_menu_item_id_fkey"
      columns: ["menu_item_id"]
isOneToOne: false
      referencedRelation: "menu_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_menu_item_id_fkey"
      columns: ["menu_item_id"]
isOneToOne: false
      referencedRelation: "v_item_cost"
      referencedColumns: ["menu_item_id"]
    },{
      foreignKeyName: "order_items_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_tab_id_fkey"
      columns: ["tab_id"]
isOneToOne: false
      referencedRelation: "tabs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_tab_id_fkey"
      columns: ["tab_id"]
isOneToOne: false
      referencedRelation: "v_floor_status"
      referencedColumns: ["tab_id"]
    },{
      foreignKeyName: "order_items_tab_id_fkey"
      columns: ["tab_id"]
isOneToOne: false
      referencedRelation: "v_open_tabs"
      referencedColumns: ["tab_id"]
    },{
      foreignKeyName: "order_items_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_void_authorized_by_fkey"
      columns: ["void_authorized_by"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_voided_by_fkey"
      columns: ["voided_by"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "created_at": string,"id": string,"idempotency_key": string,"placed_at": string,"placed_by": string,"tab_id": string,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"idempotency_key": string,"placed_at"?: string,"placed_by": string,"tab_id": string,"venue_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"idempotency_key"?: string,"placed_at"?: string,"placed_by"?: string,"tab_id"?: string,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_placed_by_fkey"
      columns: ["placed_by"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_tab_id_fkey"
      columns: ["tab_id"]
isOneToOne: false
      referencedRelation: "tabs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_tab_id_fkey"
      columns: ["tab_id"]
isOneToOne: false
      referencedRelation: "v_floor_status"
      referencedColumns: ["tab_id"]
    },{
      foreignKeyName: "orders_tab_id_fkey"
      columns: ["tab_id"]
isOneToOne: false
      referencedRelation: "v_open_tabs"
      referencedColumns: ["tab_id"]
    },{
      foreignKeyName: "orders_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount": number,"change": number,"created_at": string,"device_id": string | null,"id": string,"idempotency_key": string,"method": Database["public"]['Enums']["payment_method"],"tab_id": string,"taken_by": string,"tendered": number | null,"till_shift_id": string | null,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"change"?: number,"created_at"?: string,"device_id"?: string | null,"id"?: string,"idempotency_key": string,"method": Database["public"]['Enums']["payment_method"],"tab_id": string,"taken_by": string,"tendered"?: number | null,"till_shift_id"?: string | null,"venue_id"?: string
                  }
                  Update: {
                    "amount"?: number,"change"?: number,"created_at"?: string,"device_id"?: string | null,"id"?: string,"idempotency_key"?: string,"method"?: Database["public"]['Enums']["payment_method"],"tab_id"?: string,"taken_by"?: string,"tendered"?: number | null,"till_shift_id"?: string | null,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_tab_id_fkey"
      columns: ["tab_id"]
isOneToOne: false
      referencedRelation: "tabs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_tab_id_fkey"
      columns: ["tab_id"]
isOneToOne: false
      referencedRelation: "v_floor_status"
      referencedColumns: ["tab_id"]
    },{
      foreignKeyName: "payments_tab_id_fkey"
      columns: ["tab_id"]
isOneToOne: false
      referencedRelation: "v_open_tabs"
      referencedColumns: ["tab_id"]
    },{
      foreignKeyName: "payments_taken_by_fkey"
      columns: ["taken_by"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_till_shift_id_fkey"
      columns: ["till_shift_id"]
isOneToOne: false
      referencedRelation: "till_shifts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"recipe_lines": {
                  Row: {
                    "created_at": string,"id": string,"ingredient_id": string,"menu_item_id": string,"qty": number,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"ingredient_id": string,"menu_item_id": string,"qty": number,"venue_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"ingredient_id"?: string,"menu_item_id"?: string,"qty"?: number,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_lines_ingredient_id_fkey"
      columns: ["ingredient_id"]
isOneToOne: false
      referencedRelation: "ingredients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipe_lines_ingredient_id_fkey"
      columns: ["ingredient_id"]
isOneToOne: false
      referencedRelation: "v_ingredient_on_hand"
      referencedColumns: ["ingredient_id"]
    },{
      foreignKeyName: "recipe_lines_ingredient_id_fkey"
      columns: ["ingredient_id"]
isOneToOne: false
      referencedRelation: "v_low_stock"
      referencedColumns: ["ingredient_id"]
    },{
      foreignKeyName: "recipe_lines_menu_item_id_fkey"
      columns: ["menu_item_id"]
isOneToOne: false
      referencedRelation: "menu_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipe_lines_menu_item_id_fkey"
      columns: ["menu_item_id"]
isOneToOne: false
      referencedRelation: "v_item_cost"
      referencedColumns: ["menu_item_id"]
    },{
      foreignKeyName: "recipe_lines_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"refunds": {
                  Row: {
                    "amount": number,"authorized_by": string | null,"created_at": string,"day_session_id": string,"device_id": string | null,"id": string,"method": Database["public"]['Enums']["payment_method"],"payment_id": string,"reason": string,"refunded_by": string,"tab_id": string,"till_shift_id": string | null,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"authorized_by"?: string | null,"created_at"?: string,"day_session_id": string,"device_id"?: string | null,"id"?: string,"method": Database["public"]['Enums']["payment_method"],"payment_id": string,"reason": string,"refunded_by": string,"tab_id": string,"till_shift_id"?: string | null,"venue_id"?: string
                  }
                  Update: {
                    "amount"?: number,"authorized_by"?: string | null,"created_at"?: string,"day_session_id"?: string,"device_id"?: string | null,"id"?: string,"method"?: Database["public"]['Enums']["payment_method"],"payment_id"?: string,"reason"?: string,"refunded_by"?: string,"tab_id"?: string,"till_shift_id"?: string | null,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "refunds_authorized_by_fkey"
      columns: ["authorized_by"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "refunds_day_session_id_fkey"
      columns: ["day_session_id"]
isOneToOne: false
      referencedRelation: "day_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "refunds_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "refunds_refunded_by_fkey"
      columns: ["refunded_by"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "refunds_tab_id_fkey"
      columns: ["tab_id"]
isOneToOne: false
      referencedRelation: "tabs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "refunds_tab_id_fkey"
      columns: ["tab_id"]
isOneToOne: false
      referencedRelation: "v_floor_status"
      referencedColumns: ["tab_id"]
    },{
      foreignKeyName: "refunds_tab_id_fkey"
      columns: ["tab_id"]
isOneToOne: false
      referencedRelation: "v_open_tabs"
      referencedColumns: ["tab_id"]
    },{
      foreignKeyName: "refunds_till_shift_id_fkey"
      columns: ["till_shift_id"]
isOneToOne: false
      referencedRelation: "till_shifts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "refunds_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"staff": {
                  Row: {
                    "created_at": string,"full_name": string,"id": string,"is_active": boolean,"pin_hash": string | null,"role": Database["public"]['Enums']["staff_role"],"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"full_name": string,"id": string,"is_active"?: boolean,"pin_hash"?: string | null,"role": Database["public"]['Enums']["staff_role"],"venue_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"full_name"?: string,"id"?: string,"is_active"?: boolean,"pin_hash"?: string | null,"role"?: Database["public"]['Enums']["staff_role"],"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"stock_count_lines": {
                  Row: {
                    "count_id": string,"counted": number | null,"created_at": string,"expected": number,"id": string,"ingredient_id": string,"on_hand_at_save": number | null,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "count_id": string,"counted"?: number | null,"created_at"?: string,"expected": number,"id"?: string,"ingredient_id": string,"on_hand_at_save"?: number | null,"venue_id"?: string
                  }
                  Update: {
                    "count_id"?: string,"counted"?: number | null,"created_at"?: string,"expected"?: number,"id"?: string,"ingredient_id"?: string,"on_hand_at_save"?: number | null,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_count_lines_count_id_fkey"
      columns: ["count_id"]
isOneToOne: false
      referencedRelation: "stock_counts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_count_lines_ingredient_id_fkey"
      columns: ["ingredient_id"]
isOneToOne: false
      referencedRelation: "ingredients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_count_lines_ingredient_id_fkey"
      columns: ["ingredient_id"]
isOneToOne: false
      referencedRelation: "v_ingredient_on_hand"
      referencedColumns: ["ingredient_id"]
    },{
      foreignKeyName: "stock_count_lines_ingredient_id_fkey"
      columns: ["ingredient_id"]
isOneToOne: false
      referencedRelation: "v_low_stock"
      referencedColumns: ["ingredient_id"]
    },{
      foreignKeyName: "stock_count_lines_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"stock_counts": {
                  Row: {
                    "created_at": string,"finalized_at": string | null,"finalized_by": string | null,"id": string,"started_at": string,"started_by": string,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"finalized_at"?: string | null,"finalized_by"?: string | null,"id"?: string,"started_at"?: string,"started_by": string,"venue_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"finalized_at"?: string | null,"finalized_by"?: string | null,"id"?: string,"started_at"?: string,"started_by"?: string,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_counts_finalized_by_fkey"
      columns: ["finalized_by"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_counts_started_by_fkey"
      columns: ["started_by"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_counts_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"stock_movements": {
                  Row: {
                    "actor_id": string | null,"created_at": string,"id": string,"ingredient_id": string,"kind": Database["public"]['Enums']["movement_kind"],"qty": number,"ref_id": string | null,"ref_table": string | null,"unit_cost": number | null,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"created_at"?: string,"id"?: string,"ingredient_id": string,"kind": Database["public"]['Enums']["movement_kind"],"qty": number,"ref_id"?: string | null,"ref_table"?: string | null,"unit_cost"?: number | null,"venue_id"?: string
                  }
                  Update: {
                    "actor_id"?: string | null,"created_at"?: string,"id"?: string,"ingredient_id"?: string,"kind"?: Database["public"]['Enums']["movement_kind"],"qty"?: number,"ref_id"?: string | null,"ref_table"?: string | null,"unit_cost"?: number | null,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_movements_ingredient_id_fkey"
      columns: ["ingredient_id"]
isOneToOne: false
      referencedRelation: "ingredients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_ingredient_id_fkey"
      columns: ["ingredient_id"]
isOneToOne: false
      referencedRelation: "v_ingredient_on_hand"
      referencedColumns: ["ingredient_id"]
    },{
      foreignKeyName: "stock_movements_ingredient_id_fkey"
      columns: ["ingredient_id"]
isOneToOne: false
      referencedRelation: "v_low_stock"
      referencedColumns: ["ingredient_id"]
    },{
      foreignKeyName: "stock_movements_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"suppliers": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"phone": string | null,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"phone"?: string | null,"venue_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"phone"?: string | null,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "suppliers_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"tab_adjustments": {
                  Row: {
                    "amount": number,"applied_by": string,"authorized_by": string | null,"created_at": string,"id": string,"kind": Database["public"]['Enums']["adjustment_kind"],"reason": string,"tab_id": string,"value": number,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"applied_by": string,"authorized_by"?: string | null,"created_at"?: string,"id"?: string,"kind": Database["public"]['Enums']["adjustment_kind"],"reason": string,"tab_id": string,"value": number,"venue_id"?: string
                  }
                  Update: {
                    "amount"?: number,"applied_by"?: string,"authorized_by"?: string | null,"created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["adjustment_kind"],"reason"?: string,"tab_id"?: string,"value"?: number,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tab_adjustments_applied_by_fkey"
      columns: ["applied_by"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tab_adjustments_authorized_by_fkey"
      columns: ["authorized_by"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tab_adjustments_tab_id_fkey"
      columns: ["tab_id"]
isOneToOne: false
      referencedRelation: "tabs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tab_adjustments_tab_id_fkey"
      columns: ["tab_id"]
isOneToOne: false
      referencedRelation: "v_floor_status"
      referencedColumns: ["tab_id"]
    },{
      foreignKeyName: "tab_adjustments_tab_id_fkey"
      columns: ["tab_id"]
isOneToOne: false
      referencedRelation: "v_open_tabs"
      referencedColumns: ["tab_id"]
    },{
      foreignKeyName: "tab_adjustments_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"tabs": {
                  Row: {
                    "closed_at": string | null,"covers": number,"created_at": string,"day_session_id": string,"id": string,"idempotency_key": string,"merged_into_tab_id": string | null,"note": string | null,"opened_at": string,"status": Database["public"]['Enums']["tab_status"],"table_id": string | null,"venue_id": string,"waiter_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "closed_at"?: string | null,"covers"?: number,"created_at"?: string,"day_session_id": string,"id"?: string,"idempotency_key": string,"merged_into_tab_id"?: string | null,"note"?: string | null,"opened_at"?: string,"status"?: Database["public"]['Enums']["tab_status"],"table_id"?: string | null,"venue_id"?: string,"waiter_id": string
                  }
                  Update: {
                    "closed_at"?: string | null,"covers"?: number,"created_at"?: string,"day_session_id"?: string,"id"?: string,"idempotency_key"?: string,"merged_into_tab_id"?: string | null,"note"?: string | null,"opened_at"?: string,"status"?: Database["public"]['Enums']["tab_status"],"table_id"?: string | null,"venue_id"?: string,"waiter_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tabs_day_session_id_fkey"
      columns: ["day_session_id"]
isOneToOne: false
      referencedRelation: "day_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tabs_merged_into_tab_id_fkey"
      columns: ["merged_into_tab_id"]
isOneToOne: false
      referencedRelation: "tabs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tabs_merged_into_tab_id_fkey"
      columns: ["merged_into_tab_id"]
isOneToOne: false
      referencedRelation: "v_floor_status"
      referencedColumns: ["tab_id"]
    },{
      foreignKeyName: "tabs_merged_into_tab_id_fkey"
      columns: ["merged_into_tab_id"]
isOneToOne: false
      referencedRelation: "v_open_tabs"
      referencedColumns: ["tab_id"]
    },{
      foreignKeyName: "tabs_table_id_fkey"
      columns: ["table_id"]
isOneToOne: false
      referencedRelation: "dining_tables"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tabs_table_id_fkey"
      columns: ["table_id"]
isOneToOne: false
      referencedRelation: "v_floor_status"
      referencedColumns: ["table_id"]
    },{
      foreignKeyName: "tabs_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tabs_waiter_id_fkey"
      columns: ["waiter_id"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    }
                  ]
                },"tax_groups": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"rate_bps": number,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"rate_bps": number,"venue_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"rate_bps"?: number,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tax_groups_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"till_shifts": {
                  Row: {
                    "closed_at": string | null,"closed_by": string | null,"counted_cash": number | null,"created_at": string,"device_id": string,"expected_cash": number | null,"id": string,"opened_at": string,"opening_float": number,"staff_id": string,"variance": number | null,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "closed_at"?: string | null,"closed_by"?: string | null,"counted_cash"?: number | null,"created_at"?: string,"device_id": string,"expected_cash"?: number | null,"id"?: string,"opened_at"?: string,"opening_float": number,"staff_id": string,"variance"?: number | null,"venue_id"?: string
                  }
                  Update: {
                    "closed_at"?: string | null,"closed_by"?: string | null,"counted_cash"?: number | null,"created_at"?: string,"device_id"?: string,"expected_cash"?: number | null,"id"?: string,"opened_at"?: string,"opening_float"?: number,"staff_id"?: string,"variance"?: number | null,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "till_shifts_closed_by_fkey"
      columns: ["closed_by"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "till_shifts_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "till_shifts_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"venue_settings": {
                  Row: {
                    "created_at": string,"currency": string,"receipt_footer_ar": string,"receipt_footer_en": string,"receipt_header_ar": string,"receipt_header_en": string,"service_charge_bps": number,"variance_alert_iqd": number,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"currency"?: string,"receipt_footer_ar"?: string,"receipt_footer_en"?: string,"receipt_header_ar"?: string,"receipt_header_en"?: string,"service_charge_bps"?: number,"variance_alert_iqd"?: number,"venue_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"currency"?: string,"receipt_footer_ar"?: string,"receipt_footer_en"?: string,"receipt_header_ar"?: string,"receipt_header_en"?: string,"service_charge_bps"?: number,"variance_alert_iqd"?: number,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "venue_settings_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: true
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"venues": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"timezone": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"timezone"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"timezone"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "v_floor_status": {
                  Row: {
                    "area_id": string,"covers": number | null,"due": number | null,"grid_x": number,"grid_y": number,"label": string,"opened_at": string | null,"seats": number,"tab_id": string | null,"table_id": string,"total": number | null,"waiter_id": string | null,"waiter_name": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "dining_tables_area_id_fkey"
      columns: ["area_id"]
isOneToOne: false
      referencedRelation: "floor_areas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tabs_waiter_id_fkey"
      columns: ["waiter_id"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    }
                  ]
                },"v_ingredient_on_hand": {
                  Row: {
                    "cost_per_unit": number,"ingredient_id": string,"is_active": boolean,"name_ar": string,"name_en": string,"on_hand": number | null,"reorder_point": number,"unit": Database["public"]['Enums']["stock_unit"],"value": number | null,"venue_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "ingredients_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"v_item_cost": {
                  Row: {
                    "cost": number | null,"has_recipe": boolean | null,"margin": number | null,"menu_item_id": string,"name_ar": string,"name_en": string,"price": number | null,"venue_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "menu_items_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"v_low_stock": {
                  Row: {
                    "cost_per_unit": number,"ingredient_id": string,"is_active": boolean,"name_ar": string,"name_en": string,"on_hand": number | null,"reorder_point": number,"unit": Database["public"]['Enums']["stock_unit"],"value": number | null,"venue_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "ingredients_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"v_open_tabs": {
                  Row: {
                    "covers": number,"day_session_id": string,"discount": number | null,"due": number | null,"opened_at": string,"paid": number | null,"subtotal": number | null,"tab_id": string,"table_id": string | null,"table_label": string | null,"tax": number | null,"total": number | null,"waiter_id": string,"waiter_name": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "tabs_day_session_id_fkey"
      columns: ["day_session_id"]
isOneToOne: false
      referencedRelation: "day_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tabs_table_id_fkey"
      columns: ["table_id"]
isOneToOne: false
      referencedRelation: "dining_tables"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tabs_table_id_fkey"
      columns: ["table_id"]
isOneToOne: false
      referencedRelation: "v_floor_status"
      referencedColumns: ["table_id"]
    },{
      foreignKeyName: "tabs_waiter_id_fkey"
      columns: ["waiter_id"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            [_ in never]: never
          }
          Enums: {
            "adjustment_kind": "discount_percent"|"discount_amount","cash_movement_kind": "paid_out"|"pay_in"|"drop","movement_kind": "delivery"|"sale"|"void_return"|"waste"|"count_adjust","payment_method": "cash"|"card","staff_role": "waiter"|"cashier"|"manager"|"owner","stock_unit": "g"|"ml"|"pc","tab_status": "open"|"settled"|"void"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "app": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "adjustment_kind": ["discount_percent", "discount_amount"],"cash_movement_kind": ["paid_out", "pay_in", "drop"],"movement_kind": ["delivery", "sale", "void_return", "waste", "count_adjust"],"payment_method": ["cash", "card"],"staff_role": ["waiter", "cashier", "manager", "owner"],"stock_unit": ["g", "ml", "pc"],"tab_status": ["open", "settled", "void"]
          }
        }
} as const
