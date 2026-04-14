import { isMissingRelationError } from "./supabaseErrors";
import { isSupabaseConfigured, supabase, supabaseNoPersist } from "./supabase";

export type Perfil = {
  usuario_id: string;
  nome_completo: string | null;
  role: "admin" | "admin_equipe" | "cs" | "gestor" | "cliente" | "cliente_gestao" | string;
  equipe_id: string | null;
};

export type Equipe = { id: string; nome: string; parent_id: string | null; created_at?: string | null };
export type GestorFuncao = "nacional" | "internacional";
export type GestorEquipeSlot = number;
export type CSEquipeSlot = number;
export type ViagemStatus = "planejada" | "em_andamento" | "chegada_confirmada" | "finalizada";
export type FinanceiroTipo = "receita" | "despesa";
export type FinanceiroCategoriaReceita = "assinatura_equipe" | "assinatura_cliente" | "agencia_viagens";
export type FinanceiroCategoriaDespesa = "marketing" | "ferramentas" | "equipe" | "infraestrutura";
export type FinanceiroCategoria = FinanceiroCategoriaReceita | FinanceiroCategoriaDespesa;
export type Viagem = {
  id: string;
  cliente_id: string;
  equipe_id: string | null;
  destino: string;
  data_ida: string;
  data_volta: string;
  qtd_passageiros: number;
  status: ViagemStatus | string | null;
  checkin_enviado: boolean | null;
  chegada_enviada: boolean | null;
  retorno_enviado: boolean | null;
};
export type FinanceiroLancamento = {
  id: string;
  tipo: FinanceiroTipo;
  categoria: FinanceiroCategoria;
  descricao: string | null;
  valor: number;
  data: string;
  equipe_id: string | null;
  usuario_id: string | null;
  detalhes: Record<string, unknown> | null;
  created_at?: string | null;
};

export function formatSupabaseError(e: unknown): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return String(e);
}

