import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import { useAccessScope } from "@/hooks/useAccessScope";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { canAccessSecurityDashboard } from "@/lib/accessScope";
import {
  adminSecurityForceSignoutUser,
  countLogsAcoesSince,
  deleteAdminEmailLockout,
  formatSupabaseError,
  getAdminSecuritySettings,
  listAdminEmailLockouts,
  listAdminFailedLogins,
  listAdminLoginHistory,
  listAdminSessionActivityRecent,
  listAuditLogs,
  listPerfis,
  updateAdminSecuritySettings,
  type AdminEmailLockoutRow,
  type AdminFailedLoginRow,
  type AdminLoginHistoryRow,
  type AdminSecuritySettingsRow,
  type AdminSessionActivityRow,
  type LogAcaoRow,
  type Perfil,
} from "@/lib/adminApi";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const LS_EXTRA = "gm-admin-sec-extra";
const LS_MANUAL_IP = "gm-admin-sec-manual-ip-blocks";
const LS_WHITELIST = "gm-admin-sec-ip-whitelist";

type ExtraConfig = { notif_admin: boolean; twofa_obrigatorio: boolean };
type ManualIpBlock = {
  id: string;
  ip: string;
  motivo: "forca_bruta" | "manual" | "suspeito";
  bloqueado_em: string;
  expira_em: string | null;
  bloqueado_por: string;
};

type SecTab = "sessions" | "history" | "failed" | "blocks" | "perms" | "audit";

function readExtra(): ExtraConfig {
  try {
    const raw = localStorage.getItem(LS_EXTRA);
    if (!raw) return { notif_admin: true, twofa_obrigatorio: false };
    const j = JSON.parse(raw) as Partial<ExtraConfig>;
    return {
      notif_admin: typeof j.notif_admin === "boolean" ? j.notif_admin : true,
      twofa_obrigatorio: typeof j.twofa_obrigatorio === "boolean" ? j.twofa_obrigatorio : false,
    };
  } catch {
    return { notif_admin: true, twofa_obrigatorio: false };
  }
}

function writeExtra(e: ExtraConfig): void {
  localStorage.setItem(LS_EXTRA, JSON.stringify(e));
}

