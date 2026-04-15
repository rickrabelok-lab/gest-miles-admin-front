import { listConfiguracoes, upsertConfiguracao } from "@/lib/adminApi";

export interface ApiKey {
  id: string;
  nome: string;
  descricao?: string;
  keyMascarada: string;
  prefixo: "sk_live_gm_" | "sk_test_gm_";
  ambiente: "live" | "sandbox";
  escopos: ("read" | "write" | "admin")[];
  status: "ativa" | "revogada";
  limitePorHora: number;
  totalChamadasHoje: number;
  ultimoUso: string | null;
  criadaEm: string;
  criadaPor: string;
  revogadaEm?: string;
}

export interface Webhook {
  id: string;
  url: string;
  nome: string;
  eventos: string[];
  status: "ativo" | "inativo" | "com_falhas";
  secret?: string;
  totalDisparosHoje: number;
  taxaSucesso: number;
  ultimoDisparo?: string;
  ultimaFalha?: string;
}

export interface WebhookLog {
  id: string;
  webhookId: string;
  evento: string;
  statusCode: number;
  tempoResposta: number;
  tentativa: number;
  maxTentativas: number;
  payload: string;
  response?: string;
  criadoEm: string;
  sucesso: boolean;
}

export interface ApiWebhooksSnapshot {
  version: 1;
  apiKeys: ApiKey[];
  webhooks: Webhook[];
  logs: WebhookLog[];
}

export const WEBHOOK_EVENTS = [
  "lead.criado",
  "lead.convertido",
  "cliente.criado",
  "cliente.inativo",
  "assinatura.criada",
  "assinatura.cancelada",
  "emissao.criada",
  "reuniao.agendada",
  "pagamento.recebido",
  "pagamento.falhou",
] as const;

const STORAGE_KEY = "gm-admin-api-webhooks-v1";
const BACKEND_CONFIG_KEY = "admin_api_webhooks_snapshot";

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function todayIsoAt(hour: number, minute: number): string {
  const now = new Date();
  now.setHours(hour, minute, 0, 0);
  return now.toISOString();
}

export function maskApiKey(fullKey: string): string {
  const tail = fullKey.slice(-4);
  const prefix = fullKey.startsWith("sk_test_gm_") ? "sk_test_gm_" : "sk_live_gm_";
  return `${prefix}••••••••••••••••••••••••••••••${tail}`;
}

export function generateApiKey(prefix: "sk_live_gm_" | "sk_test_gm_"): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let value = prefix;
  for (let i = 0; i < 32; i += 1) {
    value += chars[Math.floor(Math.random() * chars.length)]!;
  }
  return value;
}

export function generateSecret(): string {
  const chars = "abcdef0123456789";
  let value = "whsec_";
  for (let i = 0; i < 32; i += 1) {
    value += chars[Math.floor(Math.random() * chars.length)]!;
  }
  return value;
}

