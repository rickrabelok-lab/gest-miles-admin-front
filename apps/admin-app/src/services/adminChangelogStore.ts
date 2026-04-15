import { listConfiguracoes, upsertConfiguracao } from "@/lib/adminApi";

export type ChangeType = "nova" | "melhoria" | "correcao" | "seguranca" | "deprecado";
export type VersionStatus = "rascunho" | "publicado" | "agendado";
export type PublishMode = "agora" | "agendar" | "rascunho";

export interface Mudanca {
  id: string;
  tipo: ChangeType;
  descricao: string;
}

export interface Versao {
  id: string;
  numero: string;
  titulo: string;
  mudancas: Mudanca[];
  status: VersionStatus;
  audiencia: string[];
  publicadaEm?: string;
  agendadaPara?: string;
  criadaEm: string;
  criadaPor: string;
  totalVisualizacoes: number;
  totalLeituras: number;
  taxaLeitura: number;
}

export interface ChangelogLeitura {
  perfilId: string;
  versaoId: string;
  lidaEm: string;
}

export interface ChangelogNotificacoes {
  inApp: boolean;
  email: boolean;
  whatsapp: boolean;
}

export interface ChangelogState {
  version: 1;
  versoes: Versao[];
  leituras: ChangelogLeitura[];
  notificacoes: ChangelogNotificacoes;
}

const STORAGE_KEY = "gm-admin-changelog-v1";
const BACKEND_CONFIG_KEY = "admin_changelog_snapshot";

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function seedState(): ChangelogState {
  const v142: Versao = {
    id: "v-142",
    numero: "v1.4.2",
    titulo: "Link público de captação + melhorias no CRM",
    status: "publicado",
    publicadaEm: isoDaysAgo(1),
    criadaEm: isoDaysAgo(2),
    criadaPor: "Rick Rabelo",
    audiencia: ["todos"],
    totalVisualizacoes: 910,
    totalLeituras: 746,
    taxaLeitura: 82,
    mudancas: [
      { id: "m-142-1", tipo: "nova", descricao: "Link público para captação de leads" },
      { id: "m-142-2", tipo: "nova", descricao: "Kanban de leads com cards arrastáveis" },
      { id: "m-142-3", tipo: "melhoria", descricao: "CRM Milhas com filtros avançados" },
      { id: "m-142-4", tipo: "correcao", descricao: "Bug na exportação de emissões por período" },
    ],
  };

  const v141: Versao = {
    id: "v-141",
    numero: "v1.4.1",
    titulo: "Correções de segurança e performance",
    status: "publicado",
    publicadaEm: isoDaysAgo(9),
    criadaEm: isoDaysAgo(10),
    criadaPor: "Rick Rabelo",
    audiencia: ["todos"],
    totalVisualizacoes: 850,
    totalLeituras: 578,
    taxaLeitura: 68,
    mudancas: [
      { id: "m-141-1", tipo: "seguranca", descricao: "Proteção contra força bruta no login" },
      { id: "m-141-2", tipo: "melhoria", descricao: "Tempo de carregamento reduzido em 40%" },
      { id: "m-141-3", tipo: "correcao", descricao: "Sessões expirando antes do prazo" },
    ],
  };

  const v140: Versao = {
    id: "v-140",
    numero: "v1.4.0",
    titulo: "Módulo de Reuniões e alertas automáticos",
    status: "publicado",
    publicadaEm: isoDaysAgo(25),
    criadaEm: isoDaysAgo(26),
    criadaPor: "Rick Rabelo",
    audiencia: ["todos"],
    totalVisualizacoes: 780,
    totalLeituras: 554,
    taxaLeitura: 71,
    mudancas: [
      { id: "m-140-1", tipo: "nova", descricao: "Agendamento de reuniões com clientes" },
      { id: "m-140-2", tipo: "nova", descricao: "Alertas automáticos de milhas vencendo" },
      { id: "m-140-3", tipo: "melhoria", descricao: "Interface do CRM completamente redesenhada" },
    ],
  };

  const v150Draft: Versao = {
    id: "v-150",
    numero: "v1.5.0",
    titulo: "Relatórios exportáveis e melhorias de UX",
    status: "rascunho",
    criadaEm: new Date().toISOString(),
    criadaPor: "Rick Rabelo",
    audiencia: ["todos"],
    totalVisualizacoes: 0,
    totalLeituras: 0,
    taxaLeitura: 0,
    mudancas: [
      { id: "m-150-1", tipo: "nova", descricao: "Relatórios exportáveis em PDF, CSV e Excel" },
      { id: "m-150-2", tipo: "melhoria", descricao: "Dashboard com novos gráficos de performance" },
      { id: "m-150-3", tipo: "correcao", descricao: "Erro ao emitir passagens internacionais" },
    ],
  };

  return {
    version: 1,
    versoes: [v150Draft, v142, v141, v140],
    leituras: [],
    notificacoes: {
      inApp: true,
      email: false,
      whatsapp: false,
    },
  };
}

function isValidChangelogState(value: unknown): value is ChangelogState {
  if (!value || typeof value !== "object") return false;
  const c = value as Partial<ChangelogState>;
  return Array.isArray(c.versoes) && Array.isArray(c.leituras) && !!c.notificacoes;
}

export function loadChangelogState(): ChangelogState {
  if (typeof window === "undefined") return seedState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const parsed = JSON.parse(raw) as ChangelogState;
    if (!isValidChangelogState(parsed)) return seedState();
    return parsed;
  } catch {
    return seedState();
  }
}

export function saveChangelogState(state: ChangelogState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  void saveChangelogStateToBackend(state);
  window.dispatchEvent(new CustomEvent("gm-admin-changelog-updated"));
}

export async function loadChangelogStateFromBackend(): Promise<ChangelogState> {
  const local = loadChangelogState();
  try {
    const rows = await listConfiguracoes();
    const row = rows.find((item) => item.chave === BACKEND_CONFIG_KEY);
    if (!row || !isValidChangelogState(row.valor)) return local;
    return row.valor;
  } catch {
    return local;
  }
}

export async function saveChangelogStateToBackend(state: ChangelogState): Promise<void> {
  try {
    await upsertConfiguracao({
      chave: BACKEND_CONFIG_KEY,
      valor: state,
      descricao: "Snapshot admin do changelog",
    });
  } catch {
    // fallback localStorage
  }
}

export function newVersionId(): string {
  return `v-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function newChangeId(): string {
  return `ch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function countDraftVersions(state: ChangelogState): number {
  return state.versoes.filter((v) => v.status === "rascunho").length;
}
