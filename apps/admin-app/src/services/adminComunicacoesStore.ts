/**
 * Comunicações em massa (admin) — persistido em localStorage.
 */

export type CanalEnvio = "email" | "whatsapp" | "ambos";

export type StatusMensagem = "rascunho" | "agendado" | "enviando" | "enviado" | "falhou";

export interface Mensagem {
  id: string;
  titulo: string;
  canal: CanalEnvio;
  assunto?: string;
  corpo: string;
  segmentos: string[];
  totalDestinatarios: number;
  status: StatusMensagem;
  agendadoPara?: string;
  enviadoEm?: string;
  totalEntregues?: number;
  taxaAbertura?: number;
  taxaCliques?: number;
  respostas?: number;
}

export interface TemplateCom {
  id: string;
  nome: string;
  descricao: string;
  canal: CanalEnvio;
  assunto?: string;
  corpo: string;
  emoji: string;
  categoria: string;
}

export interface ComunicacoesState {
  mensagens: Mensagem[];
  templates: TemplateCom[];
  version: 1;
}

export const SEGMENTOS: { key: string; label: string; count: number }[] = [
  { key: "todos", label: "Todos os usuários", count: 310 },
  { key: "gestores", label: "Gestores", count: 10 },
  { key: "cs", label: "CS", count: 3 },
  { key: "clientes_ativos", label: "Clientes ativos", count: 284 },
  { key: "clientes_inativos", label: "Clientes inativos", count: 26 },
  { key: "plano_pro", label: "Plano Pro", count: 5 },
  { key: "plano_enterprise", label: "Plano Enterprise", count: 2 },
  { key: "equipe_especifica", label: "Equipe específica", count: 0 },
];

const STORAGE_KEY = "gm-admin-comunicacoes-v1";

function iso(d: Date): string {
  return d.toISOString();
}

function seed(): ComunicacoesState {
  const t = new Date();
  const abril11 = new Date(t.getFullYear(), 3, 11, 14, 0, 0);
  const mar15 = new Date(t.getFullYear(), 2, 15, 9, 0, 0);
  const abril5 = new Date(t.getFullYear(), 3, 5, 11, 0, 0);
  const abril8 = new Date(t.getFullYear(), 3, 8, 15, 0, 0);
  const maio1 = new Date(t.getFullYear(), 4, 1, 9, 0, 0);
  const maio15 = new Date(t.getFullYear(), 4, 15, 8, 30, 0);

  return {
    version: 1,
    mensagens: [
      {
        id: "msg-seed-mar",
        titulo: "Campanha de março",
        canal: "email",
        assunto: "Atualização",
        corpo: "",
        segmentos: ["gestores", "cs"],
        totalDestinatarios: 723,
        status: "enviado",
        enviadoEm: iso(mar15),
        taxaAbertura: 64,
        taxaCliques: 8,
      },
      {
        id: "msg-seed-0",
        titulo: "Newsletter produto Q2",
        canal: "email",
        assunto: "Atualizações GestMiles",
        corpo: "",
        segmentos: ["clientes_ativos"],
        totalDestinatarios: 511,
        status: "enviado",
        enviadoEm: iso(abril5),
        taxaAbertura: 65,
        taxaCliques: 9,
      },
      {
        id: "msg-seed-1",
        titulo: "Novidades de Abril 2026",
        canal: "email",
        assunto: "Novidades de Abril 2026",
        corpo: "",
        segmentos: ["todos"],
        totalDestinatarios: 310,
        status: "enviado",
        enviadoEm: iso(abril11),
        taxaAbertura: 68,
        taxaCliques: 12,
      },
      {
        id: "msg-seed-2",
        titulo: "Alerta: clientes inativos",
        canal: "whatsapp",
        corpo: "",
        segmentos: ["clientes_inativos"],
        totalDestinatarios: 26,
        status: "enviado",
        enviadoEm: iso(abril8),
        totalEntregues: 25,
        respostas: 8,
      },
      {
        id: "msg-seed-3",
        titulo: "Renovação de assinaturas",
        canal: "email",
        assunto: "Renovação",
        corpo: "",
        segmentos: ["plano_pro"],
        totalDestinatarios: 5,
        status: "agendado",
        agendadoPara: iso(maio1),
      },
      {
        id: "msg-seed-4",
        titulo: "Lembrete fim de trial",
        canal: "ambos",
        assunto: "Seu trial termina em breve",
        corpo: "",
        segmentos: ["plano_enterprise"],
        totalDestinatarios: 2,
        status: "agendado",
        agendadoPara: iso(maio15),
      },
    ],
    templates: [
      {
        id: "tpl-1",
        nome: "Boas-vindas ao plano",
        descricao: "Enviado quando nova assinatura é ativada",
        canal: "email",
        assunto: "Bem-vindo ao GestMiles, {nome}!",
        corpo: "Olá {nome},\n\nSua assinatura está ativa. Explore o painel com a equipe {equipe}.\n\nAbraços,\nEquipe GestMiles",
        emoji: "🎉",
        categoria: "onboarding",
      },
      {
        id: "tpl-2",
        nome: "Alerta de inatividade",
        descricao: "Para clientes sem acesso há +14 dias",
        canal: "ambos",
        assunto: "Sentimos sua falta",
        corpo: "Olá {nome},\n\nNotamos que você não acessa há algum tempo. Posso ajudar?\n\nEquipe GestMiles",
        emoji: "⚠️",
        categoria: "retencao",
      },
      {
        id: "tpl-3",
        nome: "Nova funcionalidade",
        descricao: "Anúncio de features e melhorias",
        canal: "email",
        assunto: "Novidades na plataforma 🚀",
        corpo: "Olá {nome},\n\nTemos novidades importantes para compartilhar sobre seu plano {plano}.\n\nAbraços,\nEquipe GestMiles",
        emoji: "🚀",
        categoria: "produto",
      },
      {
        id: "tpl-4",
        nome: "Cobrança vencendo",
        descricao: "7 dias antes do vencimento da assinatura",
        canal: "email",
        assunto: "Lembrete: renovação em 7 dias",
        corpo: "Olá {nome},\n\nSua assinatura vence em breve. Renove para não perder o acesso.\n\nEquipe GestMiles",
        emoji: "💳",
        categoria: "financeiro",
      },
      {
        id: "tpl-5",
        nome: "Relatório mensal",
        descricao: "Resumo de performance do mês",
        canal: "email",
        assunto: "Seu relatório mensal GestMiles",
        corpo: "Olá {nome},\n\nSegue o resumo do mês para a equipe {equipe}.\n\nEquipe GestMiles",
        emoji: "📊",
        categoria: "relatorio",
      },
    ],
  };
}

