/**
 * Catálogo de feature flags (admin) — persistido em localStorage.
 * Em produção, o backend pode substituir esta fonte; o hook useFeatureFlag lê o mesmo snapshot.
 */

export type FlagStatus = "on" | "off" | "beta";

export type PlanoFlag = "basico" | "pro" | "enterprise";

export interface FeatureFlag {
  id: string;
  nome: string;
  key: string;
  descricao: string;
  status: FlagStatus;
  /** Slug interno: gestao | captacao | relatorios | operacional | avancado */
  grupo: string;
  planos: PlanoFlag[];
  totalUsuarios: number;
  usoUnidade: "usuarios" | "equipes";
  criadaEm: string;
  atualizadaEm: string;
}

export interface EquipeOverride {
  id: string;
  equipeId: string;
  equipeNome: string;
  planoPadrao: string;
  flagsExtras: string[];
  /** Chaves em beta concedidas no override */
  flagsBetaExtras: string[];
  flagsRemovidas: string[];
}

export interface FeatureFlagsSnapshot {
  flags: FeatureFlag[];
  overrides: EquipeOverride[];
  version: 1;
}

const STORAGE_KEY = "gm-admin-feature-flags-v1";

export const GROUP_LABELS: Record<string, string> = {
  gestao: "Gestão de clientes",
  captacao: "Captação & Marketing",
  relatorios: "Relatórios & Insights",
  operacional: "Operacional",
  avancado: "Avançado & Integrações",
};

export const GROUP_OPTIONS = [
  { value: "gestao", label: "Gestão de clientes" },
  { value: "captacao", label: "Captação & Marketing" },
  { value: "relatorios", label: "Relatórios & Insights" },
  { value: "operacional", label: "Operacional" },
  { value: "avancado", label: "Avançado & Integrações" },
] as const;

export const GROUP_ORDER = ["gestao", "captacao", "relatorios", "operacional", "avancado"] as const;

function isoNow(): string {
  return new Date().toISOString();
}

