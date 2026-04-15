import { listConfiguracoes, upsertConfiguracao } from "@/lib/adminApi";

export type TicketStatus = "aberto" | "em_andamento" | "resolvido" | "fechado";
export type TicketPrioridade = "urgente" | "alta" | "normal" | "baixa";
export type TicketCategoria = "bug" | "duvida" | "financeiro" | "comercial" | "tecnico";

export interface Ticket {
  id: string;
  assunto: string;
  status: TicketStatus;
  prioridade: TicketPrioridade;
  categoria: TicketCategoria;
  solicitanteId: string;
  solicitanteNome: string;
  atribuidoAId?: string;
  criadoEm: string;
  atualizadoEm: string;
  slaDeadline: string;
  naoLido: boolean;
}

export interface MensagemTicket {
  id: string;
  ticketId: string;
  autorId: string;
  autorNome: string;
  autorTipo: "usuario" | "admin";
  conteudo: string;
  notaInterna: boolean;
  criadaEm: string;
}

export interface AdminTicket {
  id: string;
  nome: string;
}

export interface SolicitanteTicket {
  id: string;
  nome: string;
}

export interface SuporteState {
  version: 1;
  tickets: Ticket[];
  mensagens: MensagemTicket[];
  admins: AdminTicket[];
  solicitantes: SolicitanteTicket[];
}

export const SLA_HORAS: Record<TicketPrioridade, number> = {
  urgente: 1,
  alta: 4,
  normal: 8,
  baixa: 24,
};

const STORAGE_KEY = "gm-admin-suporte-v1";
const BACKEND_CONFIG_KEY = "admin_suporte_snapshot";

