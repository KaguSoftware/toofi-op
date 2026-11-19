export interface Cat {
  id: string;
  name_en: string;
  name_ar: string;
  sort: number;
  is_active: boolean;
}
export interface Item {
  id: string;
  category_id: string;
  name_en: string;
  name_ar: string;
  price: number;
  tax_group_id: string;
  is_active: boolean;
  sort: number;
}
export interface Tax {
  id: string;
  name: string;
  rate_bps: number;
}
export interface Group {
  id: string;
  name_en: string;
  name_ar: string;
  min_select: number;
  max_select: number;
}
export interface Mod {
  id: string;
  group_id: string;
  name_en: string;
  name_ar: string;
  price_delta: number;
  is_active: boolean;
}
export interface Link {
  menu_item_id: string;
  group_id: string;
}
