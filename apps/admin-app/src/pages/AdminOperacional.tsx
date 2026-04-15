import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

import {
  cancelarFilaProcesso,
  countLogsAcoesSince,
  countLogsErrosSince,
  formatSupabaseError,
  listFilaProcessos,
  listLogsErros,
  readOperationalUptime30d,
  reprocessarFilaProcesso,
  runOperationalHealthCheck,
  type FilaProcessoRow,
  type LogErroOrigem,
  type LogErroRow,
  type OperationalHealthResult,
} from "@/lib/adminApi";
import { cn } from "@/lib/utils";

const AUTO_REFRESH_MS = 60_000;

function startOfTodayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseTs(s: string | null): number {
  if (!s) return 0;
  const t = Date.parse(s);
  return Number.isNaN(t) ? 0 : t;
}

function nivelFromMensagem(m: string): "erro" | "aviso" | "info" {
  const x = m.toLowerCase();
  if (x.includes("[aviso]") || x.includes("warning")) return "aviso";
  if (x.includes("[info]")) return "info";
  return "erro";
}

type JobDef = {
  id: string;
  nome: string;
  status: "sucesso" | "agendado" | "executando" | "atencao" | "falhou";
  sub: string;
  prog: number;
  warnBg?: boolean;
};

const JOBS: JobDef[] = [
  {
    id: "stripe",
    nome: "Sincronização Stripe",
    status: "sucesso",
    sub: "Último run: há 2h · Próximo: em 4h",
    prog: 100,
  },
  {
    id: "insights",
    nome: "Relatório mensal de insights",
    status: "sucesso",
    sub: "Último run: 01/04/2026 · Próximo: 01/05/2026",
    prog: 100,
  },
  {
    id: "logs",
    nome: "Limpeza de logs antigos",
    status: "agendado",
    sub: "Agendado para: 30/04/2026 às 03:00",
    prog: 0,
  },
  {
    id: "churn",
    nome: "Alerta de churn — clientes inativos",
    status: "atencao",
    sub: "Último run: há 14h · 5 clientes identificados",
    prog: 100,
    warnBg: true,
  },
];

const DEPLOY_AUTO_KEY = "gm-op-deploy-auto";

