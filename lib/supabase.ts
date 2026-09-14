import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabase() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}