export function loadComunicacoesState(): ComunicacoesState {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    const p = JSON.parse(raw) as ComunicacoesState;
    if (!p?.mensagens || !p?.templates) return seed();
    return p;
  } catch {
    return seed();
  }
}

export function saveComunicacoesState(s: ComunicacoesState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function estimateRecipients(segmentos: string[], equipeEspecificaId: string | null): number {
  if (segmentos.includes("todos")) return 310;
  let t = 0;
  for (const key of segmentos) {
    if (key === "equipe_especifica") {
      t += equipeEspecificaId ? 24 : 0;
    } else {
      const s = SEGMENTOS.find((x) => x.key === key);
      if (s) t += s.count;
    }
  }
  return Math.min(310, Math.max(0, t));
}

export interface KpiCom {
  enviadosMes: number;
  deltaVsAnterior: number;
  taxaAberturaPct: number;
  aberturaColor: "ok" | "warn" | "err";
  entregaWaPct: number;
  agendadas: number;
}

export function computeKpis(mensagens: Mensagem[]): KpiCom {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const startThis = new Date(y, m, 1);
  const startNext = new Date(y, m + 1, 1);
  const startPrev = new Date(y, m - 1, 1);

  const sentThis = mensagens.filter(
    (x) =>
      x.status === "enviado" &&
      x.enviadoEm &&
      new Date(x.enviadoEm) >= startThis &&
      new Date(x.enviadoEm) < startNext,
  );
  const sentPrev = mensagens.filter(
    (x) =>
      x.status === "enviado" &&
      x.enviadoEm &&
      new Date(x.enviadoEm) >= startPrev &&
      new Date(x.enviadoEm) < startThis,
  );

  const enviadosMes = sentThis.reduce((s, x) => s + x.totalDestinatarios, 0);
  const enviadosPrev = sentPrev.reduce((s, x) => s + x.totalDestinatarios, 0);
  const deltaVsAnterior = enviadosMes - enviadosPrev;

  const emailLike = sentThis.filter((x) => x.canal === "email" || x.canal === "ambos");
  const opens = emailLike.map((x) => x.taxaAbertura).filter((n): n is number => typeof n === "number");
  const taxaAberturaPct = opens.length ? opens.reduce((a, b) => a + b, 0) / opens.length : 68.4;

  let aberturaColor: KpiCom["aberturaColor"] = "ok";
  if (taxaAberturaPct < 25) aberturaColor = "err";
  else if (taxaAberturaPct < 50) aberturaColor = "warn";

  const wa = sentThis.filter((x) => x.canal === "whatsapp" || x.canal === "ambos");
  const waRates = wa
    .map((x) => (x.totalDestinatarios && x.totalEntregues != null ? (x.totalEntregues / x.totalDestinatarios) * 100 : 97.2))
    .filter((n) => Number.isFinite(n));
  const entregaWaPct = waRates.length ? waRates.reduce((a, b) => a + b, 0) / waRates.length : 97.2;

  const agendadas = mensagens.filter((x) => x.status === "agendado").length;

  return {
    enviadosMes,
    deltaVsAnterior,
    taxaAberturaPct,
    aberturaColor,
    entregaWaPct,
    agendadas,
  };
}

export function newTemplateId(): string {
  return `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function newMensagemId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
