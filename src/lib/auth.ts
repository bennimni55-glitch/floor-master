// Single source of truth for floor-master authorization.
// user_app_access is a self-scoped VIEW (computed for auth.uid()), but we
// still filter by user_id explicitly — defense in depth and clearer intent.
import type { SupabaseClient } from '@supabase/supabase-js';

export interface FloorAccess {
  user_id: string | null;
  can_access_inventory: boolean;
  can_access_orders: boolean;
  can_access_request_form: boolean;
  can_access_floor_master: boolean;
  is_floor_master_admin: boolean;
}

/** Current user + their computed app access; user=null when signed out. */
export async function getFloorAccess(supabase: SupabaseClient) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, access: null };
  const { data: access } = await supabase
    .from('user_app_access')
    .select('*')
    .eq('user_id', user.id)
    .single();
  return { user, access: (access ?? null) as FloorAccess | null };
}

/**
 * The ONE admin check for both middleware and API routes:
 * admin = user_app_access.is_floor_master_admin (owner OR manager roles).
 */
export async function requireFloorAdmin(supabase: SupabaseClient) {
  const { user, access } = await getFloorAccess(supabase);
  return { authorized: access?.is_floor_master_admin === true, user };
}
