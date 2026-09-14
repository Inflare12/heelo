import type { SupabaseClient } from "@supabase/supabase-js";

export async function ensureSession(supabase: SupabaseClient) {
  const { data } = await supabase.auth.getSession();
  if (data.session) return { session: data.session, error: null };
  const result = await supabase.auth.signInAnonymously();
  return { session: result.data.session ?? null, error: result.error };
}