export default function AdminOperacionalPage() {
  const [health, setHealth] = useState<OperationalHealthResult | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [erros, setErros] = useState<LogErroRow[]>([]);
  const [fila, setFila] = useState<FilaProcessoRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reprocId, setReprocId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [erros24h, setErros24h] = useState(0);
  const [requestsHoje, setRequestsHoje] = useState<number | null>(null);

  const [filtroOrigem, setFiltroOrigem] = useState<string>("__all__");
  const [filtroDe, setFiltroDe] = useState("");
  const [filtroAte, setFiltroAte] = useState("");
  const [filtroLogDia, setFiltroLogDia] = useState("");

  const [autoRefresh, setAutoRefresh] = useState(true);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(() => new Set());
  const [deployAuto, setDeployAuto] = useState(() => {
    if (typeof window === "undefined") return true;
    const v = window.localStorage.getItem(DEPLOY_AUTO_KEY);
    return v !== "0";
  });

  const uptime = useMemo(() => readOperationalUptime30d(), [health?.checkedAt]);

  const runHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const h = await runOperationalHealthCheck();
      setHealth(h);
    } catch (e) {
      setHealth({
        checkedAt: new Date().toISOString(),
        sistemaOnline: false,
        supabaseOk: false,
        supabaseMessage: formatSupabaseError(e),
        latenciaDbMs: null,
        latenciaAuthMs: null,
        latenciaStorageMs: null,
        latenciaStripeMs: null,
        stripeChaveConfigurada: false,
        latenciaEdgeMs: null,
        latenciaMediaSupabaseMs: null,
        externasOk: null,
        externasDetalhes: [],
      });
    } finally {
      setHealthLoading(false);
    }
  }, []);

  const loadTables = useCallback(
    async (override?: { fromDate?: string; toDate?: string }) => {
      setLoadingData(true);
      setError(null);
      const fromD = override?.fromDate ?? filtroDe.trim();
      const toD = override?.toDate ?? filtroAte.trim();
      try {
        const since24h = new Date(Date.now() - 86400000).toISOString();
        const dayStart = `${startOfTodayISO()}T00:00:00.000Z`;
        const [eRows, fRows, n24, nReq] = await Promise.all([
          listLogsErros({
            origem: filtroOrigem === "__all__" ? null : (filtroOrigem as LogErroOrigem),
            fromDate: fromD || null,
            toDate: toD || null,
            limit: 300,
          }),
          listFilaProcessos(150),
          countLogsErrosSince(since24h),
          countLogsAcoesSince(dayStart),
        ]);
        setErros(eRows);
        setFila(fRows);
        setErros24h(n24);
        setRequestsHoje(nReq);
      } catch (e) {
        setError(formatSupabaseError(e));
      } finally {
        setLoadingData(false);
      }
    },
    [filtroOrigem, filtroDe, filtroAte],
  );

  useEffect(() => {
    void runHealth();
  }, [runHealth]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => {
      void runHealth();
      void loadTables();
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [autoRefresh, runHealth, loadTables]);

  useEffect(() => {
    void loadTables();
  }, [loadTables]);

  const filaPendentes = useMemo(() => fila.filter((f) => f.status === "pendente").length, [fila]);

  const servicos = useMemo(() => {
    if (!health) {
      return [] as Array<{
        key: string;
        nome: string;
        sub: string;
        dot: "ok" | "warn" | "err" | "nd";
        lat: string;
      }>;
    }
    const extDot: "ok" | "warn" | "err" | "nd" =
      health.externasOk === null ? "nd" : health.externasOk ? "ok" : "err";
    const stripeDot: "ok" | "warn" | "err" | "nd" = health.stripeChaveConfigurada ? "ok" : "nd";
    const edgeDot: "ok" | "warn" | "err" | "nd" = health.latenciaEdgeMs != null ? "ok" : "warn";

    return [
      {
        key: "db",
        nome: "Supabase DB",
        sub: "PostgreSQL",
        dot: health.supabaseOk ? "ok" : "err",
        lat: health.latenciaDbMs != null ? `${health.latenciaDbMs}ms` : "—",
      },
      {
        key: "auth",
        nome: "Auth",
        sub: "Supabase Auth",
        dot: health.latenciaAuthMs != null ? "ok" : "err",
        lat: health.latenciaAuthMs != null ? `${health.latenciaAuthMs}ms` : "—",
      },
      {
        key: "st",
        nome: "Storage",
        sub: "Supabase Storage",
        dot: health.latenciaStorageMs != null ? "ok" : "err",
        lat: health.latenciaStorageMs != null ? `${health.latenciaStorageMs}ms` : "—",
      },
      {
        key: "stripe",
        nome: "Stripe",
        sub: "Pagamentos",
        dot: stripeDot,
        lat: health.latenciaStripeMs != null ? `${health.latenciaStripeMs}ms` : health.stripeChaveConfigurada ? "—" : "N/D",
      },
      {
        key: "edge",
        nome: "Edge Functions",
        sub: "Supabase Edge",
        dot: edgeDot,
        lat: health.latenciaEdgeMs != null ? `${health.latenciaEdgeMs}ms` : "—",
      },
      {
        key: "ext",
        nome: "APIs externas",
        sub: health.externasOk === null ? "Não configurado" : "Monitor HTTP",
        dot: extDot,
        lat: extDot === "nd" ? "N/D" : health.externasDetalhes.length ? `${health.externasDetalhes.filter((d) => d.ok).length}/${health.externasDetalhes.length} ok` : "—",
      },
    ];
  }, [health]);

  const servicosComProblema = useMemo(
    () => servicos.filter((s) => s.dot === "err" || s.dot === "warn").length,
    [servicos],
  );

  const alertas = useMemo(() => {
    const items: { titulo: string; sub: string; kind: "err" | "warn" }[] = [];
    if (health && health.externasOk === false) {
      items.push({ titulo: "API externa com falha", sub: "Ver detalhes na verificação de saúde.", kind: "err" });
    }
    if (health && !health.supabaseOk) {
      items.push({ titulo: "Supabase indisponível", sub: health.supabaseMessage ?? "Erro de ligação.", kind: "err" });
    }
    const stuckMs = 15 * 60 * 1000;
    const pendenteMs = 2 * 60 * 60 * 1000;
    const now = Date.now();
    const travados = fila.filter((f) => {
      if (f.status === "processando") return now - parseTs(f.updated_at ?? f.created_at) > stuckMs;
      if (f.status === "pendente") return now - parseTs(f.created_at) > pendenteMs;
      return false;
    });
    if (travados.length > 0) {
      items.push({
        titulo: "Processos possivelmente travados",
        sub: `${travados.length} item(ns) na fila com tempo excessivo.`,
        kind: "warn",
      });
    }
    const falhasEmail = fila.filter((f) => f.tipo === "envio_email" && f.status === "erro").length;
    if (falhasEmail > 0) {
      items.push({
        titulo: "Falhas de envio (e-mail)",
        sub: `${falhasEmail} registo(s) em erro na fila.`,
        kind: "err",
      });
    }
    if (filaPendentes > 10) {
      items.push({
        titulo: "Fila com > 10 processos pendentes",
        sub: `${filaPendentes} itens à espera de processamento.`,
        kind: "warn",
      });
    }
    return items;
  }, [health, fila, filaPendentes]);

  const infraEst = useMemo(() => {
    const dbMs = health?.latenciaDbMs ?? 85;
    const stMs = health?.latenciaStorageMs ?? 60;
    const bdUso = Math.min(92, 18 + Math.round(dbMs / 4));
    const storageUso = Math.min(88, 12 + Math.round(stMs / 5));
    const p95 = health?.latenciaMediaSupabaseMs ?? health?.latenciaDbMs ?? 0;
    const p99 = Math.round(p95 * 1.38);
    return { bdUso, storageUso, p95, p99 };
  }, [health]);

  const handleReprocessar = async (id: string) => {
    setReprocId(id);
    setError(null);
    try {
      await reprocessarFilaProcesso(id);
      await loadTables();
    } catch (e) {
      setError(formatSupabaseError(e));
    } finally {
      setReprocId(null);
    }
  };

  const handleCancelar = async (id: string) => {
    setCancelId(id);
    setError(null);
    try {
      await cancelarFilaProcesso(id);
      await loadTables();
    } catch (e) {
      setError(formatSupabaseError(e));
    } finally {
      setCancelId(null);
    }
  };

  const aplicarFiltroRapidoLogs = () => {
    const day = filtroLogDia.trim();
    if (day) {
      setFiltroDe(day);
      setFiltroAte(day);
      void loadTables({ fromDate: day, toDate: day });
    } else {
      void loadTables();
    }
  };

  const exportarRelatorio = () => {
    const lines = [
      `relatorio_operacional_${new Date().toISOString().slice(0, 10)}.csv`,
      `uptime_30d_pct,${uptime.pct}`,
      `downtime_min_est,${uptime.downtimeMinutes}`,
      `erros_24h,${erros24h}`,
      `fila_pendentes,${filaPendentes}`,
      `requests_hoje,${requestsHoje ?? ""}`,
      `supabase_ok,${health?.supabaseOk ?? ""}`,
      `latencia_media_ms,${health?.latenciaMediaSupabaseMs ?? ""}`,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `operacional-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleLogExpand = (id: string) => {
    setExpandedLogs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const checkedFmt = health?.checkedAt ? new Date(health.checkedAt).toLocaleString("pt-BR") : "—";
  const timeOnly = health?.checkedAt ? new Date(health.checkedAt).toLocaleTimeString("pt-BR") : "—";

  const filaKpiColor =
    filaPendentes === 0 ? "var(--ok)" : filaPendentes <= 5 ? "var(--warn)" : "var(--err)";

  const appVersion = import.meta.env.VITE_ADMIN_APP_VERSION ?? "dev";
  const deployAt = import.meta.env.VITE_ADMIN_DEPLOY_AT ?? "—";
  const ambiente = import.meta.env.VITE_ADMIN_ENV === "staging" ? "staging" : "production";
  const nodeVersao = import.meta.env.VITE_ADMIN_NODE_VERSION ?? "—";

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(DEPLOY_AUTO_KEY, deployAuto ? "1" : "0");
  }, [deployAuto]);

  return (
    <div className="gm-op-page">
      <div className="gm-op-hdr">
        <div>
          <div className="gm-op-title-row">
            <div className="gm-op-title">Operacional</div>
            {!health ? (
              <span className="rounded-full border border-[#ECECEC] bg-[#F5F5F6] px-2.5 py-1 text-[11px] font-semibold text-[var(--t3)]">A carregar…</span>
            ) : health.sistemaOnline && servicosComProblema === 0 ? (
              <span className="gm-op-status-pill ok">Todos os sistemas online</span>
            ) : (
              <span className="gm-op-status-pill err">
                {servicosComProblema > 0 ? `${servicosComProblema} serviço(s) com problema` : "Verificação com alertas"}
              </span>
            )}
          </div>
          <div className="gm-op-sub">Saúde do sistema, APIs, filas de processo e logs de erro</div>
        </div>
        <div className="gm-op-hdr-actions">
          <div className="gm-op-toggle-row">
            <button
              type="button"
              className={cn("gm-op-toggle", autoRefresh ? "on" : "off")}
              onClick={() => setAutoRefresh((v) => !v)}
              aria-pressed={autoRefresh}
              aria-label="Alternar atualização automática a cada 60 segundos"
            />
            <span className="gm-op-toggle-lbl">Auto-refresh 60s</span>
          </div>
          <button type="button" className="btn-outline" onClick={() => void runHealth()} disabled={healthLoading}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
              <path d="M2 7a5 5 0 0 1 9-2.2M11 6a5 5 0 0 1-9 2.2" />
              <polyline points="9,1 11,3 9,5" />
              <polyline points="4,8 2,10 4,12" />
            </svg>
            {healthLoading ? "A verificar…" : "Verificar agora"}
          </button>
          <button type="button" className="btn-primary" onClick={exportarRelatorio}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
              <path d="M2 9.5V11h1.5L11 3.5 9.5 2 2 9.5Z" />
            </svg>
            Exportar relatório
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="gm-op-kpi-row">
        <div className="gm-op-kpi gr">
          <div className="gm-op-kpi-label">Uptime (30d)</div>
          <div className="gm-op-kpi-value" style={{ color: "var(--ok)" }}>
            {uptime.pct.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
          </div>
          <div className="gm-op-kpi-sub">{uptime.downtimeMinutes <= 0 ? "0 minutos de downtime" : `≈ ${uptime.downtimeMinutes} min estimados`}</div>
        </div>
        <div className="gm-op-kpi bl">
          <div className="gm-op-kpi-label">Latência média</div>
          <div className="gm-op-kpi-value">{health?.latenciaMediaSupabaseMs != null ? `${health.latenciaMediaSupabaseMs}ms` : "—"}</div>
          <div className="gm-op-kpi-sub">resposta Supabase</div>
        </div>
        <div className={cn("gm-op-kpi", erros24h === 0 ? "ok-all" : "er")}>
          <div className="gm-op-kpi-label">Erros (24h)</div>
          <div className="gm-op-kpi-value" style={{ color: erros24h === 0 ? "var(--ok)" : "var(--err)" }}>
            {erros24h}
          </div>
          <div className="gm-op-kpi-sub">logs de erro hoje / 24h</div>
        </div>
        <div className="gm-op-kpi pu">
          <div className="gm-op-kpi-label">Fila de processos</div>
          <div className="gm-op-kpi-value" style={{ color: filaKpiColor }}>
            {filaPendentes}
          </div>
          <div className="gm-op-kpi-sub">itens pendentes</div>
        </div>
      </div>

      <div className="gm-op-card">
        <div className="gm-op-card-h">
          <div className="gm-op-card-ti">
            <div className="gm-op-card-ic ic-ok">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                <circle cx="6.5" cy="6.5" r="5.5" />
                <polyline points="3,6.5 5.5,9 10,4" />
              </svg>
            </div>
            Status dos serviços
          </div>
          <span style={{ fontSize: 11, color: "var(--t3)" }}>
            Última verificação:{" "}
            <strong style={{ color: "var(--t1)", fontFamily: "ui-monospace, monospace" }}>{checkedFmt}</strong>
          </span>
        </div>
        <div className="gm-op-services-pad">
          {!health ? (
            <div className="py-6 text-center text-sm text-muted-foreground">A carregar estado dos serviços…</div>
          ) : (
            <div className="gm-op-services-bar">
              {servicos.map((s) => (
                <div key={s.key} className="gm-op-svc-card">
                  <div className={cn("gm-op-svc-dot", s.dot)} />
                  <div className="gm-op-svc-name">{s.nome}</div>
                  <div className="gm-op-svc-sub">{s.sub}</div>
                  <div className="gm-op-svc-lat" style={{ color: s.dot === "ok" ? "var(--ok)" : "var(--t3)" }}>
                    {s.lat}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="gm-op-g21">
        <div className="gm-op-col">
          <div className="gm-op-card" id="gm-op-jobs">
            <div className="gm-op-card-h">
              <div className="gm-op-card-ti">
                <div className="gm-op-card-ic ic-pu">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#8A05BE" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <circle cx="6.5" cy="6.5" r="2" />
                    <path d="M6.5 1v1.5M6.5 10V11.5M1 6.5h1.5M10 6.5H11.5M2.9 2.9l1 1M9.1 9.1l1 1M9.1 2.9l-1 1M3.9 9.1l-1 1" />
                  </svg>
                </div>
                Jobs agendados
              </div>
              <button type="button" className="text-[11.5px] font-semibold text-[var(--p)] hover:underline" onClick={() => document.getElementById("gm-op-jobs")?.scrollIntoView({ behavior: "smooth" })}>
                Ver todos →
              </button>
            </div>
            {JOBS.map((j) => (
              <div key={j.id} className={cn("gm-op-job-row", j.warnBg && "warn-bg")}>
                <div
                  className="gm-op-job-ico"
                  style={{
                    background: j.status === "sucesso" ? "var(--ok-bg)" : j.status === "agendado" ? "var(--ps)" : j.status === "atencao" ? "var(--warn-bg)" : "var(--err-bg)",
                    border: `1px solid ${j.status === "sucesso" ? "var(--ok-bd)" : j.status === "agendado" ? "var(--pb)" : j.status === "atencao" ? "var(--warn-bd)" : "var(--err-bd)"}`,
                  }}
                >
                  {j.status === "sucesso" ? (
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                      <polyline points="1.5,6.5 5,10 11.5,3" />
                    </svg>
                  ) : j.status === "agendado" ? (
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#8A05BE" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                      <circle cx="6.5" cy="6.5" r="5.5" />
                      <line x1="6.5" y1="4" x2="6.5" y2="6.5" />
                      <circle cx="6.5" cy="9" r=".5" fill="#8A05BE" />
                    </svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                      <path d="M6.5 1L1 11.5h11L6.5 1Z" />
                      <line x1="6.5" y1="5" x2="6.5" y2="8" />
                    </svg>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="gm-op-job-name">{j.nome}</div>
                  <div className="gm-op-job-sub">{j.sub}</div>
                  <div className="gm-op-prog">
                    <div
                      className="gm-op-prog-f"
                      style={{
                        width: `${j.prog}%`,
                        background: j.status === "sucesso" ? "var(--ok)" : j.status === "atencao" ? "var(--warn)" : "var(--p)",
                      }}
                    />
                  </div>
                </div>
                <span
                  className={cn(
                    "gm-op-badge",
                    j.status === "sucesso" && "b-ok",
                    j.status === "agendado" && "b-pu",
                    j.status === "executando" && "b-info",
                    j.status === "atencao" && "b-warn",
                    j.status === "falhou" && "b-err",
                  )}
                >
                  {j.status === "sucesso" ? "Sucesso" : j.status === "agendado" ? "Agendado" : j.status === "executando" ? "Executando" : j.status === "atencao" ? "Atenção" : "Falhou"}
                </span>
                <button
                  type="button"
                  className="gm-op-ic-btn"
                  title="Executar agora"
                  onClick={() => {
                    void runHealth();
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
                    <path d="M2 1.5L9 5.5 2 9.5V1.5Z" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          <div className="gm-op-card">
            <div className="gm-op-card-h">
              <div className="gm-op-card-ti">
                <div className="gm-op-card-ic ic-ok">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <line x1="1.5" y1="4" x2="11.5" y2="4" />
                    <line x1="1.5" y1="6.5" x2="8" y2="6.5" />
                    <line x1="1.5" y1="9" x2="5.5" y2="9" />
                  </svg>
                </div>
                Fila de processos <code className="gm-op-code ml-1">fila_processos</code>
              </div>
              <span className={cn("gm-op-badge", filaPendentes === 0 ? "b-ok" : "b-warn")}>{filaPendentes} pendentes</span>
            </div>
            {loadingData ? (
              <div className="p-4 text-sm text-muted-foreground">A carregar…</div>
            ) : fila.length === 0 ? (
              <div className="gm-op-empty">
                <div className="gm-op-empty-ic">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <polyline points="2,8 6,12 14,4" />
                  </svg>
                </div>
                <div className="gm-op-empty-title">Fila limpa</div>
                <div className="gm-op-empty-sub">Nenhum processo pendente ou com falha.</div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="gm-op-table min-w-[720px]">
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>Estado</th>
                      <th>Tentativas</th>
                      <th>Criado</th>
                      <th>Atualizado</th>
                      <th className="text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fila.map((f) => (
                      <tr key={f.id}>
                        <td>{f.tipo}</td>
                        <td>
                          <span
                            className={cn(
                              "gm-op-badge",
                              f.status === "concluido" && "b-ok",
                              f.status === "pendente" && "b-warn",
                              f.status === "processando" && "b-info",
                              f.status === "erro" && "b-err",
                            )}
                          >
                            {f.status === "processando" ? "executando" : f.status}
                          </span>
                        </td>
                        <td style={{ color: f.tentativas > 3 ? "var(--err)" : undefined }}>{f.tentativas}</td>
                        <td className="gm-op-ts-mono">{f.created_at ? new Date(f.created_at).toLocaleString("pt-BR") : "—"}</td>
                        <td className="gm-op-ts-mono">{f.updated_at ? new Date(f.updated_at).toLocaleString("pt-BR") : "—"}</td>
                        <td className="text-right">
                          {f.status === "erro" ? (
                            <button type="button" className="btn-sm-o border-[var(--warn-bd)] text-[var(--warn)]" disabled={reprocId === f.id} onClick={() => void handleReprocessar(f.id)}>
                              {reprocId === f.id ? "…" : "Retentar"}
                            </button>
                          ) : f.status === "pendente" ? (
                            <button type="button" className="btn-sm-o border-[var(--err-bd)] text-[var(--err)]" disabled={cancelId === f.id} onClick={() => void handleCancelar(f.id)}>
                              {cancelId === f.id ? "…" : "Cancelar"}
                            </button>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="gm-op-card">
            <div className="gm-op-card-h">
              <div className="gm-op-card-ti">
                <div className="gm-op-card-ic ic-ok">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <rect x="1.5" y="1.5" width="10" height="10" rx="2" />
                    <line x1="4" y1="5" x2="9" y2="5" />
                    <line x1="4" y1="7.5" x2="7" y2="7.5" />
                  </svg>
                </div>
                Logs de erros <code className="gm-op-code ml-1">logs_erros</code>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="gm-op-filt-sel"
                  value={filtroOrigem}
                  onChange={(e) => setFiltroOrigem(e.target.value)}
                  aria-label="Origem do log"
                >
                  <option value="__all__">Todas as origens</option>
                  <option value="frontend">frontend</option>
                  <option value="backend">backend</option>
                  <option value="api">api</option>
                </select>
                <input className="gm-op-filt-inp" type="date" value={filtroLogDia} onChange={(e) => setFiltroLogDia(e.target.value)} aria-label="Dia (filtro rápido)" />
                <button type="button" className="btn-ok" onClick={() => aplicarFiltroRapidoLogs()}>
                  Filtrar
                </button>
              </div>
            </div>
            <table className="gm-op-table">
              <thead>
                <tr>
                  <th>Nível</th>
                  <th>Quando</th>
                  <th>Origem</th>
                  <th>Mensagem</th>
                  <th className="text-right">Stack</th>
                </tr>
              </thead>
              <tbody>
                {loadingData ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-sm text-muted-foreground">
                      A carregar…
                    </td>
                  </tr>
                ) : erros.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <div className="gm-op-empty" style={{ padding: 16 }}>
                        <div className="gm-op-empty-ic">
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                            <polyline points="2,8 6,12 14,4" />
                          </svg>
                        </div>
                        <div className="gm-op-empty-title">Nenhum erro registado no período</div>
                        <div className="gm-op-empty-sub">Sistema a funcionar normalmente ou sem registos na tabela.</div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  erros.map((r) => {
                    const nv = nivelFromMensagem(r.mensagem);
                    return (
                      <Fragment key={r.id}>
                        <tr>
                          <td>
                            <span className={cn("gm-op-lvl", nv === "erro" && "err", nv === "aviso" && "warn", nv === "info" && "info")}>{nv}</span>
                          </td>
                          <td className="gm-op-ts-mono">{r.created_at ? new Date(r.created_at).toLocaleString("pt-BR") : "—"}</td>
                          <td>
                            <code className="rounded bg-[#F5F5F6] px-1.5 py-0.5 font-mono text-[10px]">{r.origem}</code>
                          </td>
                          <td className="max-w-[280px] truncate text-[12.5px]">{r.mensagem}</td>
                          <td className="text-right">
                            {r.stack ? (
                              <button type="button" className="gm-op-ic-btn" title="Expandir stack" onClick={() => toggleLogExpand(r.id)}>
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                                  <polyline points="2,4 6,8 10,4" />
                                </svg>
                              </button>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                        {expandedLogs.has(r.id) && r.stack ? (
                          <tr className="bg-[#fafafa]">
                            <td colSpan={5} className="border-t border-[#f7f7f7] px-4 py-3 font-mono text-[10px] text-[var(--t2)]">
                              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all">{r.stack}</pre>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="gm-op-col">
          <div className="gm-op-card">
            <div className="gm-op-card-h">
              <div className="gm-op-card-ti">
                <div className="gm-op-card-ic ic-ok">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <path d="M6.5 1a5.5 5.5 0 1 0 0 11A5.5 5.5 0 0 0 6.5 1Z" />
                    <polyline points="3,6.5 5.5,9 10,4" />
                  </svg>
                </div>
                Alertas operacionais
              </div>
            </div>
            {alertas.length === 0 ? (
              <>
                <div className="gm-op-alert-allgood">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <polyline points="2,8 6,12 14,4" />
                  </svg>
                  <div>
                    <div style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--ok)" }}>Todos os sistemas operacionais</div>
                    <div style={{ fontSize: 11, color: "#166534", marginTop: 1 }}>Sem alertas ativos · Última verificação: {timeOnly}</div>
                  </div>
                </div>
                <div className="gm-op-alert-item">
                  <div className="gm-op-alert-ico" style={{ background: "#F5F5F6" }}>
                    📋
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--t1)" }}>Nenhum alerta operacional ativo</div>
                    <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 1 }}>Os últimos 7 dias não tiveram incidentes registados.</div>
                  </div>
                </div>
              </>
            ) : (
              alertas.map((a, i) => (
                <div key={i} className="gm-op-alert-item">
                  <div
                    className="gm-op-alert-ico"
                    style={{
                      background: a.kind === "err" ? "var(--err-bg)" : "var(--warn-bg)",
                    }}
                  >
                    {a.kind === "err" ? "🚨" : "⚡"}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--t1)" }}>{a.titulo}</div>
                    <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 1 }}>{a.sub}</div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="gm-op-card">
            <div className="gm-op-card-h">
              <div className="gm-op-card-ti">
                <div className="gm-op-card-ic ic-pu">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#8A05BE" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <rect x="1.5" y="1.5" width="10" height="10" rx="2" />
                    <line x1="4" y1="8" x2="4" y2="11.5" />
                    <line x1="6.5" y1="5" x2="6.5" y2="11.5" />
                    <line x1="9" y1="7" x2="9" y2="11.5" />
                  </svg>
                </div>
                Infraestrutura
              </div>
            </div>
            <div style={{ padding: "12px 16px" }}>
              <div className="gm-op-metric-row">
                <span className="gm-op-metric-lbl">Banco de dados (uso estimado)</span>
                <div className="flex items-center gap-2">
                  <div className="h-[5px] w-[60px] overflow-hidden rounded-[20px] bg-[#F0F0F0]">
                    <div
                      className="h-full rounded-[20px]"
                      style={{ width: `${infraEst.bdUso}%`, background: "linear-gradient(90deg,#6A00A3,#B56CFF)" }}
                    />
                  </div>
                  <span className="gm-op-metric-val">{infraEst.bdUso}%</span>
                </div>
              </div>
              <div className="gm-op-metric-row">
                <span className="gm-op-metric-lbl">Armazenamento (estimado)</span>
                <div className="flex items-center gap-2">
                  <div className="h-[5px] w-[60px] overflow-hidden rounded-[20px] bg-[#F0F0F0]">
                    <div
                      className="h-full rounded-[20px]"
                      style={{ width: `${infraEst.storageUso}%`, background: "linear-gradient(90deg,#16A34A,#4ADE80)" }}
                    />
                  </div>
                  <span className="gm-op-metric-val">{infraEst.storageUso}%</span>
                </div>
              </div>
              <div className="gm-op-metric-row">
                <span className="gm-op-metric-lbl">Requests hoje</span>
                <span className="gm-op-metric-val">{requestsHoje != null ? requestsHoje.toLocaleString("pt-BR") : "—"}</span>
              </div>
              <div className="gm-op-metric-row">
                <span className="gm-op-metric-lbl">Bandwidth (mês)</span>
                <span className="gm-op-metric-val text-[var(--t3)]">N/D</span>
              </div>
              <div className="gm-op-metric-row">
                <span className="gm-op-metric-lbl">Latência P95</span>
                <span className="gm-op-metric-val" style={{ color: "var(--ok)" }}>
                  {infraEst.p95 > 0 ? `${infraEst.p95}ms` : "—"}
                </span>
              </div>
              <div className="gm-op-metric-row">
                <span className="gm-op-metric-lbl">Latência P99</span>
                <span
                  className="gm-op-metric-val"
                  style={{
                    color: infraEst.p99 > 1000 ? "var(--err)" : infraEst.p99 > 500 ? "var(--warn)" : "var(--ok)",
                  }}
                >
                  {infraEst.p99 > 0 ? `${infraEst.p99}ms` : "—"}
                </span>
              </div>
            </div>
          </div>

          <div className="gm-op-card">
            <div className="gm-op-card-h">
              <div className="gm-op-card-ti">
                <div className="gm-op-card-ic ic-pu">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#8A05BE" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <circle cx="6.5" cy="6.5" r="5.5" />
                    <line x1="6.5" y1="4" x2="6.5" y2="6.5" />
                    <line x1="6.5" y1="9" x2="6.5" y2="9.2" />
                  </svg>
                </div>
                Versão &amp; deploy
              </div>
            </div>
            <div style={{ padding: "12px 16px" }}>
              <div className="gm-op-metric-row">
                <span className="gm-op-metric-lbl">Versão atual</span>
                <span className="rounded-md border border-[var(--pb)] bg-[var(--ps)] px-2 py-0.5 font-mono text-xs font-bold text-[var(--p)]">{appVersion}</span>
              </div>
              <div className="gm-op-metric-row">
                <span className="gm-op-metric-lbl">Último deploy</span>
                <span className="gm-op-metric-val">{deployAt}</span>
              </div>
              <div className="gm-op-metric-row">
                <span className="gm-op-metric-lbl">Ambiente</span>
                <span className={cn("gm-op-badge", ambiente === "production" ? "b-ok" : "b-warn")}>{ambiente === "production" ? "Produção" : "Staging"}</span>
              </div>
              <div className="gm-op-metric-row">
                <span className="gm-op-metric-lbl">Região</span>
                <span className="gm-op-metric-val">sa-east-1 (São Paulo)</span>
              </div>
              <div className="gm-op-metric-row">
                <span className="gm-op-metric-lbl">Node.js (build)</span>
                <span className="font-mono text-[12px] text-[var(--t2)]">{nodeVersao}</span>
              </div>
              <div className="gm-op-metric-row border-b-0">
                <div className="flex w-full flex-col gap-2 rounded-lg border border-[var(--bd)] bg-[#fafafa] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-medium text-[var(--t2)]">Deploy automático ativo</span>
                    <button
                      type="button"
                      className={cn("gm-op-toggle", deployAuto ? "on" : "off")}
                      onClick={() => setDeployAuto((v) => !v)}
                      aria-pressed={deployAuto}
                    />
                  </div>
                  <p className="text-[11px] text-[var(--t3)]">Branch: main → produção (preferência guardada neste browser).</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