function seed(): ApiWebhooksSnapshot {
  return {
    version: 1,
    apiKeys: [
      {
        id: "key-1",
        nome: "Integração n8n — Automações",
        descricao: "Usada para automações de follow-up e alertas de leads",
        keyMascarada: "sk_live_gm_••••••••••••••••••••••••••••••4f2a",
        prefixo: "sk_live_gm_",
        ambiente: "live",
        escopos: ["read", "write"],
        status: "ativa",
        limitePorHora: 2000,
        totalChamadasHoje: 1102,
        ultimoUso: isoMinutesAgo(120),
        criadaEm: "2026-01-10T10:00:00.000Z",
        criadaPor: "rick",
      },
      {
        id: "key-2",
        nome: "Zapier — CRM externo",
        descricao: "Sincronização de leads com CRM do parceiro",
        keyMascarada: "sk_live_gm_••••••••••••••••••••••••••••••9c1d",
        prefixo: "sk_live_gm_",
        ambiente: "live",
        escopos: ["read"],
        status: "ativa",
        limitePorHora: 1000,
        totalChamadasHoje: 145,
        ultimoUso: isoMinutesAgo(24 * 60),
        criadaEm: "2026-03-15T09:30:00.000Z",
        criadaPor: "rick",
      },
      {
        id: "key-3",
        nome: "Teste local — Dev",
        descricao: "Usada em ambiente de desenvolvimento",
        keyMascarada: "sk_live_gm_••••••••••••••••••••••••••••••(revogada)",
        prefixo: "sk_live_gm_",
        ambiente: "sandbox",
        escopos: ["read", "write", "admin"],
        status: "revogada",
        limitePorHora: 500,
        totalChamadasHoje: 0,
        ultimoUso: null,
        criadaEm: "2026-02-02T09:00:00.000Z",
        criadaPor: "rick",
        revogadaEm: "2026-04-02T13:00:00.000Z",
      },
    ],
    webhooks: [
      {
        id: "wh-1",
        url: "https://hooks.n8n.io/webhook/gestmiles-leads",
        nome: "n8n — Automação de leads",
        eventos: ["lead.criado", "lead.convertido", "reuniao.agendada", "cliente.inativo"],
        status: "ativo",
        totalDisparosHoje: 247,
        taxaSucesso: 97,
        ultimoDisparo: isoMinutesAgo(15),
      },
      {
        id: "wh-2",
        url: "https://api.crm-parceiro.com/webhook/gestmiles",
        nome: "CRM Parceiro — Sync de clientes",
        eventos: ["assinatura.criada", "assinatura.cancelada", "cliente.criado"],
        status: "com_falhas",
        totalDisparosHoje: 89,
        taxaSucesso: 66,
        ultimoDisparo: isoMinutesAgo(130),
        ultimaFalha: isoMinutesAgo(120),
      },
    ],
    logs: [
      {
        id: "log-1",
        webhookId: "wh-1",
        evento: "lead.criado",
        statusCode: 200,
        tempoResposta: 142,
        tentativa: 1,
        maxTentativas: 1,
        payload: JSON.stringify({ id: "ld_001", evento: "lead.criado", nome: "Maria" }, null, 2),
        response: JSON.stringify({ ok: true }, null, 2),
        criadoEm: todayIsoAt(10, 34),
        sucesso: true,
      },
      {
        id: "log-2",
        webhookId: "wh-2",
        evento: "assinatura.criada",
        statusCode: 503,
        tempoResposta: 15000,
        tentativa: 3,
        maxTentativas: 3,
        payload: JSON.stringify({ id: "sub_001", evento: "assinatura.criada" }, null, 2),
        response: JSON.stringify({ error: "timeout" }, null, 2),
        criadoEm: todayIsoAt(10, 21),
        sucesso: false,
      },
      {
        id: "log-3",
        webhookId: "wh-1",
        evento: "reuniao.agendada",
        statusCode: 200,
        tempoResposta: 89,
        tentativa: 1,
        maxTentativas: 1,
        payload: JSON.stringify({ id: "meeting_12", evento: "reuniao.agendada" }, null, 2),
        response: JSON.stringify({ ok: true }, null, 2),
        criadoEm: todayIsoAt(9, 58),
        sucesso: true,
      },
      {
        id: "log-4",
        webhookId: "wh-2",
        evento: "cliente.criado",
        statusCode: 404,
        tempoResposta: 234,
        tentativa: 3,
        maxTentativas: 3,
        payload: JSON.stringify({ id: "cl_010", evento: "cliente.criado" }, null, 2),
        response: JSON.stringify({ error: "not_found" }, null, 2),
        criadoEm: todayIsoAt(9, 14),
        sucesso: false,
      },
      {
        id: "log-5",
        webhookId: "wh-2",
        evento: "assinatura.cancelada",
        statusCode: 500,
        tempoResposta: 1200,
        tentativa: 3,
        maxTentativas: 3,
        payload: JSON.stringify({ id: "sub_045", evento: "assinatura.cancelada" }, null, 2),
        response: JSON.stringify({ error: "internal_error" }, null, 2),
        criadoEm: isoMinutesAgo(400),
        sucesso: false,
      },
    ],
  };
}

export function loadApiWebhooksSnapshot(): ApiWebhooksSnapshot {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw) as ApiWebhooksSnapshot;
    if (!parsed?.apiKeys || !parsed?.webhooks || !parsed?.logs) return seed();
    return parsed;
  } catch {
    return seed();
  }
}

export function saveApiWebhooksSnapshot(snapshot: ApiWebhooksSnapshot): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  void saveApiWebhooksSnapshotToBackend(snapshot);
}

function isValidApiWebhooksSnapshot(value: unknown): value is ApiWebhooksSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ApiWebhooksSnapshot>;
  return Array.isArray(candidate.apiKeys) && Array.isArray(candidate.webhooks) && Array.isArray(candidate.logs);
}

export async function loadApiWebhooksSnapshotFromBackend(): Promise<ApiWebhooksSnapshot> {
  const local = loadApiWebhooksSnapshot();
  try {
    const rows = await listConfiguracoes();
    const row = rows.find((item) => item.chave === BACKEND_CONFIG_KEY);
    if (!row) return local;
    if (!isValidApiWebhooksSnapshot(row.valor)) return local;
    return { ...local, ...row.valor };
  } catch {
    return local;
  }
}

export async function saveApiWebhooksSnapshotToBackend(snapshot: ApiWebhooksSnapshot): Promise<void> {
  try {
    await upsertConfiguracao({
      chave: BACKEND_CONFIG_KEY,
      valor: snapshot,
      descricao: "Snapshot de API keys e webhooks do admin",
    });
  } catch {
    // Fallback local já cobre indisponibilidade de backend.
  }
}

export function newApiKeyId(): string {
  return `key-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function newWebhookId(): string {
  return `wh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function newWebhookLogId(): string {
  return `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
