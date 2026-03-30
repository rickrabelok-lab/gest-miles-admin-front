import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL ?? "";
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = Boolean(url && anon);

export const supabase = createClient(url || "https://placeholder.supabase.co", anon || "placeholder", {
  auth: { persistSession: true, autoRefreshToken: true },
});

/** Cliente sem persistir sessão — usado só em `createUser` para não trocar a sessão do admin. */
export const supabaseNoPersist = createClient(url || "https://placeholder.supabase.co", anon || "placeholder", {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    /** Evita aviso "Multiple GoTrueClient instances" (mesma storage key que o cliente principal). */
    storageKey: "sb-gest-miles-admin-ephemeral",
    storage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
  },
});