function readManualBlocks(): ManualIpBlock[] {
  try {
    const raw = localStorage.getItem(LS_MANUAL_IP);
    if (!raw) return [];
    const j = JSON.parse(raw) as ManualIpBlock[];
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

function writeManualBlocks(rows: ManualIpBlock[]): void {
  localStorage.setItem(LS_MANUAL_IP, JSON.stringify(rows));
}

function readWhitelist(): string[] {
  try {
    const raw = localStorage.getItem(LS_WHITELIST);
    if (!raw) return [];
    const j = JSON.parse(raw) as string[];
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

function writeWhitelist(ips: string[]): void {
  localStorage.setItem(LS_WHITELIST, JSON.stringify(ips));
}

function parseTs(s: string | null): number {
  if (!s) return 0;
  const t = Date.parse(s);
  return Number.isNaN(t) ? 0 : t;
}

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function isLockoutActive(lo: AdminEmailLockoutRow): boolean {
  return parseTs(lo.locked_until) > Date.now();
}

function initials(name: string | null | undefined, email: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (n.length >= 2) return (n[0] + n[n.length - 1]).toUpperCase();
  const e = (email ?? "").trim();
  if (e.length >= 2) return e.slice(0, 2).toUpperCase();
  return "?";
}

function roleLabel(role: string): string {
  const m: Record<string, string> = {
    admin: "Admin Master",
    admin_master: "Admin Master",
    admin_equipe: "Admin Equipe",
    gestor: "Gestor",
    cs: "CS",
    cliente: "Cliente",
    cliente_gestao: "Cliente gestão",
  };
  return m[role] ?? role;
}

function browserLabel(ua: string | null | undefined): string {
  if (!ua) return "—";
  if (/Edg\//.test(ua)) return "Edge";
  if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua) && !/Chrome/.test(ua)) return "Safari";
  return "Browser";
}

function deviceIconLabel(device: string | null | undefined, ua: string | null | undefined): { label: string; mobile: boolean } {
  const d = (device ?? "").toLowerCase();
  if (d.includes("mobile") || /Mobile|Android|iPhone/i.test(ua ?? "")) return { label: "Mobile", mobile: true };
  if (d.includes("tablet") || /iPad/i.test(ua ?? "")) return { label: "Tablet", mobile: true };
  return { label: d ? device! : "Desktop", mobile: false };
}

function relActivity(iso: string | null, now = Date.now()): string {
  if (!iso) return "—";
  const t = parseTs(iso);
  const diffMin = Math.floor((now - t) / 60_000);
  if (diffMin < 2) return "Agora";
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH} h`;
  return new Date(iso).toLocaleString("pt-BR");
}

function auditCategory(row: LogAcaoRow): "login" | "edicao" | "exclusao" | "conversao" | "config" | "outro" {
  const t = (row.tipo_acao ?? "").toLowerCase();
  const e = (row.entidade_afetada ?? "").toLowerCase();
  if (t.includes("login") || t.includes("auth") || t.includes("sessão")) return "login";
  if (t.includes("delete") || t.includes("exclu") || t.includes("remove")) return "exclusao";
  if (t.includes("convert") || e.includes("b2c")) return "conversao";
  if (t.includes("config") || e.includes("config")) return "config";
  if (t.includes("update") || t.includes("edit") || t.includes("alter")) return "edicao";
  return "outro";
}

function formatAuditWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const t = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (sameDay(d, now)) return `Hoje, ${t}`;
  if (sameDay(d, yesterday)) return `Ontem, ${t}`;
  return d.toLocaleString("pt-BR");
}

function downloadCsv(filename: string, rows: string[][]): void {
  const bom = "\uFEFF";
  const esc = (c: string) => `"${String(c).replace(/"/g, '""')}"`;
  const line = rows.map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob([bom + line], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

const PERM_ROWS: { name: string; cells: ("ok" | "partial" | "no")[] }[] = [
  { name: "Dashboard Admin", cells: ["ok", "no", "no", "no", "no"] },
  { name: "Gerenciar equipes", cells: ["ok", "partial", "no", "no", "no"] },
  { name: "Gerenciar usuários", cells: ["ok", "partial", "no", "no", "no"] },
  { name: "CRM Milhas", cells: ["ok", "ok", "ok", "partial", "no"] },
  { name: "Emitir / criar emissões", cells: ["ok", "ok", "ok", "no", "no"] },
  { name: "Assinaturas / financeiro", cells: ["ok", "no", "no", "no", "no"] },
  { name: "Segurança", cells: ["ok", "no", "no", "no", "no"] },
  { name: "Configurações", cells: ["ok", "partial", "no", "no", "no"] },
  { name: "Leads / Kanban", cells: ["ok", "ok", "ok", "partial", "no"] },
  { name: "Reuniões", cells: ["ok", "ok", "ok", "partial", "no"] },
];

function permCell(c: "ok" | "partial" | "no"): ReactNode {
  if (c === "ok") return <span className="gm-sec-perm-check">✓</span>;
  if (c === "partial")
    return (
      <span className="gm-sec-perm-warn" title="Acesso parcial">
        ▲
      </span>
    );
  return <span className="gm-sec-perm-x">—</span>;
}

export default function AdminSegurancaPage() {
  const gid = useId().replace(/:/g, "");
  const { scope } = useAccessScope();
  const { user, signOut, perfilNome, role } = useAdminAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AdminLoginHistoryRow[]>([]);
  const [failed, setFailed] = useState<AdminFailedLoginRow[]>([]);
  const [sessions, setSessions] = useState<AdminSessionActivityRow[]>([]);
  const [lockouts, setLockouts] = useState<AdminEmailLockoutRow[]>([]);
  const [settings, setSettings] = useState<AdminSecuritySettingsRow | null>(null);
  const [auditLogs, setAuditLogs] = useState<LogAcaoRow[]>([]);
  const [auditCount7d, setAuditCount7d] = useState(0);
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [lastCheckAt, setLastCheckAt] = useState<string | null>(null);

  const [tab, setTab] = useState<SecTab>("sessions");
  const [extra, setExtra] = useState<ExtraConfig>(() => readExtra());
  const [manualBlocks, setManualBlocks] = useState<ManualIpBlock[]>(() => readManualBlocks());
  const [whitelist, setWhitelist] = useState<string[]>(() => readWhitelist());

  const [form, setForm] = useState({ max_failed: "5", lockout_min: "15", window_min: "15" });
  const [draftExtra, setDraftExtra] = useState<ExtraConfig>(() => readExtra());
  const [savingSettings, setSavingSettings] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);

  const [mfaSelf, setMfaSelf] = useState<boolean | null>(null);

  const [histUser, setHistUser] = useState<string>("__all__");
  const [histFrom, setHistFrom] = useState("");
  const [histTo, setHistTo] = useState("");

  const [auditFilt, setAuditFilt] = useState<string>("__all__");

  const [newBlockIp, setNewBlockIp] = useState("");
  const [newBlockMotivo, setNewBlockMotivo] = useState<ManualIpBlock["motivo"]>("manual");
  const [wlInput, setWlInput] = useState("");

  const corsOk = Boolean(import.meta.env.VITE_ADMIN_EXTERNAL_HEALTH_URLS?.trim());

  const perfilByUser = useMemo(() => {
    const m = new Map<string, Perfil>();
    for (const p of perfis) m.set(p.usuario_id, p);
    return m;
  }, [perfis]);

  const adminPerfis = useMemo(
    () => perfis.filter((p) => p.role === "admin" || p.role === "admin_equipe" || p.role === "admin_master"),
    [perfis],
  );

  const score = useMemo(() => {
    let s = 100;
    if (!draftExtra.twofa_obrigatorio) s -= 6;
    if (!corsOk) s -= 6;
    return Math.max(0, Math.min(100, s));
  }, [draftExtra.twofa_obrigatorio, corsOk]);

  const scoreTier = score >= 80 ? "ok" : score >= 60 ? "mid" : "bad";

  const ringGradId = `gmSecScoreGrad-${gid}`;
  const ringColor =
    scoreTier === "ok"
      ? { a: "#4ADE80", b: "#22C55E" }
      : scoreTier === "mid"
        ? { a: "#FBBF24", b: "#D97706" }
        : { a: "#F87171", b: "#DC2626" };

  const strokeDashoffset = 220 * (1 - score / 100);

  const failedToday = useMemo(() => {
    const t0 = startOfTodayMs();
    return failed.filter((f) => parseTs(f.created_at) >= t0).length;
  }, [failed]);

  const activeLockouts = useMemo(() => lockouts.filter(isLockoutActive), [lockouts]);

  const blockedKpi = manualBlocks.length + activeLockouts.length;

  const ipFailCounts24h = useMemo(() => {
    const since = Date.now() - 24 * 3600_000;
    const m = new Map<string, number>();
    for (const f of failed) {
      if (parseTs(f.created_at) < since) continue;
      const ip = (f.ip ?? "").trim() || "_";
      m.set(ip, (m.get(ip) ?? 0) + 1);
    }
    return m;
  }, [failed]);

  const lastIncidentLabel = useMemo(() => {
    const since = Date.now() - 7 * 86400_000;
    let maxT = 0;
    for (const f of failed) {
      const t = parseTs(f.created_at);
      if (t > since && t > maxT) maxT = t;
    }
    if (maxT === 0) return { text: "Nenhum registrado", ok: true as const };
    return { text: new Date(maxT).toLocaleString("pt-BR"), ok: false as const };
  }, [failed]);

  const filteredHistory = useMemo(() => {
    let h = history;
    if (histUser !== "__all__") h = h.filter((r) => r.usuario_id === histUser);
    if (histFrom.trim()) {
      const t = parseTs(`${histFrom}T00:00:00`);
      h = h.filter((r) => parseTs(r.created_at) >= t);
    }
    if (histTo.trim()) {
      const t = parseTs(`${histTo}T23:59:59`);
      h = h.filter((r) => parseTs(r.created_at) <= t);
    }
    return h;
  }, [history, histUser, histFrom, histTo]);

  const filteredAudit = useMemo(() => {
    if (auditFilt === "__all__") return auditLogs;
    return auditLogs.filter((r) => {
      const c = auditCategory(r);
      if (auditFilt === "login") return c === "login";
      if (auditFilt === "edicao") return c === "edicao" || c === "outro";
      if (auditFilt === "exclusao") return c === "exclusao";
      if (auditFilt === "conversao") return c === "conversao";
      if (auditFilt === "config") return c === "config";
      return true;
    });
  }, [auditLogs, auditFilt]);

  const headline =
    score >= 80 ? "Boa — Sistema protegido" : score >= 60 ? "Atenção — revise pontos de segurança" : "Crítico — ação recomendada";

  useEffect(() => {
    void supabase.auth.mfa.listFactors().then(({ data }) => {
      const n = data?.all?.filter((f) => f.status === "verified").length ?? 0;
      setMfaSelf(n > 0);
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const since7d = new Date(Date.now() - 7 * 86400_000).toISOString();
    try {
      const [h, f, s, l, st, aud, n7, pf] = await Promise.all([
        listAdminLoginHistory(400),
        listAdminFailedLogins(400),
        listAdminSessionActivityRecent(45),
        listAdminEmailLockouts(),
        getAdminSecuritySettings(),
        listAuditLogs(200),
        countLogsAcoesSince(since7d),
        listPerfis(),
      ]);
      setHistory(h);
      setFailed(f);
      setSessions(s);
      setLockouts(l);
      setSettings(st);
      setAuditLogs(aud);
      setAuditCount7d(n7);
      setPerfis(pf);
      setLastCheckAt(new Date().toISOString());
      const ex = readExtra();
      setExtra(ex);
      setDraftExtra(ex);
      setManualBlocks(readManualBlocks());
      setWhitelist(readWhitelist());
      if (st) {
        setForm({
          max_failed: String(st.max_failed_attempts),
          lockout_min: String(st.lockout_minutes),
          window_min: String(st.failure_window_minutes),
        });
      }
    } catch (e) {
      setError(formatSupabaseError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const exportAuditCsv = useCallback(() => {
    const rows: string[][] = [
      ["id", "created_at", "tipo_acao", "entidade_afetada", "entidade_id", "user_id", "details"],
      ...filteredAudit.map((r) => [
        r.id,
        r.created_at ?? "",
        r.tipo_acao ?? "",
        r.entidade_afetada ?? "",
        r.entidade_id ?? "",
        r.user_id ?? "",
        r.details ? JSON.stringify(r.details) : "",
      ]),
    ];
    downloadCsv(`auditoria-admin-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    toast.success("CSV exportado.");
  }, [filteredAudit]);

  const saveSettings = async () => {
    setSavingSettings(true);
    setError(null);
    try {
      await updateAdminSecuritySettings({
        max_failed_attempts: Math.max(1, Math.min(50, Number(form.max_failed) || 5)),
        lockout_minutes: Math.max(1, Math.min(1440, Number(form.lockout_min) || 15)),
        failure_window_minutes: Math.max(1, Math.min(240, Number(form.window_min) || 15)),
      });
      writeExtra(draftExtra);
      setExtra({ ...draftExtra });
      toast.success("Configurações guardadas.");
      await load();
    } catch (e) {
      setError(formatSupabaseError(e));
      toast.error(formatSupabaseError(e));
    } finally {
      setSavingSettings(false);
    }
  };

  const cancelDraft = () => {
    if (settings) {
      setForm({
        max_failed: String(settings.max_failed_attempts),
        lockout_min: String(settings.lockout_minutes),
        window_min: String(settings.failure_window_minutes),
      });
    }
    setDraftExtra({ ...extra });
  };

  const forceSignoutOthers = async () => {
    const others = sessions.filter((x) => x.usuario_id !== user?.id);
    if (others.length === 0) {
      toast.message("Não há outras sessões recentes.");
      return;
    }
    setBusyAll(true);
    setError(null);
    try {
      for (const o of others) {
        await adminSecurityForceSignoutUser(o.usuario_id);
      }
      toast.success("Sessões encerradas.");
      await load();
    } catch (e) {
      setError(formatSupabaseError(e));
      toast.error(formatSupabaseError(e));
    } finally {
      setBusyAll(false);
    }
  };

  const addManualBlock = () => {
    const ip = newBlockIp.trim();
    if (!IP_RE.test(ip)) {
      toast.error("IP inválido.");
      return;
    }
    if (manualBlocks.some((b) => b.ip === ip)) {
      toast.error("Este IP já está bloqueado.");
      return;
    }
    const row: ManualIpBlock = {
      id: `mb-${Date.now()}`,
      ip,
      motivo: newBlockMotivo,
      bloqueado_em: new Date().toISOString(),
      expira_em: null,
      bloqueado_por: perfilNome ?? user?.email ?? "admin",
    };
    const next = [row, ...manualBlocks];
    setManualBlocks(next);
    writeManualBlocks(next);
    setNewBlockIp("");
    toast.success("IP bloqueado (armazenamento local).");
  };

  const removeManualBlock = (id: string) => {
    const next = manualBlocks.filter((b) => b.id !== id);
    setManualBlocks(next);
    writeManualBlocks(next);
  };

  const addWhitelist = () => {
    const ip = wlInput.trim();
    if (!IP_RE.test(ip)) {
      toast.error("IP inválido.");
      return;
    }
    if (whitelist.includes(ip)) {
      toast.error("Já na lista.");
      return;
    }
    const next = [...whitelist, ip];
    setWhitelist(next);
    writeWhitelist(next);
    setWlInput("");
    toast.success("IP adicionado à whitelist.");
  };

  const headlineChips = (
    <div className="gm-sec-hero-chips">
      <span className="gm-sec-chip ok">✓ Brute force ativo</span>
      <span className="gm-sec-chip ok">✓ Sessões monitoradas</span>
      {!corsOk ? <span className="gm-sec-chip warn">⚠ APIs externas sem CORS</span> : null}
      {!draftExtra.twofa_obrigatorio ? <span className="gm-sec-chip warn">⚠ 2FA não obrigatório</span> : null}
    </div>
  );

  const adminsSem2faCount = mfaSelf === false ? adminPerfis.length : Math.max(0, adminPerfis.length - 1);

  if (!canAccessSecurityDashboard(scope)) {
    return <Navigate to="/dashboard" replace />;
  }

  const displayName = perfilNome ?? user?.email ?? "Administrador";
  const displayRole = roleLabel(role ?? "admin");

  return (
    <div className="gm-sec-page">
      <div className="gm-sec-hdr">
        <div>
          <div className="gm-sec-title">Segurança</div>
          <div className="gm-sec-sub">Acesso, sessões, bloqueios, permissões e auditoria do sistema</div>
        </div>
        <div className="gm-sec-hdr-actions">
          <button type="button" className="btn-outline gm-sec-btn-sm" onClick={() => exportAuditCsv()}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M2 9.5V11h1.5L11 3.5 9.5 2 2 9.5Z" />
            </svg>
            Exportar auditoria
          </button>
          <button type="button" className="btn-primary gm-sec-btn-sm" onClick={() => void load()} disabled={loading}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round">
              <path d="M2 7a5 5 0 0 1 9-2.2M11 6a5 5 0 0 1-9 2.2" />
              <polyline points="9,1 11,3 9,5" />
            </svg>
            Atualizar
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {/* Hero */}
      <div className="gm-sec-hero">
        {loading && !lastCheckAt ? (
          <Skeleton className="h-[90px] w-full max-w-[520px] rounded-lg bg-white/10" />
        ) : (
          <>
            <div className="gm-sec-score-ring">
              <svg width="90" height="90" viewBox="0 0 90 90" aria-hidden>
                <circle cx="45" cy="45" r="38" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="7" />
                <circle
                  cx="45"
                  cy="45"
                  r="38"
                  fill="none"
                  stroke={`url(#${ringGradId})`}
                  strokeWidth="7"
                  strokeDasharray="220"
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  transform="rotate(-90 45 45)"
                />
                <defs>
                  <linearGradient id={ringGradId} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={ringColor.a} />
                    <stop offset="100%" stopColor={ringColor.b} />
                  </linearGradient>
                </defs>
              </svg>
              <div className="gm-sec-score-num">
                <div className="val">{score}</div>
                <div className="lbl">/ 100</div>
              </div>
            </div>
            <div className="gm-sec-hero-mid">
              <div className="gm-sec-hero-label">Score de segurança</div>
              <div className="gm-sec-hero-headline">{headline}</div>
              {headlineChips}
            </div>
            <div className="gm-sec-hero-aside">
              <div>
                <div className="k">Última verificação</div>
                <div className="v">{lastCheckAt ? new Date(lastCheckAt).toLocaleString("pt-BR") : "—"}</div>
              </div>
              <div>
                <div className="k">Último incidente</div>
                <div className="v" style={{ color: lastIncidentLabel.ok ? "#4ADE80" : "#FCA5A5", fontFamily: "inherit" }}>
                  {lastIncidentLabel.text}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* KPIs */}
      <div className="gm-sec-kpi4">
        <div className={cn("gm-sec-kpi", "gr")}>
          <div className="kl">Sessões ativas</div>
          <div className="kv">{sessions.length}</div>
          <div className="ks">últimos 45 min</div>
        </div>
        <div className={cn("gm-sec-kpi", failedToday > 0 ? "re" : "gr")}>
          <div className="kl">Falhas de login hoje</div>
          <div className="kv" style={failedToday > 0 ? { color: "var(--err)" } : { color: "var(--ok)" }}>
            {failedToday}
          </div>
          <div className="ks">tentativas inválidas</div>
        </div>
        <div className={cn("gm-sec-kpi", blockedKpi > 0 ? "am" : "gr")}>
          <div className="kl">Bloqueios ativos</div>
          <div className="kv" style={blockedKpi > 0 ? { color: "var(--warn)" } : undefined}>
            {blockedKpi}
          </div>
          <div className="ks">IPs manuais + e-mails em lockout</div>
        </div>
        <div className={cn("gm-sec-kpi", "pu")}>
          <div className="kl">Ações auditadas (7d)</div>
          <div className="kv">{auditCount7d}</div>
          <div className="ks">eventos em logs_acoes</div>
        </div>
      </div>

      {/* Tabs card */}
      <div className="gm-sec-card">
        <div className="gm-sec-tabs">
          <button
            type="button"
            className={cn("gm-sec-tab", tab === "sessions" && "active")}
            onClick={() => setTab("sessions")}
          >
            Sessões ativas <span className="gm-sec-tab-cnt ok">{sessions.length}</span>
          </button>
          <button type="button" className={cn("gm-sec-tab", tab === "history" && "active")} onClick={() => setTab("history")}>
            Histórico de logins
          </button>
          <button type="button" className={cn("gm-sec-tab", tab === "failed" && "active")} onClick={() => setTab("failed")}>
            Tentativas falhadas{" "}
            <span className={cn("gm-sec-tab-cnt", failed.length > 0 ? "" : "neutral")}>{failed.length}</span>
          </button>
          <button type="button" className={cn("gm-sec-tab", tab === "blocks" && "active")} onClick={() => setTab("blocks")}>
            Bloqueios
          </button>
          <button type="button" className={cn("gm-sec-tab", tab === "perms" && "active")} onClick={() => setTab("perms")}>
            Permissões
          </button>
          <button type="button" className={cn("gm-sec-tab", tab === "audit" && "active")} onClick={() => setTab("audit")}>
            Auditoria <span className="gm-sec-tab-cnt warn">{auditCount7d}</span>
          </button>
        </div>

        {tab === "sessions" ? (
          <>
            <div className="gm-sec-session-banner">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#16A34A",
                    boxShadow: "0 0 6px rgba(22,163,74,0.5)",
                  }}
                />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--p)" }}>
                  Sessão atual — {displayName} ({displayRole})
                </span>
              </div>
              <button type="button" className="btn-ok" onClick={() => void signOut()}>
                Encerrar minha sessão
              </button>
            </div>
            <div className="gm-sec-table-wrap">
              <table className="gm-sec-table">
                <thead>
                  <tr>
                    <th>Usuário</th>
                    <th>Dispositivo</th>
                    <th>Navegador</th>
                    <th>IP</th>
                    <th>Localização</th>
                    <th>Última atividade</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8}>
                        <Skeleton className="m-3 h-10 w-full" />
                      </td>
                    </tr>
                  ) : sessions.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ color: "var(--t3)" }}>
                        Nenhuma sessão recente registada.
                      </td>
                    </tr>
                  ) : (
                    sessions.map((s) => {
                      const pf = perfilByUser.get(s.usuario_id);
                      const nome = pf?.nome_completo ?? s.email ?? s.usuario_id.slice(0, 8);
                      const { label: devLabel, mobile } = deviceIconLabel(s.device, null);
                      const isMe = s.usuario_id === user?.id;
                      return (
                        <tr key={s.usuario_id} className={cn(isMe && "gm-sec-row-me")}>
                          <td>
                            <div className="gm-sec-u-cell">
                              <div
                                className="gm-sec-u-av"
                                style={{ background: "linear-gradient(135deg,#6A00A3,#B56CFF)" }}
                              >
                                {initials(pf?.nome_completo, s.email)}
                              </div>
                              <div>
                                <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--t1)" }}>{nome}</div>
                                <div style={{ fontSize: 11, color: "var(--t3)" }}>{s.email ?? "—"}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span style={{ fontSize: 12, color: "var(--t2)" }}>
                              {mobile ? "📱 " : "🖥 "}
                              {devLabel}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: 12, color: "var(--t2)" }}>—</span>
                          </td>
                          <td>
                            <code style={{ fontSize: 11, fontFamily: "monospace", color: "var(--t2)" }}>
                              {s.ip?.trim() ? s.ip : "—"}
                            </code>
                          </td>
                          <td>
                            <span style={{ fontSize: 12 }}>—</span>
                          </td>
                          <td>
                            <span style={{ fontSize: 12, color: "var(--ok)", fontWeight: 600 }}>{relActivity(s.last_seen_at)}</span>
                          </td>
                          <td>
                            {isMe ? <span className="gm-sec-badge b-pu">Você</span> : <span className="gm-sec-badge b-ok">Ativo</span>}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            {isMe ? (
                              <span style={{ fontSize: 11, color: "var(--t3)", fontStyle: "italic" }}>Sessão atual</span>
                            ) : (
                              <button
                                type="button"
                                className="btn-ok"
                                disabled={busyUserId === s.usuario_id}
                                onClick={async () => {
                                  setBusyUserId(s.usuario_id);
                                  setError(null);
                                  try {
                                    await adminSecurityForceSignoutUser(s.usuario_id);
                                    toast.success("Sessão encerrada.");
                                    await load();
                                  } catch (e) {
                                    setError(formatSupabaseError(e));
                                    toast.error(formatSupabaseError(e));
                                  } finally {
                                    setBusyUserId(null);
                                  }
                                }}
                              >
                                {busyUserId === s.usuario_id ? "…" : "Encerrar"}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="gm-sec-table-foot">
              <span className="gm-sec-foot-note">Sessões ativas nos últimos 45 minutos · atualização periódica no painel</span>
              <button type="button" className="btn-ok" disabled={busyAll} onClick={() => void forceSignoutOthers()}>
                {busyAll ? "…" : "Encerrar todas as outras sessões"}
              </button>
            </div>
          </>
        ) : null}

        {tab === "history" ? (
          <div style={{ padding: "12px 16px 0" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
              <select
                className="gm-sec-audit-filt"
                value={histUser}
                onChange={(e) => setHistUser(e.target.value)}
                aria-label="Filtrar por utilizador"
              >
                <option value="__all__">Todos os usuários</option>
                {Array.from(new Set(history.map((h) => h.usuario_id))).map((uid) => (
                  <option key={uid} value={uid}>
                    {perfilByUser.get(uid)?.nome_completo ?? uid.slice(0, 8)}
                  </option>
                ))}
              </select>
              <input
                type="date"
                className="gm-sec-audit-filt"
                value={histFrom}
                onChange={(e) => setHistFrom(e.target.value)}
                aria-label="De"
              />
              <input
                type="date"
                className="gm-sec-audit-filt"
                value={histTo}
                onChange={(e) => setHistTo(e.target.value)}
                aria-label="Até"
              />
            </div>
            <div className="gm-sec-table-wrap">
              <table className="gm-sec-table">
                <thead>
                  <tr>
                    <th>Usuário</th>
                    <th>IP</th>
                    <th>Dispositivo</th>
                    <th>Navegador</th>
                    <th>Data/hora</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6}>
                        <Skeleton className="m-3 h-10 w-full" />
                      </td>
                    </tr>
                  ) : filteredHistory.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ color: "var(--t3)" }}>
                        Sem registos.
                      </td>
                    </tr>
                  ) : (
                    filteredHistory.map((r) => {
                      const pf = perfilByUser.get(r.usuario_id);
                      return (
                        <tr key={r.id}>
                          <td>{pf?.nome_completo ?? r.email ?? r.usuario_id.slice(0, 8)}</td>
                          <td>
                            <code style={{ fontSize: 11, fontFamily: "monospace" }}>{r.ip?.trim() ? r.ip : "—"}</code>
                          </td>
                          <td>{r.device ?? "—"}</td>
                          <td style={{ color: "var(--t2)", fontSize: 12 }}>{browserLabel(r.user_agent)}</td>
                          <td>{r.created_at ? new Date(r.created_at).toLocaleString("pt-BR") : "—"}</td>
                          <td>
                            <span className="gm-sec-badge b-ok">Sucesso</span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {tab === "failed" ? (
          <>
            <div className="gm-sec-table-wrap">
              <table className="gm-sec-table">
                <thead>
                  <tr>
                    <th>E-mail tentado</th>
                    <th>IP</th>
                    <th>Dispositivo</th>
                    <th>Motivo</th>
                    <th>Data/hora</th>
                    <th>Falhas IP (24h)</th>
                    <th style={{ textAlign: "right" }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7}>
                        <Skeleton className="m-3 h-10 w-full" />
                      </td>
                    </tr>
                  ) : failed.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ color: "var(--t3)" }}>
                        Sem falhas registadas.
                      </td>
                    </tr>
                  ) : (
                    failed.map((r) => {
                      const ip = (r.ip ?? "").trim() || "_";
                      const n = ipFailCounts24h.get(ip) ?? 0;
                      return (
                        <tr key={r.id}>
                          <td style={{ fontFamily: "monospace" }}>{r.email_norm}</td>
                          <td>
                            <code style={{ fontSize: 11 }}>{r.ip?.trim() ? r.ip : "—"}</code>
                          </td>
                          <td>{r.device ?? "—"}</td>
                          <td>
                            <span className="gm-sec-badge b-warn">Senha incorreta</span>
                          </td>
                          <td>{r.created_at ? new Date(r.created_at).toLocaleString("pt-BR") : "—"}</td>
                          <td>
                            {n >= 3 ? <span className="gm-sec-tab-cnt">{n}</span> : <span style={{ color: "var(--t3)" }}>{n}</span>}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <button
                              type="button"
                              className="btn-sm-o"
                              style={{ fontSize: 11, borderColor: "var(--warn-bd)", color: "var(--warn)", background: "var(--warn-bg)" }}
                              onClick={() => {
                                const ipOnly = r.ip?.trim();
                                if (!ipOnly) {
                                  toast.error("IP ausente neste registo.");
                                  return;
                                }
                                setNewBlockIp(ipOnly);
                                setNewBlockMotivo("manual");
                                setTab("blocks");
                                toast.message("Preencha e confirme o bloqueio manual na aba Bloqueios.");
                              }}
                            >
                              Bloquear IP
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="gm-sec-table-foot">
              <span className="gm-sec-foot-note">
                Após várias falhas na janela configurada, o e-mail entra em lockout (ver proteção por força bruta).
              </span>
            </div>
          </>
        ) : null}

        {tab === "blocks" ? (
          <div style={{ padding: 16 }}>
            <div className="gm-sec-card-h" style={{ border: "1px solid var(--bd)", borderRadius: 12, marginBottom: 12 }}>
              <div className="gm-sec-card-ti">
                <span className="gm-sec-card-ic" style={{ background: "var(--ok-bg)", border: "1px solid var(--ok-bd)" }} />
                IPs bloqueados manualmente
              </div>
            </div>
            <div className="gm-sec-table-wrap">
              <table className="gm-sec-table">
                <thead>
                  <tr>
                    <th>IP</th>
                    <th>Motivo</th>
                    <th>Bloqueado em</th>
                    <th>Expira</th>
                    <th>Por</th>
                    <th style={{ textAlign: "right" }}>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {manualBlocks.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <div className="gm-sec-empty">
                          <div className="gm-sec-empty-ic">
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round">
                              <polyline points="2,7 5.5,10.5 12,3" />
                            </svg>
                          </div>
                          <div className="gm-sec-empty-t">Nenhum IP bloqueado manualmente</div>
                          <div className="gm-sec-empty-s">Use o formulário abaixo ou “Bloquear IP” nas falhas.</div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    manualBlocks.map((b) => (
                      <tr key={b.id}>
                        <td>
                          <span className="gm-sec-ip-badge">{b.ip}</span>
                        </td>
                        <td>{b.motivo}</td>
                        <td>{new Date(b.bloqueado_em).toLocaleString("pt-BR")}</td>
                        <td>{b.expira_em ? new Date(b.expira_em).toLocaleString("pt-BR") : "Permanente"}</td>
                        <td>{b.bloqueado_por}</td>
                        <td style={{ textAlign: "right" }}>
                          <button type="button" className="btn-ok" onClick={() => removeManualBlock(b.id)}>
                            Remover
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12, alignItems: "center" }}>
              <input
                className="gm-sec-mini-in"
                style={{ width: 140 }}
                placeholder="192.168.0.1"
                value={newBlockIp}
                onChange={(e) => setNewBlockIp(e.target.value)}
                aria-label="Novo IP"
              />
              <select
                className="gm-sec-audit-filt"
                value={newBlockMotivo}
                onChange={(e) => setNewBlockMotivo(e.target.value as ManualIpBlock["motivo"])}
              >
                <option value="manual">Manual</option>
                <option value="forca_bruta">Força bruta</option>
                <option value="suspeito">Suspeito</option>
              </select>
              <button type="button" className="btn-sm-o" onClick={addManualBlock}>
                + Bloquear IP
              </button>
            </div>

            <div style={{ marginTop: 20 }}>
              <div className="gm-sec-cfg-label">Lockouts por e-mail (servidor)</div>
              <div className="gm-sec-cfg-sub" style={{ marginBottom: 8 }}>
                Desbloqueio remove o lockout atual na base de dados.
              </div>
              {activeLockouts.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--t3)" }}>Nenhum e-mail em lockout ativo.</p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {activeLockouts.map((lo) => (
                    <li key={lo.email_norm} className="gm-sec-ip-item" style={{ border: "1px solid var(--bd)", borderRadius: 8, marginBottom: 8 }}>
                      <span className="gm-sec-ip-badge">{lo.email_norm}</span>
                      <span style={{ fontSize: 12, color: "var(--t3)" }}>até {new Date(lo.locked_until).toLocaleString("pt-BR")}</span>
                      <button
                        type="button"
                        className="btn-ok"
                        style={{ marginLeft: "auto" }}
                        onClick={async () => {
                          try {
                            await deleteAdminEmailLockout(lo.email_norm);
                            toast.success("Lockout removido.");
                            await load();
                          } catch (e) {
                            toast.error(formatSupabaseError(e));
                          }
                        }}
                      >
                        Desbloquear
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div style={{ marginTop: 20 }}>
              <div className="gm-sec-cfg-label">Endereços IP confiáveis (whitelist)</div>
              <div className="gm-sec-cfg-sub" style={{ marginBottom: 8 }}>Armazenado localmente neste browser.</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <input
                  className="gm-sec-mini-in"
                  style={{ width: 140 }}
                  value={wlInput}
                  onChange={(e) => setWlInput(e.target.value)}
                  placeholder="IP"
                />
                <button type="button" className="btn-sm-o" onClick={addWhitelist}>
                  Adicionar
                </button>
              </div>
              {whitelist.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--t3)" }}>Lista vazia.</p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0 }}>
                  {whitelist.map((ip) => (
                    <li key={ip} className="gm-sec-ip-item">
                      <span className="gm-sec-ip-badge">{ip}</span>
                      <button type="button" className="btn-sm-o" onClick={() => {
                        const next = whitelist.filter((x) => x !== ip);
                        setWhitelist(next);
                        writeWhitelist(next);
                      }}>
                        Remover
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}

        {tab === "perms" ? (
          <div style={{ padding: "0 0 8px" }}>
            <div className="gm-sec-table-wrap">
              <table className="gm-sec-perm-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 140 }}>Funcionalidade</th>
                    <th>Admin Master</th>
                    <th>Admin Equipe</th>
                    <th>Gestor</th>
                    <th>CS</th>
                    <th>Cliente</th>
                  </tr>
                </thead>
                <tbody>
                  {PERM_ROWS.map((row) => (
                    <tr key={row.name}>
                      <td>{row.name}</td>
                      {row.cells.map((c, i) => (
                        <td key={i}>{permCell(c)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="gm-sec-perm-legend">
              <span>
                <span className="gm-sec-perm-check" style={{ fontSize: 12 }}>
                  ✓
                </span>{" "}
                Acesso total
              </span>
              <span>
                <span className="gm-sec-perm-warn">▲</span> Acesso parcial
              </span>
              <span>
                <span className="gm-sec-perm-x">—</span> Sem acesso
              </span>
            </div>
          </div>
        ) : null}

        {tab === "audit" ? (
          <>
            <div className="gm-sec-card-h">
              <div className="gm-sec-card-ti">Eventos recentes</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <select className="gm-sec-audit-filt" value={auditFilt} onChange={(e) => setAuditFilt(e.target.value)}>
                  <option value="__all__">Todos os tipos</option>
                  <option value="login">Login</option>
                  <option value="edicao">Edição</option>
                  <option value="exclusao">Exclusão</option>
                  <option value="conversao">Conversão</option>
                  <option value="config">Config</option>
                </select>
                <button type="button" className="gm-sec-link" onClick={() => exportAuditCsv()}>
                  Exportar CSV →
                </button>
              </div>
            </div>
            <div>
              {loading ? (
                <Skeleton className="m-4 h-24 w-full" />
              ) : filteredAudit.length === 0 ? (
                <div className="gm-sec-empty">
                  <div className="gm-sec-empty-s">Sem eventos de auditoria.</div>
                </div>
              ) : (
                filteredAudit.slice(0, 40).map((r) => {
                  const cat = auditCategory(r);
                  const ic =
                    cat === "login" ? (
                      <div className="gm-sec-audit-ic" style={{ background: "var(--ok-bg)" }}>
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round">
                          <circle cx="5.5" cy="5.5" r="4.5" />
                          <polyline points="2.5,5.5 4.5,7.5 8.5,3" />
                        </svg>
                      </div>
                    ) : cat === "exclusao" ? (
                      <div className="gm-sec-audit-ic" style={{ background: "var(--err-bg)" }}>
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round">
                          <line x1="2" y1="2" x2="9" y2="9" />
                          <line x1="9" y1="2" x2="2" y2="9" />
                        </svg>
                      </div>
                    ) : cat === "conversao" ? (
                      <div className="gm-sec-audit-ic" style={{ background: "var(--info-bg)" }}>
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round">
                          <circle cx="5.5" cy="4" r="2.5" />
                          <path d="M1 10c0-2.5 2-4 4.5-4S10 7.5 10 10" />
                        </svg>
                      </div>
                    ) : (
                      <div className="gm-sec-audit-ic" style={{ background: "var(--ps)", border: "1px solid var(--pb)" }}>
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="#8A05BE" strokeWidth="1.5" strokeLinecap="round">
                          <path d="M7 1.5L9 3.5 3.5 9H1.5V7L7 1.5Z" />
                        </svg>
                      </div>
                    );
                  const title = [r.tipo_acao, r.entidade_afetada].filter(Boolean).join(" · ") || "Evento";
                  return (
                    <div key={r.id} className="gm-sec-audit-row">
                      {ic}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="gm-sec-audit-action">{title}</div>
                        <div className="gm-sec-audit-meta">
                          {r.user_id?.slice(0, 8) ?? "—"} · {r.details ? JSON.stringify(r.details).slice(0, 120) : "—"}
                        </div>
                      </div>
                      <span className="gm-sec-audit-time">{formatAuditWhen(r.created_at)}</span>
                    </div>
                  );
                })
              )}
            </div>
            <div className="gm-sec-table-foot">
              <span className="gm-sec-foot-note">
                Mostrando {Math.min(40, filteredAudit.length)} de {filteredAudit.length} eventos (amostra)
              </span>
              <Link to="/logs" className="gm-sec-link">
                Ver histórico completo →
              </Link>
            </div>
          </>
        ) : null}
      </div>

      {/* Grid brute + side */}
      <div className="gm-sec-grid21">
        <div className="gm-sec-card">
          <div className="gm-sec-card-h">
            <div className="gm-sec-card-ti">
              <div className="gm-sec-card-ic" style={{ background: "var(--ps)", border: "1px solid var(--pb)" }}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#8A05BE" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M6.5 1L1.5 3.5v4C1.5 10.5 3.8 12.8 6.5 13.5c2.7-.7 5-3 5-6V3.5L6.5 1Z" />
                  <path d="M4 6.5L6 8.5" />
                  <path d="M9 4.5L6 8.5" />
                </svg>
              </div>
              Proteção contra força bruta
            </div>
            <span className="gm-sec-badge b-ok">Ativo</span>
          </div>
          {settings ? (
            <>
              <div className="gm-sec-cfg-row">
                <div>
                  <div className="gm-sec-cfg-label">Máx. tentativas de login</div>
                  <div className="gm-sec-cfg-sub">Antes de bloqueio temporário</div>
                </div>
                <div className="gm-sec-cfg-val">
                  <input
                    className="gm-sec-mini-in"
                    inputMode="numeric"
                    value={form.max_failed}
                    onChange={(e) => setForm((p) => ({ ...p, max_failed: e.target.value }))}
                  />
                  <span style={{ fontSize: 12, color: "var(--t3)" }}>tentativas</span>
                </div>
              </div>
              <div className="gm-sec-cfg-row">
                <div>
                  <div className="gm-sec-cfg-label">Janela de tempo</div>
                  <div className="gm-sec-cfg-sub">Período de contagem das falhas</div>
                </div>
                <div className="gm-sec-cfg-val">
                  <input
                    className="gm-sec-mini-in"
                    inputMode="numeric"
                    value={form.window_min}
                    onChange={(e) => setForm((p) => ({ ...p, window_min: e.target.value }))}
                  />
                  <span style={{ fontSize: 12, color: "var(--t3)" }}>min</span>
                </div>
              </div>
              <div className="gm-sec-cfg-row">
                <div>
                  <div className="gm-sec-cfg-label">Duração do bloqueio</div>
                  <div className="gm-sec-cfg-sub">Tempo de lock do e-mail</div>
                </div>
                <div className="gm-sec-cfg-val">
                  <input
                    className="gm-sec-mini-in"
                    inputMode="numeric"
                    value={form.lockout_min}
                    onChange={(e) => setForm((p) => ({ ...p, lockout_min: e.target.value }))}
                  />
                  <span style={{ fontSize: 12, color: "var(--t3)" }}>min</span>
                </div>
              </div>
              <div className="gm-sec-cfg-row">
                <div>
                  <div className="gm-sec-cfg-label">Notificação ao admin</div>
                  <div className="gm-sec-cfg-sub">Preferência local (UI)</div>
                </div>
                <button
                  type="button"
                  className={cn("gm-op-toggle", draftExtra.notif_admin ? "on" : "off")}
                  onClick={() => setDraftExtra((d) => ({ ...d, notif_admin: !d.notif_admin }))}
                  aria-pressed={draftExtra.notif_admin}
                />
              </div>
              <div className="gm-sec-cfg-row">
                <div>
                  <div className="gm-sec-cfg-label">2FA obrigatório para admins</div>
                  <div className="gm-sec-cfg-sub">Preferência local — reforça o score se ativo</div>
                </div>
                <div className="gm-sec-cfg-val">
                  <button
                    type="button"
                    className={cn("gm-op-toggle", draftExtra.twofa_obrigatorio ? "on" : "off")}
                    onClick={() => setDraftExtra((d) => ({ ...d, twofa_obrigatorio: !d.twofa_obrigatorio }))}
                    aria-pressed={draftExtra.twofa_obrigatorio}
                  />
                  {!draftExtra.twofa_obrigatorio ? (
                    <span style={{ fontSize: 11, color: "var(--warn)", fontWeight: 600 }}>Desativado</span>
                  ) : (
                    <span style={{ fontSize: 11, color: "var(--ok)", fontWeight: 600 }}>Ativo</span>
                  )}
                </div>
              </div>
              <div className="gm-sec-cfg-foot">
                <button type="button" className="btn-sm-o" onClick={cancelDraft}>
                  Cancelar
                </button>
                <button type="button" className="btn-primary" style={{ height: 30, fontSize: 12, padding: "0 12px" }} disabled={savingSettings} onClick={() => void saveSettings()}>
                  {savingSettings ? "A guardar…" : "Salvar configurações"}
                </button>
              </div>
            </>
          ) : (
            <p style={{ padding: 16, fontSize: 13, color: "var(--t3)" }}>Definições indisponíveis (aplique sql/seguranca_admin.sql).</p>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="gm-sec-card">
            <div className="gm-sec-card-h">
              <div className="gm-sec-card-ti">
                <div className="gm-sec-card-ic" style={{ background: "var(--ok-bg)", border: "1px solid var(--ok-bd)" }}>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round">
                    <circle cx="6.5" cy="6.5" r="5.5" />
                    <polyline points="3,6.5 5.5,9 10,4" />
                  </svg>
                </div>
                IPs bloqueados
              </div>
              <button type="button" className="btn-sm-o" style={{ height: 26, fontSize: 11 }} onClick={() => setTab("blocks")}>
                Gerir
              </button>
            </div>
            {manualBlocks.length === 0 ? (
              <div className="gm-sec-empty">
                <div className="gm-sec-empty-ic">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round">
                    <polyline points="2,7 5.5,10.5 12,3" />
                  </svg>
                </div>
                <div className="gm-sec-empty-t">Nenhum IP bloqueado manualmente</div>
                <div className="gm-sec-empty-s">Bloqueios por e-mail aparecem na aba Bloqueios.</div>
              </div>
            ) : (
              <div>
                {manualBlocks.slice(0, 4).map((b) => (
                  <div key={b.id} className="gm-sec-ip-item">
                    <span className="gm-sec-ip-badge">{b.ip}</span>
                    <span style={{ fontSize: 12, color: "var(--t3)" }}>{b.motivo}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="gm-sec-card">
            <div className="gm-sec-card-h">
              <div className="gm-sec-card-ti">
                <div className="gm-sec-card-ic" style={{ background: "var(--warn-bg)", border: "1px solid var(--warn-bd)" }}>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round">
                    <rect x="2.5" y="5" width="8" height="6.5" rx="1.5" />
                    <path d="M4.5 5V3.5a2 2 0 0 1 4 0V5" />
                    <circle cx="6.5" cy="8.5" r=".7" fill="#D97706" />
                  </svg>
                </div>
                2FA dos administradores
              </div>
              <span className="gm-sec-badge b-warn">{adminsSem2faCount} sem 2FA</span>
            </div>
            <div>
              {adminPerfis.slice(0, 6).map((p) => {
                const self = p.usuario_id === user?.id;
                const has = self ? mfaSelf === true : false;
                return (
                  <div key={p.usuario_id} className="gm-sec-ip-item">
                    <div
                      className="gm-sec-u-av"
                      style={{ width: 26, height: 26, fontSize: 9, background: "linear-gradient(135deg,#6A00A3,#B56CFF)" }}
                    >
                      {initials(p.nome_completo, null)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--t1)" }}>{p.nome_completo ?? p.usuario_id.slice(0, 8)}</div>
                      <div style={{ fontSize: 11, color: "var(--t3)" }}>{roleLabel(String(p.role))}</div>
                    </div>
                    {has ? (
                      <span className="gm-sec-badge b-ok">Ativo</span>
                    ) : (
                      <span className="gm-sec-badge b-warn">{self ? "Sem 2FA" : "N/D"}</span>
                    )}
                    <Link
                      to={`/contas/${p.usuario_id}`}
                      className="btn-sm-o"
                      style={{ fontSize: 10.5, textDecoration: "none", padding: "4px 8px" }}
                    >
                      Conta
                    </Link>
                  </div>
                );
              })}
            </div>
            <p style={{ padding: "0 16px 12px", fontSize: 11, color: "var(--t3)" }}>
              Estado MFA completo só para a sua sessão; outros aparecem como N/D.
            </p>
          </div>
        </div>
      </div>

      {/* Matrix + audit duplicate sections as in mock — matrix standalone */}
      <div className="gm-sec-card">
        <div className="gm-sec-card-h">
          <div className="gm-sec-card-ti">
            <div className="gm-sec-card-ic" style={{ background: "var(--ps)", border: "1px solid var(--pb)" }}>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#8A05BE" strokeWidth="1.5" strokeLinecap="round">
                <rect x="1.5" y="1.5" width="10" height="10" rx="2" />
                <line x1="4.5" y1="5" x2="8.5" y2="5" />
                <line x1="4.5" y1="7.5" x2="8.5" y2="7.5" />
              </svg>
            </div>
            Matriz de permissões por papel
          </div>
          <Link to="/configuracoes" className="gm-sec-link" style={{ fontSize: 11.5 }}>
            Editar permissões →
          </Link>
        </div>
        <div className="gm-sec-table-wrap">
          <table className="gm-sec-perm-table">
            <thead>
              <tr>
                <th style={{ minWidth: 140 }}>Funcionalidade</th>
                <th>Admin Master</th>
                <th>Admin Equipe</th>
                <th>Gestor</th>
                <th>CS</th>
                <th>Cliente</th>
              </tr>
            </thead>
            <tbody>
              {PERM_ROWS.slice(0, 7).map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  {row.cells.map((c, i) => (
                    <td key={i}>{permCell(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="gm-sec-perm-legend">
          <span>
            <span className="gm-sec-perm-check" style={{ fontSize: 12 }}>
              ✓
            </span>{" "}
            Acesso total
          </span>
          <span>
            <span className="gm-sec-perm-warn">▲</span> Parcial
          </span>
          <span>
            <span className="gm-sec-perm-x">—</span> Sem acesso
          </span>
        </div>
      </div>

      <div className="gm-sec-card">
        <div className="gm-sec-card-h">
          <div className="gm-sec-card-ti">
            <div className="gm-sec-card-ic" style={{ background: "var(--ps)", border: "1px solid var(--pb)" }}>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#8A05BE" strokeWidth="1.5" strokeLinecap="round">
                <rect x="2" y="2" width="9" height="9" rx="2" />
                <line x1="4.5" y1="5" x2="8.5" y2="5" />
                <line x1="4.5" y1="7.5" x2="6.5" y2="7.5" />
              </svg>
            </div>
            Log de auditoria — ações de administradores
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select className="gm-sec-audit-filt" value={auditFilt} onChange={(e) => setAuditFilt(e.target.value)}>
              <option value="__all__">Todos os tipos</option>
              <option value="login">Login</option>
              <option value="edicao">Edição</option>
              <option value="exclusao">Exclusão</option>
              <option value="conversao">Conversão</option>
              <option value="config">Config</option>
            </select>
            <button type="button" className="gm-sec-link" onClick={() => exportAuditCsv()}>
              Exportar CSV →
            </button>
          </div>
        </div>
        <div>
          {loading ? (
            <Skeleton className="m-4 h-24 w-full" />
          ) : filteredAudit.length === 0 ? (
            <div className="gm-sec-empty">
              <div className="gm-sec-empty-s">Sem eventos.</div>
            </div>
          ) : (
            filteredAudit.slice(0, 8).map((r) => {
              const cat = auditCategory(r);
              const ic =
                cat === "exclusao" ? (
                  <div className="gm-sec-audit-ic" style={{ background: "var(--err-bg)" }}>
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round">
                      <line x1="2" y1="2" x2="9" y2="9" />
                      <line x1="9" y1="2" x2="2" y2="9" />
                    </svg>
                  </div>
                ) : (
                  <div className="gm-sec-audit-ic" style={{ background: "var(--ps)", border: "1px solid var(--pb)" }}>
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="#8A05BE" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M7 1.5L9 3.5 3.5 9H1.5V7L7 1.5Z" />
                    </svg>
                  </div>
                );
              const title = [r.tipo_acao, r.entidade_afetada].filter(Boolean).join(" · ") || "Evento";
              return (
                <div key={`b-${r.id}`} className="gm-sec-audit-row">
                  {ic}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="gm-sec-audit-action">{title}</div>
                    <div className="gm-sec-audit-meta">{r.user_id ?? "—"}</div>
                  </div>
                  <span className="gm-sec-audit-time">{formatAuditWhen(r.created_at)}</span>
                </div>
              );
            })
          )}
        </div>
        <div className="gm-sec-table-foot">
          <span className="gm-sec-foot-note">
            Mostrando {Math.min(8, filteredAudit.length)} de {filteredAudit.length} (filtrado)
          </span>
          <Link to="/logs" className="gm-sec-link">
            Ver histórico completo →
          </Link>
        </div>
      </div>
    </div>
  );
}