function isSchemaMissingColumn(msg: string, col: string): boolean {
  return msg.includes(col) && (msg.includes("column") || msg.includes("does not exist"));
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const GESTOR_FUNCAO_STORAGE_KEY = "admin-gestor-funcoes";
const GESTOR_EQUIPE_SLOT_STORAGE_KEY = "admin-gestor-equipe-slot";
const CS_EQUIPE_SLOT_STORAGE_KEY = "admin-cs-equipe-slot";
const CS_EQUIPE_ASSIGNMENTS_STORAGE_KEY = "admin-cs-equipe-assignments";
const AUDIT_LOGS_STORAGE_KEY = "admin-audit-logs-fallback";

function readGestorFuncoesLocal(): Record<string, GestorFuncao> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(GESTOR_FUNCAO_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, GestorFuncao>;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function writeGestorFuncoesLocal(map: Record<string, GestorFuncao>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GESTOR_FUNCAO_STORAGE_KEY, JSON.stringify(map));
}

function readAuditLogsLocal(): LogAcaoRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(AUDIT_LOGS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LogAcaoRow[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function writeAuditLogsLocal(rows: LogAcaoRow[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUDIT_LOGS_STORAGE_KEY, JSON.stringify(rows));
}

function readGestorEquipeSlotLocal(equipeId: string): Record<string, GestorEquipeSlot> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(`${GESTOR_EQUIPE_SLOT_STORAGE_KEY}:${equipeId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, GestorEquipeSlot>;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function writeGestorEquipeSlotLocal(equipeId: string, map: Record<string, GestorEquipeSlot>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${GESTOR_EQUIPE_SLOT_STORAGE_KEY}:${equipeId}`, JSON.stringify(map));
}

function readCSEquipeSlotLocal(equipeId: string): Record<string, CSEquipeSlot> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(`${CS_EQUIPE_SLOT_STORAGE_KEY}:${equipeId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CSEquipeSlot>;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function writeCSEquipeSlotLocal(equipeId: string, map: Record<string, CSEquipeSlot>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${CS_EQUIPE_SLOT_STORAGE_KEY}:${equipeId}`, JSON.stringify(map));
}

type CSEquipeAssignments = Record<string, string[]>;

function readCSEquipeAssignmentsLocal(equipeId: string): CSEquipeAssignments {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(`${CS_EQUIPE_ASSIGNMENTS_STORAGE_KEY}:${equipeId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CSEquipeAssignments;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function writeCSEquipeAssignmentsLocal(equipeId: string, map: CSEquipeAssignments): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${CS_EQUIPE_ASSIGNMENTS_STORAGE_KEY}:${equipeId}`, JSON.stringify(map));
}

async function updatePerfilRoleAndEquipe(usuarioId: string, role: string, equipeId: string | null): Promise<void> {
  const full = await supabase.from("perfis").update({ role, equipe_id: equipeId }).eq("usuario_id", usuarioId);
  if (!full.error) return;
  if (isSchemaMissingColumn(full.error.message ?? "", "equipe_id")) {
    const fallback = await supabase.from("perfis").update({ role }).eq("usuario_id", usuarioId);
    if (fallback.error) throw fallback.error;
    return;
  }
  throw full.error;
}

async function insertPerfilWithOptionalEquipe(input: {
  usuario_id: string;
  slug: string;
  nome_completo: string;
  role: string;
  equipe_id: string | null;
}): Promise<void> {
  const full = await supabase.from("perfis").insert({
    usuario_id: input.usuario_id,
    slug: input.slug,
    nome_completo: input.nome_completo,
    role: input.role,
    equipe_id: input.equipe_id,
  });
  if (!full.error) return;
  if (isSchemaMissingColumn(full.error.message ?? "", "equipe_id")) {
    const fallback = await supabase.from("perfis").insert({
      usuario_id: input.usuario_id,
      slug: input.slug,
      nome_completo: input.nome_completo,
      role: input.role,
    });
    if (fallback.error) throw fallback.error;
    return;
  }
  throw full.error;
}

async function replaceEquipeGestoresForGestor(gestorId: string, equipeId: string | null) {
  const del = await supabase.from("equipe_gestores").delete().eq("gestor_id", gestorId);
  if (del.error) {
    if (isMissingRelationError(del.error)) return;
    throw del.error;
  }
  if (equipeId) {
    const ins = await supabase
      .from("equipe_gestores")
      .upsert({ equipe_id: equipeId, gestor_id: gestorId }, { onConflict: "equipe_id,gestor_id" });
    if (ins.error) throw ins.error;
  }
}

async function replaceEquipeCsForCs(csId: string, equipeId: string | null) {
  const del = await supabase.from("equipe_cs").delete().eq("cs_id", csId);
  if (del.error) {
    if (isMissingRelationError(del.error)) return;
    throw del.error;
  }
  if (equipeId) {
    const ins = await supabase
      .from("equipe_cs")
      .upsert({ equipe_id: equipeId, cs_id: csId }, { onConflict: "equipe_id,cs_id" });
    if (ins.error) throw ins.error;
  }
}

export async function logAcao(_input: {
  tipoAcao: string;
  entidadeAfetada: string;
  entidadeId: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  const now = new Date().toISOString();
  let userId: string | null = null;
  try {
    const auth = await supabase.auth.getUser();
    userId = auth.data.user?.id ?? null;
  } catch {
    userId = null;
  }

  const payload = {
    user_id: userId,
    tipo_acao: _input.tipoAcao,
    entidade_afetada: _input.entidadeAfetada,
    entidade_id: _input.entidadeId,
    details: _input.details ?? null,
    created_at: now,
  };

  const full = await supabase.from("logs_acoes").insert(payload);
  if (!full.error) return;

  // Fallback local quando a tabela não existe no ambiente.
  if (isMissingRelationError(full.error)) {
    const current = readAuditLogsLocal();
    const row: LogAcaoRow = {
      id: `local-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      user_id: payload.user_id,
      tipo_acao: payload.tipo_acao,
      entidade_afetada: payload.entidade_afetada,
      entidade_id: payload.entidade_id,
      details: payload.details as Record<string, unknown> | null,
      created_at: payload.created_at,
    };
    writeAuditLogsLocal([row, ...current].slice(0, 500));
    return;
  }

  // Não interrompe o fluxo principal por erro de auditoria.
}

export async function createAuditLogTestEntry(): Promise<void> {
  const auth = await supabase.auth.getUser();
  const userId = auth.data.user?.id ?? null;
  if (!userId) throw new Error("Sessão inválida para criar log de teste.");

  const { error } = await supabase.from("logs_acoes").insert({
    user_id: userId,
    tipo_acao: "audit test",
    entidade_afetada: "admin_logs",
    entidade_id: "manual_test",
    details: { source: "admin_panel", real: true },
  });
  if (error) throw error;
}

export type LogAcaoRow = {
  id: string;
  user_id: string | null;
  tipo_acao: string | null;
  entidade_afetada: string | null;
  entidade_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string | null;
};

export async function listAuditLogs(limit = 200): Promise<LogAcaoRow[]> {
  const { data, error } = await supabase
    .from("logs_acoes")
    .select("id, user_id, tipo_acao, entidade_afetada, entidade_id, details, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingRelationError(error)) return readAuditLogsLocal().slice(0, limit);
    throw error;
  }
  return (data ?? []) as LogAcaoRow[];
}

/** Amostra maior para analytics / insights (paginação por range). */
export async function listAuditLogsForAnalytics(maxRows = 6000): Promise<LogAcaoRow[]> {
  const pageSize = 1000;
  const out: LogAcaoRow[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const to = Math.min(from + pageSize - 1, maxRows - 1);
    const { data, error } = await supabase
      .from("logs_acoes")
      .select("id, user_id, tipo_acao, entidade_afetada, entidade_id, details, created_at")
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) {
      if (isMissingRelationError(error)) return readAuditLogsLocal().slice(0, maxRows);
      throw error;
    }
    const chunk = (data ?? []) as LogAcaoRow[];
    if (chunk.length === 0) break;
    out.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return out.slice(0, maxRows);
}

export type PerfilInsightRow = {
  usuario_id: string;
  nome_completo: string | null;
  equipe_id: string | null;
  role: string;
  created_at: string | null;
};

export async function listPerfisInsightRows(): Promise<PerfilInsightRow[]> {
  const res = await supabase.from("perfis").select("usuario_id, nome_completo, equipe_id, role, created_at").limit(12000);
  if (!res.error) {
    return ((res.data ?? []) as PerfilInsightRow[]).map((r) => ({
      usuario_id: String(r.usuario_id ?? ""),
      nome_completo: r.nome_completo == null ? null : String(r.nome_completo),
      equipe_id: r.equipe_id == null ? null : String(r.equipe_id),
      role: String(r.role ?? ""),
      created_at: r.created_at == null ? null : String(r.created_at),
    }));
  }
  const msg = res.error.message ?? "";
  if (isSchemaMissingColumn(msg, "created_at")) {
    const legacy = await supabase.from("perfis").select("usuario_id, nome_completo, equipe_id, role").limit(12000);
    if (legacy.error) throw legacy.error;
    return ((legacy.data ?? []) as Array<{ usuario_id: string; nome_completo?: string | null; equipe_id?: string | null; role: string }>).map(
      (p) => ({
        usuario_id: String(p.usuario_id),
        nome_completo: p.nome_completo == null ? null : String(p.nome_completo),
        equipe_id: p.equipe_id == null ? null : String(p.equipe_id),
        role: String(p.role ?? ""),
        created_at: null,
      }),
    );
  }
  if (isSchemaMissingColumn(msg, "equipe_id")) {
    const legacy = await supabase.from("perfis").select("usuario_id, nome_completo, role, created_at").limit(12000);
    if (legacy.error) {
      if (isSchemaMissingColumn(legacy.error.message ?? "", "created_at")) {
        const l2 = await supabase.from("perfis").select("usuario_id, nome_completo, role").limit(12000);
        if (l2.error) throw l2.error;
        return ((l2.data ?? []) as Array<{ usuario_id: string; nome_completo?: string | null; role: string }>).map((p) => ({
          usuario_id: String(p.usuario_id),
          nome_completo: p.nome_completo == null ? null : String(p.nome_completo),
          equipe_id: null,
          role: String(p.role ?? ""),
          created_at: null,
        }));
      }
      throw legacy.error;
    }
    return ((legacy.data ?? []) as Array<{ usuario_id: string; nome_completo?: string | null; role: string; created_at?: string | null }>).map(
      (p) => ({
        usuario_id: String(p.usuario_id),
        nome_completo: p.nome_completo == null ? null : String(p.nome_completo),
        equipe_id: null,
        role: String(p.role ?? ""),
        created_at: p.created_at == null ? null : String(p.created_at),
      }),
    );
  }
  throw res.error;
}

// --- Segurança do painel admin (sql/seguranca_admin.sql) ---

export const ADMIN_SECURITY_SESSION_START_KEY = "admin_security_session_start";

function isSecurityRpcOrTableMissing(e: unknown): boolean {
  const m = formatSupabaseError(e).toLowerCase();
  if (isMissingRelationError(e as { code?: string; message?: string })) return true;
  return (
    m.includes("admin_security") ||
    m.includes("admin_login_history") ||
    m.includes("admin_failed_login") ||
    m.includes("admin_session_activity")
  ) &&
    (m.includes("does not exist") || m.includes("schema cache") || m.includes("function") || m.includes("relation"));
}

export function adminSecurityClientMeta(): { device: string; userAgent: string; ip: string } {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const device = /Mobile|Android|iPhone|iPad/i.test(ua) ? "Mobile" : "Desktop";
  return { device, userAgent: ua, ip: "" };
}

export async function adminSecurityIsEmailLocked(email: string): Promise<{ locked: boolean; until: string | null }> {
  const { data, error } = await supabase.rpc("admin_security_is_email_locked", { p_email: email.trim() });
  if (error) {
    if (isSecurityRpcOrTableMissing(error)) return { locked: false, until: null };
    throw error;
  }
  const j = data as { locked?: boolean; until?: string } | null;
  if (!j) return { locked: false, until: null };
  const until = j.until != null ? String(j.until) : null;
  return { locked: !!j.locked, until };
}

export async function adminSecurityOnFailedLogin(params: {
  email: string;
  ip: string;
  device: string;
  userAgent: string;
}): Promise<{ nowLocked: boolean; lockedUntil: string | null; failuresInWindow: number }> {
  const { data, error } = await supabase.rpc("admin_security_on_failed_login", {
    p_email: params.email.trim(),
    p_ip: params.ip || "",
    p_device: params.device || "",
    p_user_agent: params.userAgent || "",
  });
  if (error) {
    if (isSecurityRpcOrTableMissing(error)) {
      return { nowLocked: false, lockedUntil: null, failuresInWindow: 0 };
    }
    throw error;
  }
  const j = data as { now_locked?: boolean; locked_until?: string; failures_in_window?: number } | null;
  return {
    nowLocked: !!j?.now_locked,
    lockedUntil: j?.locked_until != null ? String(j.locked_until) : null,
    failuresInWindow: Number(j?.failures_in_window ?? 0),
  };
}

export async function adminSecurityOnLoginSuccess(params: { ip: string; device: string; userAgent: string }): Promise<void> {
  const { error } = await supabase.rpc("admin_security_on_login_success", {
    p_ip: params.ip || "",
    p_device: params.device || "",
    p_user_agent: params.userAgent || "",
  });
  if (error && !isSecurityRpcOrTableMissing(error)) throw error;
}

export async function adminSecurityHasForcedSignoutSince(usuarioId: string, sessionStartedIso: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("admin_forced_signouts")
    .select("id")
    .eq("usuario_id", usuarioId)
    .gte("created_at", sessionStartedIso)
    .limit(1);
  if (error) {
    if (isMissingRelationError(error)) return false;
    throw error;
  }
  return (data?.length ?? 0) > 0;
}

export async function adminSecurityForceSignoutUser(targetUsuarioId: string): Promise<void> {
  const { error } = await supabase.rpc("admin_security_force_signout", { p_target_user: targetUsuarioId });
  if (error) throw error;
}

export type AdminLoginHistoryRow = {
  id: string;
  usuario_id: string;
  email: string | null;
  ip: string | null;
  device: string | null;
  user_agent: string | null;
  created_at: string | null;
};

export async function listAdminLoginHistory(limit = 200): Promise<AdminLoginHistoryRow[]> {
  const { data, error } = await supabase
    .from("admin_login_history")
    .select("id, usuario_id, email, ip, device, user_agent, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }
  return (data ?? []) as AdminLoginHistoryRow[];
}

export type AdminFailedLoginRow = {
  id: string;
  email_norm: string;
  ip: string | null;
  device: string | null;
  user_agent: string | null;
  created_at: string | null;
};

export async function listAdminFailedLogins(limit = 200): Promise<AdminFailedLoginRow[]> {
  const { data, error } = await supabase
    .from("admin_failed_login")
    .select("id, email_norm, ip, device, user_agent, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }
  return (data ?? []) as AdminFailedLoginRow[];
}

export type AdminSecuritySettingsRow = {
  id: number;
  max_failed_attempts: number;
  lockout_minutes: number;
  failure_window_minutes: number;
  updated_at: string | null;
};

export async function getAdminSecuritySettings(): Promise<AdminSecuritySettingsRow | null> {
  const { data, error } = await supabase.from("admin_security_settings").select("*").eq("id", 1).maybeSingle();
  if (error) {
    if (isMissingRelationError(error)) return null;
    throw error;
  }
  return data as AdminSecuritySettingsRow | null;
}

export async function updateAdminSecuritySettings(patch: {
  max_failed_attempts?: number;
  lockout_minutes?: number;
  failure_window_minutes?: number;
}): Promise<void> {
  const row = { ...patch, updated_at: new Date().toISOString() };
  const { error } = await supabase.from("admin_security_settings").update(row).eq("id", 1);
  if (error) throw error;
}

export type AdminEmailLockoutRow = {
  email_norm: string;
  locked_until: string;
  updated_at: string | null;
};

export async function listAdminEmailLockouts(): Promise<AdminEmailLockoutRow[]> {
  const { data, error } = await supabase.from("admin_email_lockouts").select("*").order("locked_until", { ascending: false });
  if (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }
  return (data ?? []) as AdminEmailLockoutRow[];
}

export async function deleteAdminEmailLockout(emailNorm: string): Promise<void> {
  const { error } = await supabase.from("admin_email_lockouts").delete().eq("email_norm", emailNorm);
  if (error) throw error;
}

export type AdminSessionActivityRow = {
  usuario_id: string;
  email: string | null;
  ip: string | null;
  device: string | null;
  last_seen_at: string | null;
};

export async function upsertAdminSessionActivity(params: {
  usuarioId: string;
  email: string | null;
  ip: string;
  device: string;
}): Promise<void> {
  const { error } = await supabase.from("admin_session_activity").upsert(
    {
      usuario_id: params.usuarioId,
      email: params.email,
      ip: params.ip || null,
      device: params.device || null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "usuario_id" },
  );
  if (error && !isMissingRelationError(error)) throw error;
}

export async function listAdminSessionActivityRecent(withinMinutes = 45): Promise<AdminSessionActivityRow[]> {
  const since = new Date(Date.now() - withinMinutes * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("admin_session_activity")
    .select("usuario_id, email, ip, device, last_seen_at")
    .gte("last_seen_at", since)
    .order("last_seen_at", { ascending: false });
  if (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }
  return (data ?? []) as AdminSessionActivityRow[];
}

export function clearAdminSecuritySessionMarker(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(ADMIN_SECURITY_SESSION_START_KEY);
  } catch {
    /* ignore */
  }
}

export type ConfiguracaoRow = {
  id: string;
  chave: string;
  valor: unknown;
  descricao: string | null;
  versao: number;
  updated_at: string | null;
  updated_by: string | null;
};

export async function listConfiguracoes(): Promise<ConfiguracaoRow[]> {
  const { data, error } = await supabase.from("configuracoes").select("*").order("chave", { ascending: true });
  if (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }
  return (data ?? []) as ConfiguracaoRow[];
}

export async function upsertConfiguracao(input: {
  chave: string;
  valor: unknown;
  descricao?: string | null;
}): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? null;
  const { error } = await supabase.from("configuracoes").upsert(
    {
      chave: input.chave.trim(),
      valor: input.valor as never,
      descricao: input.descricao ?? null,
      updated_by: uid,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "chave" },
  );
  if (error) throw error;
}

export type ConfiguracaoHistoricoRow = {
  id: string;
  configuracao_id: string;
  chave: string;
  valor_anterior: unknown;
  valor_novo: unknown;
  versao: number;
  alterado_em: string | null;
  alterado_por: string | null;
};

export async function listConfiguracoesHistorico(limit = 120): Promise<ConfiguracaoHistoricoRow[]> {
  const { data, error } = await supabase
    .from("configuracoes_historico")
    .select("id, configuracao_id, chave, valor_anterior, valor_novo, versao, alterado_em, alterado_por")
    .order("alterado_em", { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }
  return (data ?? []) as ConfiguracaoHistoricoRow[];
}

export type LogErroOrigem = "frontend" | "backend" | "api";
export type LogErroRow = {
  id: string;
  mensagem: string;
  stack: string | null;
  origem: LogErroOrigem | string;
  created_at: string | null;
};

export type FilaProcessoTipo = "envio_email" | "alerta" | "processamento";
export type FilaProcessoStatus = "pendente" | "processando" | "concluido" | "erro";
export type FilaProcessoRow = {
  id: string;
  tipo: FilaProcessoTipo | string;
  status: FilaProcessoStatus | string;
  tentativas: number;
  created_at: string | null;
  updated_at: string | null;
};

export type OperationalHealthResult = {
  checkedAt: string;
  sistemaOnline: boolean;
  supabaseOk: boolean;
  supabaseMessage?: string;
  externasOk: boolean | null;
  externasDetalhes: { url: string; ok: boolean; error?: string }[];
};

export async function listLogsErros(filter?: {
  origem?: LogErroOrigem | "" | null;
  fromDate?: string | null;
  toDate?: string | null;
  limit?: number;
}): Promise<LogErroRow[]> {
  let q = supabase
    .from("logs_erros")
    .select("id, mensagem, stack, origem, created_at")
    .order("created_at", { ascending: false })
    .limit(filter?.limit ?? 200);
  if (filter?.origem) q = q.eq("origem", filter.origem);
  if (filter?.fromDate) q = q.gte("created_at", `${filter.fromDate}T00:00:00.000Z`);
  if (filter?.toDate) q = q.lte("created_at", `${filter.toDate}T23:59:59.999Z`);
  const { data, error } = await q;
  if (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }
  return (data ?? []) as LogErroRow[];
}

export async function listFilaProcessos(limit = 100): Promise<FilaProcessoRow[]> {
  const { data, error } = await supabase
    .from("fila_processos")
    .select("id, tipo, status, tentativas, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }
  return (data ?? []) as FilaProcessoRow[];
}

export async function reprocessarFilaProcesso(id: string): Promise<void> {
  const { data: row, error: selErr } = await supabase.from("fila_processos").select("tentativas").eq("id", id).maybeSingle();
  if (selErr) throw selErr;
  const t = Number((row as { tentativas?: number } | null)?.tentativas ?? 0);
  const { error } = await supabase
    .from("fila_processos")
    .update({
      status: "pendente",
      tentativas: t + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function runOperationalHealthCheck(): Promise<OperationalHealthResult> {
  const checkedAt = new Date().toISOString();
  const externasDetalhes: OperationalHealthResult["externasDetalhes"] = [];
  const raw = (import.meta.env.VITE_ADMIN_EXTERNAL_HEALTH_URLS as string | undefined) ?? "";
  const urls = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!isSupabaseConfigured) {
    return {
      checkedAt,
      sistemaOnline: false,
      supabaseOk: false,
      supabaseMessage: "Variáveis VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não configuradas.",
      externasOk: urls.length === 0 ? null : false,
      externasDetalhes,
    };
  }

  const ping = await supabase.from("perfis").select("usuario_id", { head: true, count: "exact" });
  const supabaseOk = !ping.error;
  const supabaseMessage = ping.error ? formatSupabaseError(ping.error) : undefined;

  for (const url of urls) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(url, { method: "GET", signal: ctrl.signal, mode: "cors" });
      clearTimeout(t);
      externasDetalhes.push({ url, ok: res.ok });
    } catch (e) {
      externasDetalhes.push({ url, ok: false, error: formatSupabaseError(e) });
    }
  }

  const externasOk =
    urls.length === 0 ? null : externasDetalhes.length > 0 && externasDetalhes.every((d) => d.ok);
  const sistemaOnline = supabaseOk && (externasOk === null || externasOk === true);

  return {
    checkedAt,
    sistemaOnline,
    supabaseOk,
    supabaseMessage,
    externasOk,
    externasDetalhes,
  };
}

export async function listEquipes(): Promise<Equipe[]> {
  const res = await supabase.from("equipes").select("id, nome, parent_id, created_at").order("nome", { ascending: true });
  if (!res.error) {
    return (res.data ?? []) as Equipe[];
  }
  if (isSchemaMissingColumn(res.error.message ?? "", "created_at")) {
    const { data, error } = await supabase.from("equipes").select("id, nome, parent_id").order("nome", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as Equipe[]).map((e) => ({ ...e, created_at: null }));
  }
  throw res.error;
}

export async function listViagens(filter?: { equipeId?: string | null; destino?: string | null }): Promise<Viagem[]> {
  let q = supabase
    .from("viagens")
    .select(
      "id, cliente_id, equipe_id, destino, data_ida, data_volta, qtd_passageiros, status, checkin_enviado, chegada_enviada, retorno_enviado",
    )
    .order("data_ida", { ascending: true });
  if (filter?.equipeId) q = q.eq("equipe_id", filter.equipeId);
  if (filter?.destino && filter.destino.trim() !== "") q = q.ilike("destino", `%${filter.destino.trim()}%`);
  const { data, error } = await q;
  if (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id ?? ""),
    cliente_id: String(r.cliente_id ?? ""),
    equipe_id: r.equipe_id == null ? null : String(r.equipe_id),
    destino: String(r.destino ?? ""),
    data_ida: String(r.data_ida ?? ""),
    data_volta: String(r.data_volta ?? ""),
    qtd_passageiros: Number(r.qtd_passageiros ?? 0),
    status: (r.status as Viagem["status"]) ?? null,
    checkin_enviado: (r.checkin_enviado as boolean | null) ?? false,
    chegada_enviada: (r.chegada_enviada as boolean | null) ?? false,
    retorno_enviado: (r.retorno_enviado as boolean | null) ?? false,
  }));
}

export async function listFinanceiroLancamentos(filter?: {
  equipeId?: string | null;
  year?: number | null;
  month?: number | null;
}): Promise<FinanceiroLancamento[]> {
  let q = supabase
    .from("financeiro_lancamentos")
    .select("id, tipo, categoria, descricao, valor, data, equipe_id, usuario_id, detalhes, created_at")
    .order("data", { ascending: false });

  if (filter?.equipeId) q = q.eq("equipe_id", filter.equipeId);
  if (filter?.year && Number.isFinite(filter.year)) {
    const y = String(filter.year).padStart(4, "0");
    q = q.gte("data", `${y}-01-01`).lte("data", `${y}-12-31`);
  }
  if (filter?.year && filter?.month && Number.isFinite(filter.month)) {
    const y = String(filter.year).padStart(4, "0");
    const m = String(filter.month).padStart(2, "0");
    const end = new Date(Number(filter.year), Number(filter.month), 0).getDate();
    q = q.gte("data", `${y}-${m}-01`).lte("data", `${y}-${m}-${String(end).padStart(2, "0")}`);
  }

  const { data, error } = await q;
  if (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id ?? ""),
    tipo: (r.tipo as FinanceiroTipo) ?? "despesa",
    categoria: (r.categoria as FinanceiroCategoria) ?? "infraestrutura",
    descricao: r.descricao == null ? null : String(r.descricao),
    valor: Number(r.valor ?? 0),
    data: String(r.data ?? ""),
    equipe_id: r.equipe_id == null ? null : String(r.equipe_id),
    usuario_id: r.usuario_id == null ? null : String(r.usuario_id),
    detalhes: r.detalhes && typeof r.detalhes === "object" ? (r.detalhes as Record<string, unknown>) : null,
    created_at: r.created_at == null ? null : String(r.created_at),
  }));
}

export async function createFinanceiroLancamento(input: {
  tipo: FinanceiroTipo;
  categoria: FinanceiroCategoria;
  descricao?: string | null;
  valor: number;
  data: string;
  equipe_id?: string | null;
  usuario_id?: string | null;
  detalhes?: Record<string, unknown> | null;
}): Promise<void> {
  const { error } = await supabase.from("financeiro_lancamentos").insert({
    tipo: input.tipo,
    categoria: input.categoria,
    descricao: input.descricao ?? null,
    valor: input.valor,
    data: input.data,
    equipe_id: input.equipe_id ?? null,
    usuario_id: input.usuario_id ?? null,
    detalhes: input.detalhes ?? null,
  });
  if (error) throw error;
}

export type AssinaturaTipo = "cliente" | "equipe";
export type AssinaturaStatus = "ativa" | "vencida" | "trial";

export type AssinaturaRow = {
  id: string;
  tipo: AssinaturaTipo | string;
  referencia_id: string;
  status: AssinaturaStatus | string;
  data_inicio: string;
  data_fim: string;
  cancelado_em: string | null;
  motivo_churn: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function todayYmdLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Acesso permitido quando `ativa` ou `trial` e `data_fim` não passou (e status não é `vencida`). */
export function assinaturaPermiteAcesso(status: string, dataFimYmd: string | null, hojeYmd: string): boolean {
  const st = (status ?? "").toLowerCase().trim();
  if (st === "vencida") return false;
  if (dataFimYmd && dataFimYmd < hojeYmd) return false;
  return st === "ativa" || st === "trial";
}

export async function listAssinaturasNegocio(filter?: { status?: AssinaturaStatus | string | null }): Promise<AssinaturaRow[]> {
  let q = supabase.from("assinaturas").select("*").order("data_inicio", { ascending: false }).limit(500);
  if (filter?.status) q = q.eq("status", filter.status);
  const { data, error } = await q;
  if (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id ?? ""),
    tipo: String(r.tipo ?? ""),
    referencia_id: String(r.referencia_id ?? ""),
    status: String(r.status ?? ""),
    data_inicio: String(r.data_inicio ?? ""),
    data_fim: String(r.data_fim ?? ""),
    cancelado_em: r.cancelado_em == null ? null : String(r.cancelado_em),
    motivo_churn: r.motivo_churn == null || r.motivo_churn === "" ? null : String(r.motivo_churn),
    created_at: r.created_at == null ? null : String(r.created_at),
    updated_at: r.updated_at == null ? null : String(r.updated_at),
  }));
}

export async function updateAssinaturaMotivoChurn(params: { id: string; motivo_churn: string | null }): Promise<void> {
  const trimmed = params.motivo_churn?.trim() ?? "";
  const { error } = await supabase
    .from("assinaturas")
    .update({ motivo_churn: trimmed === "" ? null : trimmed, updated_at: new Date().toISOString() })
    .eq("id", params.id);
  if (error) throw error;
}

export async function evaluateAdminSubscriptionBlock(params: {
  role: string | null;
  equipeId: string | null;
}): Promise<{ blocked: boolean; reason?: string }> {
  const r = String(params.role ?? "")
    .trim()
    .toLowerCase();
  if (r !== "admin" && r !== "admin_master") return { blocked: false };
  if (!params.equipeId || String(params.equipeId).trim() === "") return { blocked: false };

  const { data, error } = await supabase
    .from("assinaturas")
    .select("status, data_fim")
    .eq("tipo", "equipe")
    .eq("referencia_id", params.equipeId)
    .order("data_inicio", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error)) return { blocked: false };
    return { blocked: false };
  }
  if (!data) {
    return { blocked: true, reason: "Não há assinatura registada para esta gestão. Contacte o suporte ou registe uma assinatura no Dashboard." };
  }
  const hoje = todayYmdLocal();
  const row = data as { status?: string; data_fim?: string };
  if (!assinaturaPermiteAcesso(String(row.status ?? ""), row.data_fim ?? null, hoje)) {
    return {
      blocked: true,
      reason: "A assinatura da gestão está vencida ou inativa. Renove no Dashboard (secção Assinaturas).",
    };
  }
  return { blocked: false };
}

export type NegocioDashboardSnapshot = {
  equipesAtivas: number;
  clientesAtivos: number;
  /** Perfis com role cliente ou cliente_gestao (contagem na base). */
  clientesNaBase: number;
  assinaturasAtivas: number;
  assinaturasVencidas: number;
  /** Assinaturas tipo `cliente` com acesso permitido. */
  assinaturasClienteAtivas: number;
  /** Assinaturas tipo `cliente` sem acesso (vencida / cancelada). */
  assinaturasClienteInativas: number;
  /** Entre assinaturas de cliente (ativas + inativas), % com acesso. */
  retencaoAssinaturasClientesPct: number | null;
  /** Complemento da retenção no mesmo conjunto (só assinaturas cliente). */
  saidaAssinaturasClientesPct: number | null;
  churnMotivos: { motivo: string; count: number }[];
  churnPorMes: { mes: string; total: number }[];
  novosUsuariosPorMes: { mes: string; total: number }[];
  novasEquipesPorMes: { mes: string; total: number }[];
  assinaturasDisponivel: boolean;
  perfisCreatedAtDisponivel: boolean;
  equipesCreatedAtDisponivel: boolean;
};

function mesKeysUltimosN(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function incrementMonthCount(map: Map<string, number>, isoTs: string | null | undefined) {
  if (!isoTs) return;
  const t = Date.parse(isoTs);
  if (Number.isNaN(t)) return;
  const dt = new Date(t);
  const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
  map.set(key, (map.get(key) ?? 0) + 1);
}

export async function getNegocioDashboardSnapshot(): Promise<NegocioDashboardSnapshot> {
  const meses = mesKeysUltimosN(12);
  const emptyMeses = () => meses.map((mes) => ({ mes, total: 0 }));

  const churnPorMes = new Map<string, number>(meses.map((m) => [m, 0]));
  const novosUsuariosPorMes = new Map<string, number>(meses.map((m) => [m, 0]));
  const novasEquipesPorMes = new Map<string, number>(meses.map((m) => [m, 0]));

  const snapshot: NegocioDashboardSnapshot = {
    equipesAtivas: 0,
    clientesAtivos: 0,
    clientesNaBase: 0,
    assinaturasAtivas: 0,
    assinaturasVencidas: 0,
    assinaturasClienteAtivas: 0,
    assinaturasClienteInativas: 0,
    retencaoAssinaturasClientesPct: null,
    saidaAssinaturasClientesPct: null,
    churnMotivos: [],
    churnPorMes: emptyMeses(),
    novosUsuariosPorMes: emptyMeses(),
    novasEquipesPorMes: emptyMeses(),
    assinaturasDisponivel: false,
    perfisCreatedAtDisponivel: false,
    equipesCreatedAtDisponivel: false,
  };

  const hoje = todayYmdLocal();

  const { data: assRows, error: assErr } = await supabase.from("assinaturas").select("*").limit(2000);
  if (assErr) {
    if (!isMissingRelationError(assErr)) throw assErr;
    return snapshot;
  }
  snapshot.assinaturasDisponivel = true;

  const list = (assRows ?? []) as Array<Record<string, unknown>>;
  const equipesAtivasSet = new Set<string>();
  const clientesAtivosSet = new Set<string>();
  const churnMotivosMap = new Map<string, number>();

  for (const r of list) {
    const tipo = String(r.tipo ?? "");
    const status = String(r.status ?? "");
    const dataFim = r.data_fim == null ? null : String(r.data_fim);
    const ref = String(r.referencia_id ?? "");
    const ativa = assinaturaPermiteAcesso(status, dataFim, hoje);
    const vencidaOuPassou = !ativa;

    if (ativa) {
      snapshot.assinaturasAtivas += 1;
      if (tipo === "equipe") equipesAtivasSet.add(ref);
      if (tipo === "cliente") {
        clientesAtivosSet.add(ref);
        snapshot.assinaturasClienteAtivas += 1;
      }
    } else {
      snapshot.assinaturasVencidas += 1;
      if (tipo === "cliente") {
        snapshot.assinaturasClienteInativas += 1;
        const motivoRaw = r.motivo_churn == null ? "" : String(r.motivo_churn);
        const motivo = motivoRaw.trim() || "Sem registo de motivo";
        churnMotivosMap.set(motivo, (churnMotivosMap.get(motivo) ?? 0) + 1);
      }
    }

    const cancelado = r.cancelado_em == null ? null : String(r.cancelado_em);
    if (cancelado) incrementMonthCount(churnPorMes, cancelado);
    else if (vencidaOuPassou && dataFim) {
      const d = Date.parse(`${dataFim}T12:00:00`);
      if (!Number.isNaN(d)) incrementMonthCount(churnPorMes, new Date(d).toISOString());
    }
  }

  snapshot.equipesAtivas = equipesAtivasSet.size;
  snapshot.clientesAtivos = clientesAtivosSet.size;
  const totalCliAss = snapshot.assinaturasClienteAtivas + snapshot.assinaturasClienteInativas;
  if (totalCliAss > 0) {
    snapshot.retencaoAssinaturasClientesPct = (snapshot.assinaturasClienteAtivas / totalCliAss) * 100;
    snapshot.saidaAssinaturasClientesPct = (snapshot.assinaturasClienteInativas / totalCliAss) * 100;
  }
  snapshot.churnMotivos = [...churnMotivosMap.entries()]
    .map(([motivo, count]) => ({ motivo, count }))
    .sort((a, b) => b.count - a.count);

  const perfisCliente = await supabase
    .from("perfis")
    .select("usuario_id", { count: "exact", head: true })
    .in("role", ["cliente", "cliente_gestao"]);
  if (!perfisCliente.error) snapshot.clientesNaBase = perfisCliente.count ?? 0;

  const usuarios = await supabase.from("perfis").select("created_at").limit(8000);
  if (!usuarios.error && usuarios.data) {
    snapshot.perfisCreatedAtDisponivel = true;
    for (const row of usuarios.data as { created_at?: string | null }[]) {
      incrementMonthCount(novosUsuariosPorMes, row.created_at ?? undefined);
    }
  }

  const equipes = await supabase.from("equipes").select("created_at").limit(4000);
  if (!equipes.error && equipes.data) {
    snapshot.equipesCreatedAtDisponivel = true;
    for (const row of equipes.data as { created_at?: string | null }[]) {
      incrementMonthCount(novasEquipesPorMes, row.created_at ?? undefined);
    }
  }

  snapshot.churnPorMes = meses.map((mes) => ({ mes, total: churnPorMes.get(mes) ?? 0 }));
  snapshot.novosUsuariosPorMes = meses.map((mes) => ({ mes, total: novosUsuariosPorMes.get(mes) ?? 0 }));
  snapshot.novasEquipesPorMes = meses.map((mes) => ({ mes, total: novasEquipesPorMes.get(mes) ?? 0 }));

  return snapshot;
}

export async function updateViagemStatus(params: { viagemId: string; status: ViagemStatus }): Promise<void> {
  const { error } = await supabase.from("viagens").update({ status: params.status }).eq("id", params.viagemId);
  if (error) throw error;
}

export async function markViagemMensagemEnviada(params: {
  viagemId: string;
  tipo: "pre_viagem" | "chegada" | "pos_viagem";
}): Promise<void> {
  const patch: Record<string, boolean> = {};
  if (params.tipo === "pre_viagem") patch.checkin_enviado = true;
  if (params.tipo === "chegada") patch.chegada_enviada = true;
  if (params.tipo === "pos_viagem") patch.retorno_enviado = true;
  const { error } = await supabase.from("viagens").update(patch).eq("id", params.viagemId);
  if (error) throw error;
}

export async function createEquipe(input: { nome: string; parent_id?: string | null }): Promise<string> {
  const { data, error } = await supabase
    .from("equipes")
    .insert({ nome: input.nome.trim(), parent_id: input.parent_id ?? null })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function updateEquipeNome(equipeId: string, nome: string): Promise<void> {
  const { error } = await supabase.from("equipes").update({ nome: nome.trim() }).eq("id", equipeId);
  if (error) throw error;
}

export type ListPerfisFilter = {
  equipeIds?: string[];
  /** Filtra por `perfis.role` exata (ex.: só `cliente`). */
  role?: string;
  /** Apenas linhas com `equipe_id` nulo (contas B2C fora de equipas de gestão). */
  equipeIdIsNull?: boolean;
};

export async function listPerfis(filter?: ListPerfisFilter): Promise<Perfil[]> {
  let q = supabase.from("perfis").select("usuario_id, nome_completo, role, equipe_id").order("nome_completo", { ascending: true });
  if (filter?.equipeIds?.length) {
    q = q.in("equipe_id", filter.equipeIds);
  } else if (filter?.equipeIdIsNull) {
    q = q.is("equipe_id", null);
  }
  if (filter?.role) q = q.eq("role", filter.role);
  const res = await q;
  if (!res.error) {
    let rows = (res.data ?? []) as Perfil[];
    if (filter?.equipeIdIsNull) {
      rows = rows.filter((p) => (p.equipe_id ?? "").toString().trim() === "");
    }
    return rows;
  }

  const msg = res.error.message ?? "";
  if (isSchemaMissingColumn(msg, "equipe_id")) {
    const legacy = await supabase.from("perfis").select("usuario_id, nome_completo, role").order("nome_completo", { ascending: true });
    if (legacy.error) throw legacy.error;
    let rows = ((legacy.data ?? []) as Array<{ usuario_id: string; nome_completo: string | null; role: string }>).map((p) => ({
      ...p,
      equipe_id: null as string | null,
    })) as Perfil[];
    if (filter?.equipeIds?.length) {
      const set = new Set(filter.equipeIds);
      rows = rows.filter((p) => p.equipe_id != null && set.has(p.equipe_id));
    }
    if (filter?.role) rows = rows.filter((p) => String(p.role) === filter.role);
    if (filter?.equipeIdIsNull) {
      // Sem coluna equipe_id não dá para distinguir B2C; não devolver clientes “com equipa”.
      return [];
    }
    return rows;
  }
  throw res.error;
}

/** Contagem de contas B2C (`cliente` sem `equipe_id`), alinhada a `ClientsPage` / `listPerfis`. */
export async function countB2cClientesSemEquipe(): Promise<number> {
  const nullRes = await supabase
    .from("perfis")
    .select("usuario_id", { count: "exact", head: true })
    .eq("role", "cliente")
    .is("equipe_id", null);

  if (nullRes.error) {
    const msg = nullRes.error.message ?? "";
    if (isSchemaMissingColumn(msg, "equipe_id")) return 0;
    throw nullRes.error;
  }

  const emptyRes = await supabase
    .from("perfis")
    .select("usuario_id", { count: "exact", head: true })
    .eq("role", "cliente")
    .eq("equipe_id", "");

  const empty = emptyRes.error ? 0 : emptyRes.count ?? 0;
  return (nullRes.count ?? 0) + empty;
}

export async function listGestores(): Promise<Perfil[]> {
  const res = await supabase
    .from("perfis")
    .select("usuario_id, nome_completo, role, equipe_id")
    .eq("role", "gestor")
    .order("nome_completo", { ascending: true });
  if (!res.error) return (res.data ?? []) as Perfil[];
  if (isSchemaMissingColumn(res.error.message ?? "", "equipe_id")) {
    const legacy = await supabase.from("perfis").select("usuario_id, nome_completo, role").eq("role", "gestor");
    if (legacy.error) throw legacy.error;
    return ((legacy.data ?? []) as Perfil[]).map((p) => ({ ...p, equipe_id: null }));
  }
  throw res.error;
}

export async function listCsPerfis(filter?: { equipeIds?: string[] }): Promise<Perfil[]> {
  let q = supabase
    .from("perfis")
    .select("usuario_id, nome_completo, role, equipe_id")
    .eq("role", "cs")
    .order("nome_completo", { ascending: true });
  if (filter?.equipeIds?.length) q = q.in("equipe_id", filter.equipeIds);
  const res = await q;
  if (!res.error) return (res.data ?? []) as Perfil[];
  if (isSchemaMissingColumn(res.error.message ?? "", "equipe_id")) {
    const legacy = await supabase.from("perfis").select("usuario_id, nome_completo, role").eq("role", "cs");
    if (legacy.error) throw legacy.error;
    let rows = ((legacy.data ?? []) as Perfil[]).map((p) => ({ ...p, equipe_id: null }));
    if (filter?.equipeIds?.length) {
      const set = new Set(filter.equipeIds);
      rows = rows.filter((p) => p.equipe_id != null && set.has(p.equipe_id));
    }
    return rows;
  }
  throw res.error;
}

export async function listEquipeGestorLinks(): Promise<Array<{ equipe_id: string; gestor_id: string }>> {
  const { data, error } = await supabase.from("equipe_gestores").select("equipe_id, gestor_id");
  if (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }
  return (data ?? []) as Array<{ equipe_id: string; gestor_id: string }>;
}

export async function listEquipeCsLinks(): Promise<Array<{ equipe_id: string; cs_id: string }>> {
  const { data, error } = await supabase.from("equipe_cs").select("equipe_id, cs_id");
  if (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }
  return (data ?? []) as Array<{ equipe_id: string; cs_id: string }>;
}

export async function setGestoresForEquipe(params: { equipeId: string; gestorIds: string[] }): Promise<void> {
  const next = [...new Set(params.gestorIds)];
  const allLinks = await listEquipeGestorLinks();
  const currentLinks = allLinks.filter((l) => l.equipe_id === params.equipeId).map((l) => l.gestor_id);
  const toRemove = currentLinks.filter((id) => !next.includes(id));
  for (const gestorId of toRemove) {
    await replaceEquipeGestoresForGestor(gestorId, null);
    const { data: row, error: qErr } = await supabase.from("perfis").select("role").eq("usuario_id", gestorId).maybeSingle();
    if (qErr) throw qErr;
    if (row && (row as { role?: string }).role === "gestor") {
      await updatePerfilRoleAndEquipe(gestorId, "gestor", null);
    }
  }
  for (const gestorId of next) {
    await replaceEquipeGestoresForGestor(gestorId, params.equipeId);
    await updatePerfilRoleAndEquipe(gestorId, "gestor", params.equipeId);
  }
}

export async function setCsForEquipe(params: { equipeId: string; csIds: string[] }): Promise<void> {
  const next = [...new Set(params.csIds)];
  const allLinks = await listEquipeCsLinks();
  const currentLinks = allLinks.filter((l) => l.equipe_id === params.equipeId).map((l) => l.cs_id);
  const toRemove = currentLinks.filter((id) => !next.includes(id));
  for (const csId of toRemove) {
    await replaceEquipeCsForCs(csId, null);
    const { data: row, error: qErr } = await supabase.from("perfis").select("role").eq("usuario_id", csId).maybeSingle();
    if (qErr) throw qErr;
    if (row && (row as { role?: string }).role === "cs") {
      await updatePerfilRoleAndEquipe(csId, "cs", null);
    }
  }
  for (const csId of next) {
    await replaceEquipeCsForCs(csId, params.equipeId);
    await updatePerfilRoleAndEquipe(csId, "cs", params.equipeId);
  }
}

export async function listGestorFuncoesMap(gestorIds: string[]): Promise<Record<string, GestorFuncao>> {
  if (!gestorIds.length) return {};
  const { data, error } = await supabase.from("gestor_funcoes").select("gestor_id, funcao").in("gestor_id", gestorIds);
  if (error) {
    if (isMissingRelationError(error)) {
      const local = readGestorFuncoesLocal();
      const out: Record<string, GestorFuncao> = {};
      for (const id of gestorIds) {
        if (local[id]) out[id] = local[id];
      }
      return out;
    }
    throw error;
  }
  const out: Record<string, GestorFuncao> = {};
  for (const row of data ?? []) {
    const r = row as { gestor_id: string; funcao: GestorFuncao };
    if (r.funcao === "nacional" || r.funcao === "internacional") out[r.gestor_id] = r.funcao;
  }
  return out;
}

export async function setGestorFuncao(params: { gestorId: string; funcao: GestorFuncao | null }): Promise<void> {
  if (!params.funcao) {
    const del = await supabase.from("gestor_funcoes").delete().eq("gestor_id", params.gestorId);
    if (del.error) {
      if (isMissingRelationError(del.error)) {
        const local = readGestorFuncoesLocal();
        delete local[params.gestorId];
        writeGestorFuncoesLocal(local);
        return;
      }
      throw del.error;
    }
    return;
  }

  const up = await supabase
    .from("gestor_funcoes")
    .upsert({ gestor_id: params.gestorId, funcao: params.funcao }, { onConflict: "gestor_id" });
  if (up.error) {
    if (isMissingRelationError(up.error)) {
      const local = readGestorFuncoesLocal();
      local[params.gestorId] = params.funcao;
      writeGestorFuncoesLocal(local);
      return;
    }
    throw up.error;
  }
}

export async function listGestorEquipeSlotMap(
  params: { equipeId: string; gestorIds: string[] },
): Promise<Record<string, GestorEquipeSlot>> {
  const { equipeId, gestorIds } = params;
  if (!gestorIds.length) return {};
  const local = readGestorEquipeSlotLocal(equipeId);
  const out: Record<string, GestorEquipeSlot> = {};
  for (const id of gestorIds) {
    const slot = local[id];
    if (typeof slot === "number" && Number.isFinite(slot) && slot > 0) out[id] = slot;
  }
  return out;
}

export async function setGestorEquipeSlot(params: {
  equipeId: string;
  gestorId: string;
  slot: GestorEquipeSlot | null;
}): Promise<void> {
  const local = readGestorEquipeSlotLocal(params.equipeId);
  if (!params.slot) {
    delete local[params.gestorId];
  } else {
    local[params.gestorId] = params.slot;
  }
  writeGestorEquipeSlotLocal(params.equipeId, local);
}

export async function listCSEquipeSlotMap(params: { equipeId: string; csIds: string[] }): Promise<Record<string, CSEquipeSlot>> {
  const { equipeId, csIds } = params;
  if (!csIds.length) return {};
  const local = readCSEquipeSlotLocal(equipeId);
  const out: Record<string, CSEquipeSlot> = {};
  for (const id of csIds) {
    const slot = local[id];
    if (typeof slot === "number" && Number.isFinite(slot) && slot > 0) out[id] = slot;
  }
  return out;
}

export async function setCSEquipeSlot(params: { equipeId: string; csId: string; slot: CSEquipeSlot | null }): Promise<void> {
  const local = readCSEquipeSlotLocal(params.equipeId);
  if (!params.slot) {
    delete local[params.csId];
  } else {
    local[params.csId] = params.slot;
  }
  writeCSEquipeSlotLocal(params.equipeId, local);
}

export async function listCSEquipeAssignments(params: { equipeId: string }): Promise<Record<number, string[]>> {
  const local = readCSEquipeAssignmentsLocal(params.equipeId);
  const out: Record<number, string[]> = {};
  for (const [slotKey, csIds] of Object.entries(local)) {
    const slot = Number(slotKey);
    if (!Number.isFinite(slot) || slot <= 0) continue;
    out[slot] = [...new Set((csIds ?? []).map((x) => String(x)).filter(Boolean))];
  }
  return out;
}

export async function setCSEquipeAssignments(params: { equipeId: string; assignments: Record<number, string[]> }): Promise<void> {
  const normalized: CSEquipeAssignments = {};
  for (const [slotKey, csIds] of Object.entries(params.assignments)) {
    const slot = Number(slotKey);
    if (!Number.isFinite(slot) || slot <= 0) continue;
    normalized[String(slot)] = [...new Set((csIds ?? []).map((x) => String(x)).filter(Boolean))];
  }
  writeCSEquipeAssignmentsLocal(params.equipeId, normalized);
}

/** Normaliza links de equipe para refletir apenas `perfis.equipe_id` (1 membro => 1 grupo). */
export async function normalizeEquipeRoleLinksFromPerfis(): Promise<void> {
  const gestores = await listGestores();
  const csPerfis = await listCsPerfis();

  const delG = await supabase.from("equipe_gestores").delete().not("gestor_id", "is", null);
  if (delG.error && !isMissingRelationError(delG.error)) throw delG.error;
  const delC = await supabase.from("equipe_cs").delete().not("cs_id", "is", null);
  if (delC.error && !isMissingRelationError(delC.error)) throw delC.error;

  const insG = gestores
    .filter((g) => g.equipe_id != null && String(g.equipe_id).trim() !== "")
    .map((g) => ({ equipe_id: String(g.equipe_id), gestor_id: g.usuario_id }));
  if (insG.length) {
    const r = await supabase.from("equipe_gestores").upsert(insG, { onConflict: "equipe_id,gestor_id" });
    if (r.error && !isMissingRelationError(r.error)) throw r.error;
  }

  const insC = csPerfis
    .filter((c) => c.equipe_id != null && String(c.equipe_id).trim() !== "")
    .map((c) => ({ equipe_id: String(c.equipe_id), cs_id: c.usuario_id }));
  if (insC.length) {
    const r = await supabase.from("equipe_cs").upsert(insC, { onConflict: "equipe_id,cs_id" });
    if (r.error && !isMissingRelationError(r.error)) throw r.error;
  }
}

export function gestoresNaEquipe(
  equipeId: string,
  gestores: Perfil[],
  links: Array<{ equipe_id: string; gestor_id: string }>,
): Perfil[] {
  const fromLink = new Set(links.filter((l) => l.equipe_id === equipeId).map((l) => l.gestor_id));
  return gestores.filter((g) => g.equipe_id === equipeId || fromLink.has(g.usuario_id));
}

export function gestoresNoGrupos(
  equipeIds: string[],
  gestores: Perfil[],
  links: Array<{ equipe_id: string; gestor_id: string }>,
): Perfil[] {
  if (!equipeIds.length) return [];
  const set = new Set(equipeIds);
  const fromLink = new Set(links.filter((l) => set.has(l.equipe_id)).map((l) => l.gestor_id));
  return gestores.filter((g) => (g.equipe_id != null && set.has(g.equipe_id)) || fromLink.has(g.usuario_id));
}

export function csNosGrupos(
  equipeIds: string[],
  equipeCsLinks: Array<{ equipe_id: string; cs_id: string }>,
  csPerfis: Perfil[],
): Perfil[] {
  if (!equipeIds.length) return [];
  const set = new Set(equipeIds);
  const fromLink = new Set(equipeCsLinks.filter((l) => set.has(l.equipe_id)).map((l) => l.cs_id));
  return csPerfis.filter((c) => (c.equipe_id != null && set.has(c.equipe_id)) || fromLink.has(c.usuario_id));
}

export function csNaEquipe(
  equipeId: string,
  equipeCsLinks: Array<{ equipe_id: string; cs_id: string }>,
  csPerfis: Perfil[],
): Perfil[] {
  const fromLink = new Set(equipeCsLinks.filter((l) => l.equipe_id === equipeId).map((l) => l.cs_id));
  return csPerfis.filter((c) => (c.equipe_id != null && c.equipe_id === equipeId) || fromLink.has(c.usuario_id));
}

/** Clientes em que o gestor aparece em `cliente_gestores`. */
export async function listClienteIdsForGestor(gestorId: string): Promise<string[]> {
  const { data, error } = await supabase.from("cliente_gestores").select("cliente_id").eq("gestor_id", gestorId);
  if (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }
  return [...new Set((data ?? []).map((r: { cliente_id: string }) => String(r.cliente_id)))];
}

export async function listClienteGestorIdsMap(clienteIds: string[]): Promise<Record<string, string[]>> {
  if (!clienteIds.length) return {};
  const { data, error } = await supabase.from("cliente_gestores").select("cliente_id, gestor_id").in("cliente_id", clienteIds);
  if (error) {
    if (isMissingRelationError(error)) return {};
    throw error;
  }
  const map: Record<string, string[]> = {};
  for (const row of data ?? []) {
    const r = row as { cliente_id: string; gestor_id: string };
    if (!map[r.cliente_id]) map[r.cliente_id] = [];
    if (!map[r.cliente_id].includes(r.gestor_id)) map[r.cliente_id].push(r.gestor_id);
  }
  return map;
}

export async function listClienteCsIdsMap(clienteIds: string[]): Promise<Record<string, string[]>> {
  if (!clienteIds.length) return {};
  const { data, error } = await supabase.from("cliente_cs").select("cliente_id, cs_id").in("cliente_id", clienteIds);
  if (error) {
    if (isMissingRelationError(error)) return {};
    throw error;
  }
  const map: Record<string, string[]> = {};
  for (const row of data ?? []) {
    const r = row as { cliente_id: string; cs_id: string };
    if (!map[r.cliente_id]) map[r.cliente_id] = [];
    if (!map[r.cliente_id].includes(r.cs_id)) map[r.cliente_id].push(r.cs_id);
  }
  return map;
}

export async function setGestoresForClient(params: { clienteId: string; gestorIds: string[] }): Promise<void> {
  const { data: clienteRow, error: clienteErr } = await supabase
    .from("perfis")
    .select("usuario_id, equipe_id, role")
    .eq("usuario_id", params.clienteId)
    .maybeSingle();
  if (clienteErr) throw clienteErr;
  if (!clienteRow) throw new Error("Cliente não encontrado.");
  const equipeCliente = (clienteRow as { equipe_id?: string | null }).equipe_id;
  if (equipeCliente == null || String(equipeCliente).trim() === "") {
    throw new Error("O cliente tem de ter equipe_id antes de atribuir gestores.");
  }
  const eqId = String(equipeCliente);
  const links = await listEquipeGestorLinks();
  const allGestores = await listGestores();
  const allowedGestores = new Set(gestoresNaEquipe(eqId, allGestores, links).map((g) => g.usuario_id));
  for (const gid of params.gestorIds) {
    if (!allowedGestores.has(gid)) {
      throw new Error("Só pode atribuir gestores que pertençam à mesma equipe que o cliente.");
    }
  }

  const { data: currentLinks, error: curErr } = await supabase
    .from("cliente_gestores")
    .select("gestor_id")
    .eq("cliente_id", params.clienteId);
  if (curErr) throw curErr;
  const currentSet = new Set<string>((currentLinks ?? []).map((r: { gestor_id: string }) => String(r.gestor_id)));
  const nextSet = new Set(params.gestorIds);
  const toRemove = [...currentSet].filter((id) => !nextSet.has(id));
  const toAdd = [...nextSet].filter((id) => !currentSet.has(id));
  if (toRemove.length) {
    const { error: delErr } = await supabase
      .from("cliente_gestores")
      .delete()
      .eq("cliente_id", params.clienteId)
      .in("gestor_id", toRemove);
    if (delErr) throw delErr;
  }
  for (const gestorId of toAdd) {
    const { error: insErr } = await supabase
      .from("cliente_gestores")
      .upsert({ cliente_id: params.clienteId, gestor_id: gestorId }, { onConflict: "cliente_id,gestor_id" });
    if (insErr) throw insErr;
  }
}

export async function setCsForClient(params: { clienteId: string; csIds: string[] }): Promise<void> {
  const { data: clienteRow, error: clienteErr } = await supabase
    .from("perfis")
    .select("usuario_id, equipe_id, role")
    .eq("usuario_id", params.clienteId)
    .maybeSingle();
  if (clienteErr) throw clienteErr;
  if (!clienteRow) throw new Error("Cliente não encontrado.");
  const equipeCliente = (clienteRow as { equipe_id?: string | null }).equipe_id;
  if (equipeCliente == null || String(equipeCliente).trim() === "") {
    throw new Error("O cliente tem de ter equipe_id antes de atribuir CS.");
  }
  const eqId = String(equipeCliente);
  const links = await listEquipeCsLinks();
  const allCs = await listCsPerfis();
  const allowedCs = new Set(csNaEquipe(eqId, links, allCs).map((c) => c.usuario_id));
  for (const cid of params.csIds) {
    if (!allowedCs.has(cid)) {
      throw new Error("Só pode atribuir CS que pertençam à mesma equipe que o cliente.");
    }
  }

  const { data: currentLinks, error: curErr } = await supabase.from("cliente_cs").select("cs_id").eq("cliente_id", params.clienteId);
  if (curErr) {
    if (isMissingRelationError(curErr)) return;
    throw curErr;
  }
  const currentSet = new Set<string>((currentLinks ?? []).map((r: { cs_id: string }) => String(r.cs_id)));
  const nextSet = new Set(params.csIds);
  const toRemove = [...currentSet].filter((id) => !nextSet.has(id));
  const toAdd = [...nextSet].filter((id) => !currentSet.has(id));
  if (toRemove.length) {
    const { error: delErr } = await supabase
      .from("cliente_cs")
      .delete()
      .eq("cliente_id", params.clienteId)
      .in("cs_id", toRemove);
    if (delErr) throw delErr;
  }
  for (const csId of toAdd) {
    const { error: insErr } = await supabase
      .from("cliente_cs")
      .upsert({ cliente_id: params.clienteId, cs_id: csId }, { onConflict: "cliente_id,cs_id" });
    if (insErr) throw insErr;
  }
}

export type CreateUserInput = {
  nome_completo: string;
  email: string;
  password: string;
  role: Perfil["role"];
  equipe_id?: string | null;
  cliente_gestor_ids?: string[] | null;
  cliente_cs_ids?: string[] | null;
};

export async function createUser(input: CreateUserInput): Promise<string> {
  const roleNorm = String(input.role ?? "")
    .trim()
    .toLowerCase();
  if (roleNorm === "admin_master") {
    throw new Error("O role admin_master não pode ser criado pelo painel; defina-o apenas na base de dados.");
  }
  if (input.role === "gestor" && !input.equipe_id) {
    throw new Error("Gestor tem de ter equipe_id (uma Gestão).");
  }
  if (input.role === "cs" && !input.equipe_id) {
    throw new Error("CS tem de ter equipe_id (uma Gestão).");
  }
  if (input.role === "admin_equipe" && !input.equipe_id?.trim()) {
    throw new Error("Admin da equipe (admin_equipe) tem de ter equipe_id (uma Gestão).");
  }

  const { data, error } = await supabaseNoPersist.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: { data: { must_change_password: true } },
  });
  if (error) throw error;
  const userId = data.user?.id;
  if (!userId) throw new Error("Falha ao criar utilizador (sem id).");

  const slugBase = slugify(input.nome_completo || input.email);
  const slug = slugBase || `user-${userId.slice(0, 6)}`;
  await insertPerfilWithOptionalEquipe({
    usuario_id: userId,
    slug,
    nome_completo: input.nome_completo,
    role: input.role,
    equipe_id: input.equipe_id ?? null,
  });

  if (input.role === "cliente_gestao") {
    if (!input.equipe_id) throw new Error("cliente_gestao deve ter equipe_id (Gestão).");
    if (input.cliente_gestor_ids?.length) {
      const eg = await listEquipeGestorLinks();
      const allG = await listGestores();
      const allowed = new Set(gestoresNaEquipe(input.equipe_id, allG, eg).map((g) => g.usuario_id));
      for (const gid of input.cliente_gestor_ids) {
        if (!allowed.has(gid)) throw new Error("Carteira: cada gestor tem de pertencer à equipe do cliente.");
      }
    }
    if (input.cliente_cs_ids?.length) {
      const ec = await listEquipeCsLinks();
      const allC = await listCsPerfis();
      const allowedCs = new Set(csNaEquipe(input.equipe_id, ec, allC).map((c) => c.usuario_id));
      for (const cid of input.cliente_cs_ids) {
        if (!allowedCs.has(cid)) throw new Error("Carteira: cada CS tem de pertencer à equipe do cliente.");
      }
    }
  }

  if (input.role === "gestor" && input.equipe_id) await replaceEquipeGestoresForGestor(userId, input.equipe_id);
  if (input.role === "cs" && input.equipe_id) await replaceEquipeCsForCs(userId, input.equipe_id);
  if (input.role === "cliente_gestao" && input.cliente_gestor_ids?.length) {
    await setGestoresForClient({ clienteId: userId, gestorIds: input.cliente_gestor_ids });
  }
  if (input.role === "cliente_gestao" && input.cliente_cs_ids?.length) {
    await setCsForClient({ clienteId: userId, csIds: input.cliente_cs_ids });
  }

  await logAcao({
    tipoAcao: "user created",
    entidadeAfetada: "user",
    entidadeId: userId,
    details: { email: input.email, role: input.role },
  });
  return userId;
}

export async function updateUser(input: {
  usuario_id: string;
  nome_completo: string;
  role: Perfil["role"];
  equipe_id: string | null;
  previousRole?: Perfil["role"] | null;
  cliente_gestor_ids?: string[] | null;
  cliente_cs_ids?: string[] | null;
}): Promise<void> {
  const roleNorm = String(input.role ?? "")
    .trim()
    .toLowerCase();
  const prevNorm = String(input.previousRole ?? "")
    .trim()
    .toLowerCase();
  if (roleNorm === "admin_master" && prevNorm !== "admin_master") {
    throw new Error("O role admin_master não pode ser atribuído pelo painel; altere apenas na base de dados.");
  }
  if (input.role === "gestor" && !input.equipe_id) {
    throw new Error("Gestor tem de ter equipe_id (uma Gestão).");
  }
  if (input.role === "cs" && !input.equipe_id) {
    throw new Error("CS tem de ter equipe_id (uma Gestão).");
  }
  if (input.role === "admin_equipe" && !input.equipe_id?.trim()) {
    throw new Error("Admin da equipe (admin_equipe) tem de ter equipe_id (Gestão).");
  }
  if (input.role === "cliente_gestao" && !input.equipe_id) {
    throw new Error("cliente_gestao deve ter equipe_id (Gestão).");
  }

  if (input.previousRole === "cliente_gestao" && input.role === "cliente") {
    await supabase.from("cliente_gestores").delete().eq("cliente_id", input.usuario_id);
    const r = await supabase.from("cliente_cs").delete().eq("cliente_id", input.usuario_id);
    if (r.error && !isMissingRelationError(r.error)) throw r.error;
  }

  const { error } = await supabase
    .from("perfis")
    .update({
      nome_completo: input.nome_completo,
      role: input.role,
      equipe_id: input.equipe_id,
    })
    .eq("usuario_id", input.usuario_id);
  if (error) throw error;

  const prev = input.previousRole ?? null;
  if (input.role === "gestor") await replaceEquipeGestoresForGestor(input.usuario_id, input.equipe_id);
  else if (prev === "gestor") await replaceEquipeGestoresForGestor(input.usuario_id, null);

  if (input.role === "cs") await replaceEquipeCsForCs(input.usuario_id, input.equipe_id);
  else if (prev === "cs") await replaceEquipeCsForCs(input.usuario_id, null);

  if (input.role === "cliente_gestao" && input.cliente_gestor_ids != null) {
    await setGestoresForClient({ clienteId: input.usuario_id, gestorIds: input.cliente_gestor_ids });
  }
  if (input.role === "cliente_gestao" && input.cliente_cs_ids != null) {
    await setCsForClient({ clienteId: input.usuario_id, csIds: input.cliente_cs_ids });
  }

  await logAcao({
    tipoAcao: "role changed",
    entidadeAfetada: "user",
    entidadeId: input.usuario_id,
    details: { role: input.role },
  });
}

export async function deleteUser(usuarioId: string): Promise<void> {
  type Del = Promise<{ error: { message?: string; code?: string } | null }>;
  const safe = async (p: Del) => {
    try {
      const r = await p;
      if (r.error && !isMissingRelationError(r.error)) throw r.error;
    } catch {
      /* noop */
    }
  };
  await safe(supabase.from("cliente_gestores").delete().eq("cliente_id", usuarioId) as unknown as Del);
  await safe(supabase.from("cliente_gestores").delete().eq("gestor_id", usuarioId) as unknown as Del);
  await safe(supabase.from("cliente_cs").delete().eq("cliente_id", usuarioId) as unknown as Del);
  await safe(supabase.from("cliente_cs").delete().eq("cs_id", usuarioId) as unknown as Del);
  await safe(supabase.from("equipe_cs").delete().eq("cs_id", usuarioId) as unknown as Del);
  await safe(supabase.from("equipe_gestores").delete().eq("gestor_id", usuarioId) as unknown as Del);

  const { error } = await supabase.from("perfis").delete().eq("usuario_id", usuarioId);
  if (error) throw error;
  await logAcao({
    tipoAcao: "role changed",
    entidadeAfetada: "user",
    entidadeId: usuarioId,
    details: { deleted: true },
  });
}

export async function moveClientToEquipe(params: { clienteId: string; equipeId: string }): Promise<void> {
  const delG = await supabase.from("cliente_gestores").delete().eq("cliente_id", params.clienteId);
  if (delG.error && !isMissingRelationError(delG.error)) throw delG.error;
  const delC = await supabase.from("cliente_cs").delete().eq("cliente_id", params.clienteId);
  if (delC.error && !isMissingRelationError(delC.error)) throw delC.error;

  const { error } = await supabase
    .from("perfis")
    .update({ equipe_id: params.equipeId, role: "cliente_gestao" })
    .eq("usuario_id", params.clienteId);
  if (error) throw error;
}