function seed(): FeatureFlagsSnapshot {
  const t = isoNow();
  return {
    version: 1,
    flags: [
      {
        id: "ff-crm",
        nome: "CRM Milhas",
        key: "crm_milhas",
        descricao: "Gestão completa de carteiras e programas de milhas",
        status: "on",
        grupo: "gestao",
        planos: ["basico", "pro", "enterprise"],
        totalUsuarios: 310,
        usoUnidade: "usuarios",
        criadaEm: t,
        atualizadaEm: t,
      },
      {
        id: "ff-emis",
        nome: "Emissões",
        key: "emissoes",
        descricao: "Registro e gestão de emissões de passagens",
        status: "on",
        grupo: "gestao",
        planos: ["basico", "pro", "enterprise"],
        totalUsuarios: 284,
        usoUnidade: "usuarios",
        criadaEm: t,
        atualizadaEm: t,
      },
      {
        id: "ff-alert",
        nome: "Alertas inteligentes",
        key: "alertas",
        descricao: "Alertas automáticos de vencimento e oportunidades",
        status: "on",
        grupo: "gestao",
        planos: ["pro", "enterprise"],
        totalUsuarios: 221,
        usoUnidade: "usuarios",
        criadaEm: t,
        atualizadaEm: t,
      },
      {
        id: "ff-cap",
        nome: "Link público de captação",
        key: "link_captacao",
        descricao: "Página pública para captação de leads",
        status: "on",
        grupo: "captacao",
        planos: ["pro", "enterprise"],
        totalUsuarios: 1,
        usoUnidade: "equipes",
        criadaEm: t,
        atualizadaEm: t,
      },
      {
        id: "ff-kan",
        nome: "Kanban de leads",
        key: "kanban_leads",
        descricao: "Gestão visual do funil de captação",
        status: "on",
        grupo: "captacao",
        planos: ["pro", "enterprise"],
        totalUsuarios: 1,
        usoUnidade: "equipes",
        criadaEm: t,
        atualizadaEm: t,
      },
      {
        id: "ff-ins",
        nome: "Insights avançados",
        key: "insights_avancados",
        descricao: "Dashboard de análise e métricas detalhadas",
        status: "on",
        grupo: "relatorios",
        planos: ["pro", "enterprise"],
        totalUsuarios: 221,
        usoUnidade: "usuarios",
        criadaEm: t,
        atualizadaEm: t,
      },
      {
        id: "ff-rel",
        nome: "Relatórios PDF/CSV",
        key: "relatorios_export",
        descricao: "Exportação de relatórios financeiros e operacionais",
        status: "beta",
        grupo: "relatorios",
        planos: ["pro", "enterprise"],
        totalUsuarios: 1,
        usoUnidade: "equipes",
        criadaEm: t,
        atualizadaEm: t,
      },
      {
        id: "ff-tar",
        nome: "Tarefas operacionais",
        key: "tarefas",
        descricao: "Gestão de tarefas da equipe",
        status: "on",
        grupo: "operacional",
        planos: ["pro", "enterprise"],
        totalUsuarios: 180,
        usoUnidade: "usuarios",
        criadaEm: t,
        atualizadaEm: t,
      },
      {
        id: "ff-reu",
        nome: "Reuniões",
        key: "reunioes",
        descricao: "Agenda e registro de reuniões com clientes",
        status: "on",
        grupo: "operacional",
        planos: ["pro", "enterprise"],
        totalUsuarios: 95,
        usoUnidade: "usuarios",
        criadaEm: t,
        atualizadaEm: t,
      },
      {
        id: "ff-api",
        nome: "API & Webhooks",
        key: "api_webhooks",
        descricao: "Acesso à API pública e configuração de webhooks",
        status: "beta",
        grupo: "avancado",
        planos: ["enterprise"],
        totalUsuarios: 0,
        usoUnidade: "equipes",
        criadaEm: t,
        atualizadaEm: t,
      },
      {
        id: "ff-wl",
        nome: "White-label B2B",
        key: "white_label",
        descricao: "Branding personalizado por empresa B2B parceira",
        status: "off",
        grupo: "avancado",
        planos: ["enterprise"],
        totalUsuarios: 0,
        usoUnidade: "equipes",
        criadaEm: t,
        atualizadaEm: t,
      },
      {
        id: "ff-cs",
        nome: "CS dedicado",
        key: "cs_dedicado",
        descricao: "Gestor de sucesso dedicado e SLA prioritário",
        status: "on",
        grupo: "avancado",
        planos: ["enterprise"],
        totalUsuarios: 12,
        usoUnidade: "usuarios",
        criadaEm: t,
        atualizadaEm: t,
      },
    ],
    overrides: [
      {
        id: "ov-1",
        equipeId: "eq-joao",
        equipeNome: "Equipe do João Carvalho",
        planoPadrao: "Plano Enterprise · override ativo",
        flagsExtras: ["crm_milhas", "emissoes", "link_captacao"],
        flagsBetaExtras: ["relatorios_export"],
        flagsRemovidas: [],
      },
    ],
  };
}

export function loadFeatureFlagsSnapshot(): FeatureFlagsSnapshot {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw) as FeatureFlagsSnapshot;
    if (!parsed?.flags || !Array.isArray(parsed.flags)) return seed();
    if (!parsed.overrides) parsed.overrides = [];
    return parsed;
  } catch {
    return seed();
  }
}

export function saveFeatureFlagsSnapshot(s: FeatureFlagsSnapshot): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  window.dispatchEvent(new Event("gm-feature-flags-changed"));
}

export function countBetaFlagsInStorage(): number {
  return loadFeatureFlagsSnapshot().flags.filter((f) => f.status === "beta").length;
}

export function exportFeatureFlagsJson(): string {
  const s = loadFeatureFlagsSnapshot();
  return JSON.stringify(s, null, 2);
}

export function slugifyKey(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 64) || "flag";
}

export function newEmptyFlag(): FeatureFlag {
  const t = isoNow();
  return {
    id: `ff-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    nome: "",
    key: "",
    descricao: "",
    status: "on",
    grupo: "gestao",
    planos: ["pro", "enterprise"],
    totalUsuarios: 0,
    usoUnidade: "usuarios",
    criadaEm: t,
    atualizadaEm: t,
  };
}

/** Resolução simplificada para o app: flag global ligada (on ou beta). */
export function isFeatureGloballyEnabled(key: string): boolean {
  const f = loadFeatureFlagsSnapshot().flags.find((x) => x.key === key);
  if (!f) return false;
  return f.status === "on" || f.status === "beta";
}
