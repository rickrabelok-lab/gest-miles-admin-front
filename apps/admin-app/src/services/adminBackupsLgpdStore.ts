import { listConfiguracoes, upsertConfiguracao } from "@/lib/adminApi";

export interface Backup {
  id: string;
  nomeArquivo: string;
  tipo: "automatico" | "manual";
  tamanhoGB: number;
  status: "completo" | "em_progresso" | "falhou";
  criadoEm: string;
  criadoPor?: string;
  urlDownload: string;
  expiraEm: string;
}

export type TipoSolicitacaoLGPD = "acesso" | "exclusao" | "portabilidade" | "correcao" | "oposicao";
export type StatusSolicitacao = "pendente" | "em_andamento" | "concluido" | "negado";

export interface SolicitacaoLGPD {
  id: string;
  tipo: TipoSolicitacaoLGPD;
  titular: string;
  email: string;
  descricao: string;
  status: StatusSolicitacao;
  recebidaEm: string;
  prazoLegal: string;
  respondidaEm?: string;
  respostaTexto?: string;
  enviarEmail?: boolean;
  inclusaoExport?: string[];
}

export interface ConfigBackup {
  backupAutomaticoAtivo: boolean;
  horarioBackup: string;
  diasRetencao: number;
  notifEmailAtivo: boolean;
  cloudExternaAtivo: boolean;
  cloudProvider?: "s3" | "gcs";
}

export interface ConformidadeChecklist {
  politicaPublicada: boolean;
  logConsentimentos: boolean;
  canalAtivo: boolean;
  dpoDesignado: boolean;
  ripdOk: boolean;
  scorePercent: number;
}

export interface BackupsLgpdState {
  version: 1;
  backups: Backup[];
  solicitacoes: SolicitacaoLGPD[];
  config: ConfigBackup;
  conformidade: ConformidadeChecklist;
}

const STORAGE_KEY = "gm-admin-backups-lgpd-v1";
export const BACKEND_CONFIG_KEY = "admin_backups_lgpd_snapshot";

const MS_DAY = 86_400_000;

function iso(d: Date): string {
  return d.toISOString();
}

function addDays(iso: string, days: number): string {
  const t = new Date(iso).getTime() + days * MS_DAY;
  return new Date(t).toISOString();
}

function seedState(): BackupsLgpdState {
  const hoje = new Date();
  const y = hoje.getFullYear();
  const m = String(hoje.getMonth() + 1).padStart(2, "0");
  const d = String(hoje.getDate()).padStart(2, "0");
  const ontem = new Date(hoje);
  ontem.setDate(ontem.getDate() - 1);
  const yo = ontem.getFullYear();
  const mo = String(ontem.getMonth() + 1).padStart(2, "0");
  const doo = String(ontem.getDate()).padStart(2, "0");

  const autoHoje = `${y}-${m}-${d}T03:00:00-03:00`;
  const autoOntem = `${yo}-${mo}-${doo}T03:00:00-03:00`;
  const manual10 = `${y}-${m}-10T14:22:00-03:00`;

  const exp30 = addDays(autoHoje, 30);

  const marcosRecebida = addDays(iso(hoje), -10);
  const marcosPrazo = addDays(marcosRecebida, 15);
  const carlosRecebida = addDays(iso(hoje), -3);
  const carlosPrazo = addDays(carlosRecebida, 15);
  const anaRecebida = addDays(iso(hoje), -12);
  const anaPrazo = addDays(anaRecebida, 15);
  const anaRespondida = addDays(anaRecebida, 4);

  return {
    version: 1,
    config: {
      backupAutomaticoAtivo: true,
      horarioBackup: "03:00",
      diasRetencao: 30,
      notifEmailAtivo: true,
      cloudExternaAtivo: false,
    },
    conformidade: {
      politicaPublicada: true,
      logConsentimentos: true,
      canalAtivo: true,
      dpoDesignado: false,
      ripdOk: false,
      scorePercent: 87,
    },
    backups: [
      {
        id: "bk-1",
        nomeArquivo: `backup_${y}-${m}-${d}_03-00.sql.gz`,
        tipo: "automatico",
        tamanhoGB: 2.4,
        status: "completo",
        criadoEm: autoHoje,
        urlDownload: "bk-1",
        expiraEm: exp30,
      },
      {
        id: "bk-2",
        nomeArquivo: `backup_${yo}-${mo}-${doo}_03-00.sql.gz`,
        tipo: "automatico",
        tamanhoGB: 2.3,
        status: "completo",
        criadoEm: autoOntem,
        urlDownload: "bk-2",
        expiraEm: addDays(autoOntem, 30),
      },
      {
        id: "bk-3",
        nomeArquivo: `backup_manual_${y}-04-10_14-22.sql.gz`,
        tipo: "manual",
        tamanhoGB: 2.1,
        status: "completo",
        criadoEm: manual10,
        criadoPor: "Rick Rabelo",
        urlDownload: "bk-3",
        expiraEm: addDays(manual10, 30),
      },
    ],
    solicitacoes: [
      {
        id: "lgpd-1",
        tipo: "acesso",
        titular: "Marcos Andrade",
        email: "marcos.andrade@email.com",
        descricao: "Solicitou acesso a todos os seus dados pessoais armazenados",
        status: "pendente",
        recebidaEm: marcosRecebida,
        prazoLegal: marcosPrazo,
      },
      {
        id: "lgpd-2",
        tipo: "exclusao",
        titular: "Carlos Teste",
        email: "carlos.teste@hotmail.com",
        descricao: "Solicita exclusão completa de todos os dados pessoais",
        status: "pendente",
        recebidaEm: carlosRecebida,
        prazoLegal: carlosPrazo,
      },
      {
        id: "lgpd-3",
        tipo: "portabilidade",
        titular: "Ana Silva",
        email: "ana.silva@gmail.com",
        descricao: "Exportação de dados enviada em 08/04/2026",
        status: "concluido",
        recebidaEm: anaRecebida,
        prazoLegal: anaPrazo,
        respondidaEm: anaRespondida,
        respostaTexto: "Pacote de exportação enviado ao e-mail cadastrado.",
      },
    ],
  };
}

