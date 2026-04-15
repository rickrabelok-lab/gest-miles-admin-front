/**
 * Catálogo de planos (admin) — persistido em localStorage.
 * KPIs de assinantes/MRR cruzam com `subscriptions` em runtime.
 */

export type PlanoStatus = "ativo" | "inativo";

export type PlanoBadge = "popular" | "enterprise";

export type FeatureKey =
  | "crm_milhas"
  | "emissoes"
  | "alertas"
  | "tarefas"
  | "reunioes"
  | "link_captacao"
  | "kanban_leads"
  | "insights_avancados"
  | "relatorios"
  | "white_label"
  | "api_webhooks"
  | "cs_dedicado";

export interface PlanoCatalogo {
  id: string;
  nome: string;
  descricao: string;
  /** Valor em centavos (ex.: R$ 750,00 → 75000) */
  preco_mensal_centavos: number;
  /** 0 = ilimitado */
  max_clientes: number;
  status: PlanoStatus;
  badge?: PlanoBadge;
  trial_dias: number;
  funcionalidades: FeatureKey[];
  stripe_price_id?: string;
}

const STORAGE_KEY = "gm-admin-planos-catalog-v1";

export const ALL_FEATURE_KEYS: FeatureKey[] = [
  "crm_milhas",
  "emissoes",
  "alertas",
  "tarefas",
  "reunioes",
  "link_captacao",
  "kanban_leads",
  "insights_avancados",
  "relatorios",
  "white_label",
  "api_webhooks",
  "cs_dedicado",
];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  crm_milhas: "CRM Milhas",
  emissoes: "Emissões",
  alertas: "Alertas",
  tarefas: "Tarefas",
  reunioes: "Reuniões",
  link_captacao: "Link de captação",
  kanban_leads: "Kanban de leads",
  insights_avancados: "Insights avançados",
  relatorios: "Relatórios PDF/CSV",
  white_label: "White-label B2B",
  api_webhooks: "API & Webhooks",
  cs_dedicado: "CS dedicado",
};

export const DEFAULT_PLANOS: PlanoCatalogo[] = [
  {
    id: "basico",
    nome: "Básico",
    descricao: "Para quem está começando na gestão de milhas",
    preco_mensal_centavos: 750_00,
    max_clientes: 20,
    status: "ativo",
    trial_dias: 7,
    funcionalidades: ["crm_milhas", "emissoes"],
  },
  {
    id: "pro",
    nome: "Pro",
    descricao: "Para gestores em crescimento acelerado",
    preco_mensal_centavos: 2490_00,
    max_clientes: 100,
    status: "ativo",
    badge: "popular",
    trial_dias: 14,
    funcionalidades: [
      "crm_milhas",
      "emissoes",
      "alertas",
      "tarefas",
      "reunioes",
      "link_captacao",
      "kanban_leads",
      "insights_avancados",
      "relatorios",
    ],
  },
  {
    id: "enterprise",
    nome: "Enterprise",
    descricao: "Solução completa para gestoras de alto volume",
    preco_mensal_centavos: 4800_00,
    max_clientes: 0,
    status: "ativo",
    badge: "enterprise",
    trial_dias: 30,
    funcionalidades: ALL_FEATURE_KEYS,
  },
];

function pickString(raw: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export function loadPlanosCatalog(): PlanoCatalogo[] {
  if (typeof window === "undefined") return DEFAULT_PLANOS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PLANOS.map((p) => ({ ...p, funcionalidades: [...p.funcionalidades] }));
    const parsed = JSON.parse(raw) as PlanoCatalogo[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_PLANOS.map((p) => ({ ...p, funcionalidades: [...p.funcionalidades] }));
    return parsed.map((p) => ({
      ...p,
      funcionalidades: Array.isArray(p.funcionalidades) ? [...p.funcionalidades] : [],
    }));
  } catch {
    return DEFAULT_PLANOS.map((p) => ({ ...p, funcionalidades: [...p.funcionalidades] }));
  }
}

export function savePlanosCatalog(planos: PlanoCatalogo[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(planos));
}

/** Associa uma linha de subscription ao id do plano do catálogo. */
export function matchSubscriptionToPlanId(raw: Record<string, unknown>, planos: PlanoCatalogo[]): string | null {
  const blob = `${pickString(raw, ["plan", "plano", "product_name", "tier", "price_id"]) ?? ""}`.toLowerCase();
  for (const pl of planos) {
    const id = pl.id.toLowerCase();
    const nome = pl.nome.toLowerCase();
    if (blob.includes(id) || blob.includes(nome)) return pl.id;
  }
  if (blob.includes("enterprise") || blob.includes("ent")) return planos.find((p) => p.id === "enterprise")?.id ?? "enterprise";
  if (blob.includes("pro")) return planos.find((p) => p.id === "pro")?.id ?? "pro";
  return planos.find((p) => p.id === "basico")?.id ?? "basico";
}

export function formatBrlFromCentavos(c: number): string {
  const n = c / 100;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function newEmptyPlano(): PlanoCatalogo {
  const id = `plano-${Date.now().toString(36)}`;
  return {
    id,
    nome: "Novo plano",
    descricao: "",
    preco_mensal_centavos: 0,
    max_clientes: 20,
    status: "ativo",
    trial_dias: 0,
    funcionalidades: ["crm_milhas", "emissoes"],
  };
}
