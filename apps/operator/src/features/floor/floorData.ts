// Floor reads, shared by the floor screen and the guest inbox (same query keys, same cache).
import { supabase } from '../../lib/supabase';
import type { FloorArea, FloorRow } from './floorLogic';

export async function fetchAreas(): Promise<FloorArea[]> {
  const { data, error } = await supabase
    .from('floor_areas')
    .select('id, name_en, name_ar, sort')
    .order('sort');
  if (error) throw error;
  return (data ?? []) as FloorArea[];
}

export async function fetchStatus(): Promise<FloorRow[]> {
  const { data, error } = await supabase.from('v_floor_status').select('*');
  if (error) throw error;
  return (data ?? []) as unknown as FloorRow[];
}