function isoWithOffset(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

function addHours(iso: string, hours: number): string {
  const date = new Date(iso);
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}

function seedState(): SuporteState {
  const tk47Criado = isoWithOffset(23);
  const tk47Atualizado = isoWithOffset(9);
  const tk48Criado = isoWithOffset(120);
  const tk49Criado = isoWithOffset(300);
  const tk50Criado = isoWithOffset(1500);
  const tk51Criado = isoWithOffset(2600);
  const tk52Criado = isoWithOffset(80);
  const tk53Criado = isoWithOffset(40);
  const tk54Criado = isoWithOffset(3500);

  return {
    version: 1,
    admins: [
      { id: "admin-rr", nome: "Rick Rabelo" },
      { id: "admin-am", nome: "Ana Martins" },
      { id: "admin-rs", nome: "Rafael Silva" },
    ],
    solicitantes: [
      { id: "u-joao", nome: "João Carvalho" },
      { id: "u-ana", nome: "Ana Martins" },
      { id: "u-rafael", nome: "Rafael Silva" },
      { id: "u-carla", nome: "Carla Borges" },
      { id: "u-priscila", nome: "Priscila Nunes" },
      { id: "u-marcos", nome: "Marcos Andrade" },
    ],
    tickets: [
      {
        id: "TK-0047",
        assunto: "Erro ao emitir passagem GRU→NRT",
        status: "aberto",
        prioridade: "urgente",
        categoria: "bug",
        solicitanteId: "u-joao",
        solicitanteNome: "João Carvalho",
        atribuidoAId: "admin-rr",
        criadoEm: tk47Criado,
        atualizadoEm: tk47Atualizado,
        slaDeadline: addHours(tk47Criado, SLA_HORAS.urgente),
        naoLido: true,
      },
      {
        id: "TK-0048",
        assunto: "Como configurar alerta de vencimento de milhas?",
        status: "aberto",
        prioridade: "normal",
        categoria: "duvida",
        solicitanteId: "u-ana",
        solicitanteNome: "Ana Martins",
        atribuidoAId: "admin-am",
        criadoEm: tk48Criado,
        atualizadoEm: tk48Criado,
        slaDeadline: addHours(tk48Criado, SLA_HORAS.normal),
        naoLido: true,
      },
      {
        id: "TK-0049",
        assunto: "Cobrança duplicada no cartão de crédito",
        status: "aberto",
        prioridade: "alta",
        categoria: "financeiro",
        solicitanteId: "u-rafael",
        solicitanteNome: "Rafael Silva",
        atribuidoAId: "admin-rs",
        criadoEm: tk49Criado,
        atualizadoEm: tk49Criado,
        slaDeadline: addHours(tk49Criado, SLA_HORAS.alta),
        naoLido: false,
      },
      {
        id: "TK-0050",
        assunto: "Solicito upgrade para plano Enterprise",
        status: "aberto",
        prioridade: "baixa",
        categoria: "comercial",
        solicitanteId: "u-carla",
        solicitanteNome: "Carla Borges",
        atribuidoAId: "admin-rr",
        criadoEm: tk50Criado,
        atualizadoEm: tk50Criado,
        slaDeadline: addHours(tk50Criado, SLA_HORAS.baixa),
        naoLido: false,
      },
      {
        id: "TK-0051",
        assunto: "Integrar API de disponibilidade com fallback",
        status: "em_andamento",
        prioridade: "alta",
        categoria: "tecnico",
        solicitanteId: "u-priscila",
        solicitanteNome: "Priscila Nunes",
        atribuidoAId: "admin-rs",
        criadoEm: tk51Criado,
        atualizadoEm: tk51Criado,
        slaDeadline: addHours(tk51Criado, SLA_HORAS.alta),
        naoLido: false,
      },
      {
        id: "TK-0052",
        assunto: "Erro intermitente no carregamento da carteira",
        status: "em_andamento",
        prioridade: "normal",
        categoria: "bug",
        solicitanteId: "u-marcos",
        solicitanteNome: "Marcos Andrade",
        atribuidoAId: "admin-am",
        criadoEm: tk52Criado,
        atualizadoEm: tk52Criado,
        slaDeadline: addHours(tk52Criado, SLA_HORAS.normal),
        naoLido: false,
      },
      {
        id: "TK-0053",
        assunto: "Ticket resolvido de teste",
        status: "resolvido",
        prioridade: "normal",
        categoria: "duvida",
        solicitanteId: "u-ana",
        solicitanteNome: "Ana Martins",
        atribuidoAId: "admin-rr",
        criadoEm: tk53Criado,
        atualizadoEm: tk53Criado,
        slaDeadline: addHours(tk53Criado, SLA_HORAS.normal),
        naoLido: false,
      },
      {
        id: "TK-0054",
        assunto: "Acesso removido após atualização de permissão",
        status: "resolvido",
        prioridade: "alta",
        categoria: "tecnico",
        solicitanteId: "u-joao",
        solicitanteNome: "João Carvalho",
        atribuidoAId: "admin-rs",
        criadoEm: tk54Criado,
        atualizadoEm: tk54Criado,
        slaDeadline: addHours(tk54Criado, SLA_HORAS.alta),
        naoLido: false,
      },
    ],
    mensagens: [
      {
        id: "m-tk47-1",
        ticketId: "TK-0047",
        autorId: "u-joao",
        autorNome: "João Carvalho",
        autorTipo: "usuario",
        notaInterna: false,
        criadaEm: isoWithOffset(23),
        conteudo:
          "Boa tarde, estou tentando emitir a passagem GRU→NRT para o cliente Marcos Andrade (800.000 milhas) e o sistema retornou o seguinte erro:\n\nError 500: Internal Server Error - emission_service.ts:142\n\nJá tentei 3 vezes e continua falhando. O cliente aguarda resposta urgente.",
      },
      {
        id: "m-tk47-2",
        ticketId: "TK-0047",
        autorId: "admin-rr",
        autorNome: "Rick Rabelo",
        autorTipo: "admin",
        notaInterna: false,
        criadaEm: isoWithOffset(4),
        conteudo:
          "Olá João, já identifiquei o problema. O serviço de emissão do Qatar Airways estava com timeout nos últimos 30 minutos. Já reiniciei o processo e o serviço está estável agora.\n\nPor favor, tente a emissão novamente e me confirme se funcionou.",
      },
    ],
  };
}

export function loadSuporteState(): SuporteState {
  if (typeof window === "undefined") return seedState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const parsed = JSON.parse(raw) as SuporteState;
    if (!parsed?.tickets || !parsed?.mensagens || !parsed?.admins || !parsed?.solicitantes) {
      return seedState();
    }
    return parsed;
  } catch {
    return seedState();
  }
}

