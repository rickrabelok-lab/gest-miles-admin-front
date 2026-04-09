import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const rawUrl = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const rawKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

/** Igual ao padrão manager/usuario: false se o build/deploy não definiu as envs. */
export const isSupabaseConfigured = Boolean(rawUrl && rawKey);

const fallbackUrl = "https://placeholder.supabase.co";
const fallbackKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.placeholder";

/** Cliente para apps Vite; variáveis vêm do `.env` / `.env.local` do app (não do pacote). */
export const supabase: SupabaseClient = createClient(
  isSupabaseConfigured ? rawUrl : fallbackUrl,
  isSupabaseConfigured ? rawKey : fallbackKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);
