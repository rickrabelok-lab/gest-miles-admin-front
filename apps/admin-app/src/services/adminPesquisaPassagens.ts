import { supabase } from "@/lib/supabase";

export interface PesquisaPassagensPlanLimitEntry {
  max_searches_per_day?: number | null;
  max_searches_equipe_per_day?: number | null;
  monthly_token_allowance?: number | null;
  monthly_token_allowance_equipe?: number | null;
}

export interface PesquisaPassagensConfigAdmin {
  id: number;
  feature_enabled: boolean;
  allowed_roles: string[] | null;
  allowed_equipe_ids: string[] | null;
  denied_usuario_ids: string[] | null;
  allowed_plan_slugs: string[] | null;
  max_searches_user_per_day: number | null;
  max_searches_equipe_per_day: number | null;
  destination_images: Record<string, string>;
  /** Logos rail / wordmark (chaves estáveis: rail_logo, rail_wordmark). */
  brand_assets: Record<string, string>;
  /** Logos por programa: smiles, tudoazul, latam, tap, aa. */
  airline_logos: Record<string, string>;
  /**
   * Logos globais por `program_id` (livelo, latam-pass, …) — círculo do cartão em «Meus programas».
   * Sobrescreve iniciais quando o cliente/gestor não definiu outra imagem.
   */
  program_card_logos: Record<string, string>;
  tokens_per_search: number;
  monthly_token_allowance_user: number | null;
  monthly_token_allowance_equipe: number | null;
  plan_limits: Record<string, PesquisaPassagensPlanLimitEntry> | null;
  updated_at: string | null;
  updated_by: string | null;
}

function parseJsonObjectStringMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = k.trim();
    if (!key || typeof v !== "string") continue;
    const url = v.trim();
    if (url) out[key] = url;
  }
  return out;
}

function parseRow(raw: Record<string, unknown>): PesquisaPassagensConfigAdmin {
  const dest = raw.destination_images;
  const plan = raw.plan_limits;
  return {
    id: Number(raw.id ?? 1),
    feature_enabled: Boolean(raw.feature_enabled),
    allowed_roles: (raw.allowed_roles as string[] | null) ?? null,
    allowed_equipe_ids: (raw.allowed_equipe_ids as string[] | null) ?? null,
    denied_usuario_ids: (raw.denied_usuario_ids as string[] | null) ?? null,
    allowed_plan_slugs: (raw.allowed_plan_slugs as string[] | null) ?? null,
    max_searches_user_per_day:
      raw.max_searches_user_per_day == null ? null : Number(raw.max_searches_user_per_day),
    max_searches_equipe_per_day:
      raw.max_searches_equipe_per_day == null ? null : Number(raw.max_searches_equipe_per_day),
    destination_images:
      dest && typeof dest === "object" && !Array.isArray(dest) ? (dest as Record<string, string>) : {},
    brand_assets: parseJsonObjectStringMap(raw.brand_assets),
    airline_logos: parseJsonObjectStringMap(raw.airline_logos),
    program_card_logos: parseJsonObjectStringMap(raw.program_card_logos),
    tokens_per_search:
      raw.tokens_per_search == null || raw.tokens_per_search === ""
        ? 1
        : Math.max(1, Math.floor(Number(raw.tokens_per_search))),
    monthly_token_allowance_user:
      raw.monthly_token_allowance_user == null ? null : Number(raw.monthly_token_allowance_user),
    monthly_token_allowance_equipe:
      raw.monthly_token_allowance_equipe == null ? null : Number(raw.monthly_token_allowance_equipe),
    plan_limits:
      plan && typeof plan === "object" && !Array.isArray(plan)
        ? (plan as Record<string, PesquisaPassagensPlanLimitEntry>)
        : null,
    updated_at: raw.updated_at != null ? String(raw.updated_at) : null,
    updated_by: raw.updated_by != null ? String(raw.updated_by) : null,
  };
}

export async function fetchPesquisaPassagensConfig(): Promise<{
  data: PesquisaPassagensConfigAdmin | null;
  error: string | null;
}> {
  const { data, error } = await supabase.from("pesquisa_passagens_config").select("*").eq("id", 1).maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!data) {
    return {
      data: {
        id: 1,
        feature_enabled: true,
        allowed_roles: null,
        allowed_equipe_ids: null,
        denied_usuario_ids: null,
        allowed_plan_slugs: null,
        max_searches_user_per_day: null,
        max_searches_equipe_per_day: null,
        destination_images: {},
        brand_assets: {},
        airline_logos: {},
        program_card_logos: {},
        tokens_per_search: 1,
        monthly_token_allowance_user: null,
        monthly_token_allowance_equipe: null,
        plan_limits: null,
        updated_at: null,
        updated_by: null,
      },
      error: null,
    };
  }
  return { data: parseRow(data as Record<string, unknown>), error: null };
}

/** Grava só imagens/branding — não toca em colunas de tokens nem no resto da config (evita erros se a BD não tiver essas colunas). */
export async function updatePesquisaPassagensBrandingAssets(input: {
  destination_images: Record<string, string>;
  brand_assets: Record<string, string>;
  airline_logos: Record<string, string>;
  program_card_logos: Record<string, string>;
  updated_by: string | null;
}): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("pesquisa_passagens_config")
    .update({
      destination_images: input.destination_images,
      brand_assets: input.brand_assets,
      airline_logos: input.airline_logos,
      program_card_logos: input.program_card_logos,
      updated_at: new Date().toISOString(),
      updated_by: input.updated_by,
    })
    .eq("id", 1);
  return { error: error?.message ?? null };
}

export async function savePesquisaPassagensConfig(input: {
  feature_enabled: boolean;
  allowed_roles: string[] | null;
  allowed_equipe_ids: string[] | null;
  denied_usuario_ids: string[] | null;
  allowed_plan_slugs: string[] | null;
  max_searches_user_per_day: number | null;
  max_searches_equipe_per_day: number | null;
  destination_images: Record<string, string>;
  brand_assets: Record<string, string>;
  airline_logos: Record<string, string>;
  program_card_logos: Record<string, string>;
  tokens_per_search: number;
  monthly_token_allowance_user: number | null;
  monthly_token_allowance_equipe: number | null;
  plan_limits: Record<string, PesquisaPassagensPlanLimitEntry> | null;
  updated_by: string | null;
}): Promise<{ error: string | null }> {
  // Não enviar colunas de tokens no upsert até existirem na tabela (schema cache do PostgREST).
  const { error } = await supabase.from("pesquisa_passagens_config").upsert(
    {
      id: 1,
      feature_enabled: input.feature_enabled,
      allowed_roles: input.allowed_roles,
      allowed_equipe_ids: input.allowed_equipe_ids,
      denied_usuario_ids: input.denied_usuario_ids,
      allowed_plan_slugs: input.allowed_plan_slugs,
      max_searches_user_per_day: input.max_searches_user_per_day,
      max_searches_equipe_per_day: input.max_searches_equipe_per_day,
      destination_images: input.destination_images,
      brand_assets: input.brand_assets,
      airline_logos: input.airline_logos,
      program_card_logos: input.program_card_logos,
      tokens_per_search: Math.max(1, input.tokens_per_search),
      plan_limits: input.plan_limits,
      updated_at: new Date().toISOString(),
      updated_by: input.updated_by,
    },
    { onConflict: "id" },
  );
  return { error: error?.message ?? null };
}
