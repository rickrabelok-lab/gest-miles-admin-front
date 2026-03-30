import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL ?? "";
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = Boolean(url && anon);

/** Cliente único do app; só é usado com rotas montadas quando `isSupabaseConfigured` é true. */
export const supabase = createClient(url || "https://placeholder.supabase.co", anon || "placeholder-anon-key", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