export function saveSuporteState(state: SuporteState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  void saveSuporteStateToBackend(state);
  window.dispatchEvent(new CustomEvent("gm-admin-suporte-updated"));
}

function isValidSuporteState(value: unknown): value is SuporteState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SuporteState>;
  return Array.isArray(candidate.tickets) && Array.isArray(candidate.mensagens) && Array.isArray(candidate.admins) && Array.isArray(candidate.solicitantes);
}

export async function loadSuporteStateFromBackend(): Promise<SuporteState> {
  const local = loadSuporteState();
  try {
    const rows = await listConfiguracoes();
    const row = rows.find((item) => item.chave === BACKEND_CONFIG_KEY);
    if (!row) return local;
    if (!isValidSuporteState(row.valor)) return local;
    return { ...local, ...row.valor };
  } catch {
    return local;
  }
}

export async function saveSuporteStateToBackend(state: SuporteState): Promise<void> {
  try {
    await upsertConfiguracao({
      chave: BACKEND_CONFIG_KEY,
      valor: state,
      descricao: "Snapshot da tela admin de suporte/tickets",
    });
  } catch {
    // Fallback local já cobre indisponibilidade de backend.
  }
}

export function newTicketId(tickets: Ticket[]): string {
  const maxNumber = tickets.reduce((acc, ticket) => {
    const numeric = Number(ticket.id.replace("TK-", ""));
    if (!Number.isFinite(numeric)) return acc;
    return Math.max(acc, numeric);
  }, 0);
  return `TK-${String(maxNumber + 1).padStart(4, "0")}`;
}

export function newMensagemTicketId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export interface TicketKpis {
  abertos: number;
  emAndamento: number;
  resolvidosHoje: number;
  tempoMedioRespostaMinutos: number;
  abertosSidebar: number;
}

export function computeTicketKpis(tickets: Ticket[], mensagens: MensagemTicket[]): TicketKpis {
  const now = Date.now();
  const last24h = now - 24 * 60 * 60 * 1000;
  const abertos = tickets.filter((ticket) => ticket.status === "aberto").length;
  const emAndamento = tickets.filter((ticket) => ticket.status === "em_andamento").length;
  const resolvidosHoje = tickets.filter((ticket) => ticket.status === "resolvido" && new Date(ticket.atualizadoEm).getTime() >= last24h).length;
  const firstAdminResponses = tickets
    .map((ticket) => {
      const firstAdmin = mensagens
        .filter((msg) => msg.ticketId === ticket.id && msg.autorTipo === "admin" && !msg.notaInterna)
        .sort((a, b) => new Date(a.criadaEm).getTime() - new Date(b.criadaEm).getTime())[0];
      if (!firstAdmin) return null;
      const created = new Date(ticket.criadoEm).getTime();
      const replied = new Date(firstAdmin.criadaEm).getTime();
      const diff = Math.max(0, replied - created);
      return diff / 60_000;
    })
    .filter((value): value is number => typeof value === "number");

  const tempoMedioRespostaMinutos = firstAdminResponses.length
    ? Math.round(firstAdminResponses.reduce((sum, value) => sum + value, 0) / firstAdminResponses.length)
    : 84;

  return {
    abertos,
    emAndamento,
    resolvidosHoje,
    tempoMedioRespostaMinutos,
    abertosSidebar: abertos,
  };
}