export function loadBackupsLgpdState(): BackupsLgpdState {
  if (typeof window === "undefined") return seedState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const parsed = JSON.parse(raw) as BackupsLgpdState;
    if (!parsed?.backups || !parsed?.solicitacoes || !parsed?.config || !parsed?.conformidade) return seedState();
    return parsed;
  } catch {
    return seedState();
  }
}

export function saveBackupsLgpdState(state: BackupsLgpdState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  void saveBackupsLgpdStateToBackend(state);
  window.dispatchEvent(new CustomEvent("gm-admin-backups-lgpd-updated"));
}

function isValidState(value: unknown): value is BackupsLgpdState {
  if (!value || typeof value !== "object") return false;
  const c = value as Partial<BackupsLgpdState>;
  return Array.isArray(c.backups) && Array.isArray(c.solicitacoes) && !!c.config && !!c.conformidade;
}

export async function loadBackupsLgpdStateFromBackend(): Promise<BackupsLgpdState> {
  const local = loadBackupsLgpdState();
  try {
    const rows = await listConfiguracoes();
    const row = rows.find((item) => item.chave === BACKEND_CONFIG_KEY);
    if (!row?.valor || !isValidState(row.valor)) return local;
    return row.valor;
  } catch {
    return local;
  }
}

export async function saveBackupsLgpdStateToBackend(state: BackupsLgpdState): Promise<void> {
  try {
    await upsertConfiguracao({
      chave: BACKEND_CONFIG_KEY,
      valor: state,
      descricao: "Snapshot admin Backups & LGPD",
    });
  } catch {
    // localStorage já cobre fallback
  }
}

export function countLgpdPendentes(state: BackupsLgpdState): number {
  return state.solicitacoes.filter((s) => s.status === "pendente" || s.status === "em_andamento").length;
}

export function diasCorridosRestantes(prazoLegalIso: string): number {
  const now = new Date();
  const end = new Date(prazoLegalIso);
  const d0 = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const d1 = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((d1 - d0) / MS_DAY);
}

export type SlaVisual = "ok" | "warn" | "err" | "vencido";

export function slaClassParaPendente(dias: number): SlaVisual {
  if (dias < 0) return "vencido";
  if (dias < 2) return "err";
  if (dias <= 5) return "warn";
  return "ok";
}

export function newBackupId(): string {
  return `bk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function newLgpdId(): string {
  return `lgpd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
