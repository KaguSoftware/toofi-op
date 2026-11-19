import { useQuery } from '@tanstack/react-query';
import type { Locale } from '@rop/i18n';
import { QK } from '../../lib/queryKeys';
import { selectRows } from '../manage/shared';
import type { Unit } from './stockLogic';

export interface Ingredient {
  id: string;
  name_en: string;
  name_ar: string;
  unit: Unit;
  reorder_point: number;
  cost_per_unit: number;
  is_active: boolean;
}
export interface Supplier {
  id: string;
  name: string;
  phone: string | null;
}

export const ingredientName = (i: { name_en: string; name_ar: string }, locale: Locale): string =>
  locale === 'ar' ? i.name_ar : i.name_en;

export function useIngredients() {
  return useQuery({
    queryKey: QK.stock('ingredients'),
    queryFn: () =>
      selectRows<Ingredient>('ingredients', 'id, name_en, name_ar, unit, reorder_point, cost_per_unit, is_active', { order: 'name_en' }),
  });
}

export function useSuppliers() {
  return useQuery({
    queryKey: QK.stock('suppliers'),
    queryFn: () => selectRows<Supplier>('suppliers', 'id, name, phone', { order: 'name' }),
  });
}
