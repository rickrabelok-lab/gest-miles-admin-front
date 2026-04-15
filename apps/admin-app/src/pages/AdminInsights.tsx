import { useEffect, useId, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import { useAccessScope } from "@/hooks/useAccessScope";
import { cn } from "@/lib/utils";
import { canSeeAuditLogs } from "@/lib/accessScope";
import {
  formatSupabaseError,
  listAuditLogsForAnalytics,
  listEquipes,
  listPerfisInsightRows,
  type LogAcaoRow,
  type PerfilInsightRow,
} from "@/lib/adminApi";
import { computeStrategicInsights, type StrategicInsightsResult } from "@/services/strategicInsights";

type InsightBundle = {
  logs: LogAcaoRow[];
  perfis: PerfilInsightRow[];
  equipes: Array<{ id: string; nome: string }>;
};

const WINDOW_PRESETS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "12m", days: 365 },
] as const;

const FEATURE_BAR_GRADIENTS = [
  "linear-gradient(90deg,#6A00A3,#B56CFF)",
  "linear-gradient(90deg,#16A34A,#4ADE80)",
  "linear-gradient(90deg,#2563EB,#60A5FA)",
  "linear-gradient(90deg,#D97706,#FBBF24)",
  "linear-gradient(90deg,#DB2777,#F472B6)",
  "linear-gradient(90deg,#6B7280,#D1D5DB)",
];

const RANK_SCORE_GRADIENTS = [
  "linear-gradient(90deg,#6A00A3,#B56CFF)",
  "linear-gradient(90deg,#16A34A,#4ADE80)",
  "linear-gradient(90deg,#D97706,#FBBF24)",
  "linear-gradient(90deg,#2563EB,#60A5FA)",
  "linear-gradient(90deg,#DC2626,#F87171)",
];

const RANK_AV_GRADIENTS = [
  "linear-gradient(135deg,#6A00A3,#B56CFF)",
  "linear-gradient(135deg,#16A34A,#4ADE80)",
  "linear-gradient(135deg,#D97706,#FBBF24)",
  "linear-gradient(135deg,#2563EB,#60A5FA)",
  "linear-gradient(135deg,#DC2626,#F87171)",
];

const MILHAS_PLACEHOLDER_ROWS = [
  { dot: "#E8000B", label: "Smiles", pct: 68 },
  { dot: "#C8102E", label: "LATAM Pass", pct: 45 },
  { dot: "#006FCF", label: "Amex", pct: 38 },
  { dot: "#6A00A3", label: "Outros", pct: 22 },
];

function pctFmt(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

function numFmt(n: number): string {
  return String(n);
}

function parseTs(s: string | null): Date | null {
  if (!s) return null;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return new Date(t);
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function textHaystack(log: LogAcaoRow): string {
  const parts = [
    log.tipo_acao,
    log.entidade_afetada,
    typeof log.details === "object" && log.details != null ? JSON.stringify(log.details) : "",
  ];
  return parts.join(" ").toLowerCase();
}

function isLeadLikeLog(log: LogAcaoRow, dt: Date, since: Date): boolean {
  if (dt < since) return false;
  const h = textHaystack(log);
  return (
    h.includes("lead") ||
    h.includes("captacao") ||
    h.includes("captação") ||
    h.includes("pipeline") ||
    h.includes("formulario") ||
    h.includes("formulário") ||
    h.includes("inscri")
  );
}

function usersActiveInRange(logs: LogAcaoRow[], start: Date, end: Date): Set<string> {
  const set = new Set<string>();
  for (const log of logs) {
    const dt = parseTs(log.created_at);
    if (!dt || dt < start || dt > end) continue;
    const uid = log.user_id;
    if (uid) set.add(uid);
  }
  return set;
}

function formatDayLabel(day: string): string {
  const parts = day.split("-").map(Number);
  if (parts.length < 3) return day;
  const [y, m, d] = parts;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function initialsFromName(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

function alertEmoji(tone: "warn" | "info" | "err", i: number): string {
  if (tone === "err") return "🚨";
  if (tone === "warn") return "⚡";
  return i % 2 === 0 ? "🎯" : "📊";
}

function alertIconBg(tone: "warn" | "info" | "err"): string {
  if (tone === "err") return "#FEF2F2";
  if (tone === "warn") return "#FFFBEB";
  return "#EFF6FF";
}

export default function AdminInsightsPage() {
  const chartGradId = useId().replace(/:/g, "");
  const { scope } = useAccessScope();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<InsightBundle | null>(null);
  const [windowDays, setWindowDays] = useState<number>(30);

  const result = useMemo<StrategicInsightsResult | null>(() => {
    if (!bundle) return null;
    return computeStrategicInsights({
      logs: bundle.logs,
      perfis: bundle.perfis,
      equipes: bundle.equipes,
      windowDays,
    });
  }, [bundle, windowDays]);

  const extras = useMemo(() => {
    if (!bundle?.logs || !result) return null;
    const logs = bundle.logs;
    const now = new Date();
    const todayStart = startOfLocalDay(now);

    const usersYesterday = new Set<string>();
    const usersToday = new Set<string>();
    for (const log of logs) {
      const dt = parseTs(log.created_at);
      if (!dt || !log.user_id) continue;
      if (dt >= todayStart) usersToday.add(log.user_id);
      if (dt >= addDays(todayStart, -1) && dt < todayStart) usersYesterday.add(log.user_id);
    }
    const dauDelta = usersToday.size - usersYesterday.size;

    const wauStart = addDays(todayStart, -6);
    const wauPrevStart = addDays(todayStart, -13);
    const wauPrevEnd = addDays(todayStart, -7);
    wauPrevEnd.setHours(23, 59, 59, 999);
    const wauNow = usersActiveInRange(logs, wauStart, now);
    const wauPrev = usersActiveInRange(logs, wauPrevStart, wauPrevEnd);
    const wauDelta = wauNow.size - wauPrev.size;

    const mauStart = addDays(todayStart, -29);
    const mauPrevStart = addDays(todayStart, -59);
    const mauPrevEnd = addDays(todayStart, -30);
    mauPrevEnd.setHours(23, 59, 59, 999);
    const mauNow = usersActiveInRange(logs, mauStart, now);
    const mauPrev = usersActiveInRange(logs, mauPrevStart, mauPrevEnd);
    const mauDelta = mauNow.size - mauPrev.size;

    const leadsWindowStart = addDays(todayStart, -29);
    const leadsPrevStart = addDays(todayStart, -59);
    let leads30 = 0;
    let leadsPrev30 = 0;
    for (const log of logs) {
      const dt = parseTs(log.created_at);
      if (!dt) continue;
      if (dt >= leadsWindowStart && isLeadLikeLog(log, dt, leadsWindowStart)) leads30 += 1;
      if (dt >= leadsPrevStart && dt < leadsWindowStart && isLeadLikeLog(log, dt, leadsPrevStart)) leadsPrev30 += 1;
    }
    const leadsDelta = leads30 - leadsPrev30;

    const perfilById = new Map(bundle.perfis.map((p) => [p.usuario_id, p]));
    const gestorRows = result.gestoresRanking.map((g, idx) => {
      const perfil = perfilById.get(g.usuarioId);
      const eqId = perfil?.equipe_id ?? null;
      let clientes = 0;
      if (eqId) {
        for (const p of bundle.perfis) {
          if (p.equipe_id === eqId && (p.role === "cliente" || p.role === "cliente_gestao")) clientes += 1;
        }
      }
      let emissoes = 0;
      for (const log of logs) {
        if (log.user_id !== g.usuarioId) continue;
        const dt = parseTs(log.created_at);
        if (!dt || dt < leadsWindowStart) continue;
        if (textHaystack(log).includes("emiss")) emissoes += 1;
      }
      const lowActivity = g.acoes < 5 && idx === result.gestoresRanking.length - 1 && result.gestoresRanking.length >= 3;
      return {
        ...g,
        clientes,
        emissoes,
        initials: initialsFromName(g.nome),
        lowActivity,
        avGradient: RANK_AV_GRADIENTS[Math.min(idx, RANK_AV_GRADIENTS.length - 1)]!,
        scoreGradient: RANK_SCORE_GRADIENTS[Math.min(idx, RANK_SCORE_GRADIENTS.length - 1)]!,
      };
    });

    const stages = result.funnelStages;
    const first = stages[0]?.count ?? 1;
    let bottleneckFrom = "";
    let bottleneckTo = "";
    let maxDrop = 0;
    for (let i = 0; i < stages.length - 1; i++) {
      const a = stages[i]!.count;
      const b = stages[i + 1]!.count;
      if (a <= 0) continue;
      const drop = (a - b) / a;
      if (drop > maxDrop) {
        maxDrop = drop;
        bottleneckFrom = stages[i]!.label;
        bottleneckTo = stages[i + 1]!.label;
      }
    }

    const chartData = result.usage.byDay.map((row) => ({
      ...row,
      dayLabel: formatDayLabel(row.day),
    }));

    const topFeatCount = Math.max(1, ...result.usage.byFeature.slice(0, 6).map((f) => f.count));

    return {
      dauDelta,
      wauDelta,
      mauDelta,
      leadsDelta,
      gestorRows,
      bottleneck:
        bottleneckFrom && bottleneckTo
          ? `${bottleneckFrom.split("(")[0]?.trim() ?? bottleneckFrom} → ${bottleneckTo.split("(")[0]?.trim() ?? bottleneckTo}`
          : "",
      funnelFirst: first,
      chartData,
      topFeatCount,
    };
  }, [bundle, result]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [logs, perfis, equipes] = await Promise.all([
        listAuditLogsForAnalytics(8000),
        listPerfisInsightRows(),
        listEquipes(),
      ]);
      setBundle({
        logs,
        perfis,
        equipes: equipes.map((e) => ({ id: e.id, nome: e.nome })),
      });
    } catch (e) {
      setError(formatSupabaseError(e));
      setBundle(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (!canSeeAuditLogs(scope)) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleExportPdf = () => {
    window.print();
  };

  const alertLink = (title: string): { to: string; label: string } | null => {
    const t = title.toLowerCase();
    if (t.includes("churn") || t.includes("sem eventos")) return { to: "/users", label: "Ver lista →" };
    if (t.includes("funil") || t.includes("lead")) return { to: "/logs", label: "Abrir logs →" };
    if (t.includes("limite") || t.includes("amostra")) return { to: "/logs", label: "Ver logs →" };
    if (t.includes("retenção")) return { to: "/insights", label: "Detalhes →" };
    return { to: "/logs", label: "Ver →" };
  };

  return (
    <div className="gm-ins-page">
      <div className="gm-ins-ph">
        <div>
          <div className="gm-ins-ph-row">
            <div className="gm-ins-ph-title">Inteligência Estratégica</div>
            <span className="gm-ins-badge-auto">⚡ Auto-atualiza a cada 6h</span>
          </div>
          <div className="gm-ins-ph-sub">Engajamento, crescimento, produtividade e alertas automáticos de toda a plataforma</div>
        </div>
        <div className="gm-ins-ph-actions">
          <div className="gm-ins-date-tabs" role="tablist" aria-label="Janela do gráfico">
            {WINDOW_PRESETS.map((p) => (
              <button
                key={p.days}
                type="button"
                role="tab"
                aria-selected={windowDays === p.days}
                className={cn("gm-ins-date-tab", windowDays === p.days && "gm-ins-date-tab-active")}
                onClick={() => setWindowDays(p.days)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button type="button" className="btn-outline gm-ins-no-print" disabled={loading} onClick={() => void load()}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
              <path d="M2 9.5V11h3M12 5V2H9" />
              <path d="M2 7a5 5 0 0 1 9-2.2M11 6a5 5 0 0 1-9 2.2" />
            </svg>
            Atualizar agora
          </button>
          <button type="button" className="btn-primary gm-ins-no-print" onClick={handleExportPdf}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
              <path d="M2 9.5V11h1.5L11 3.5 9.5 2 2 9.5Z" />
            </svg>
            Exportar PDF
          </button>
        </div>
      </div>

      {error ? <p style={{ fontSize: 13, color: "var(--err)" }}>{error}</p> : null}
      {loading ? <p style={{ fontSize: 13, color: "var(--t3)" }}>A carregar analytics…</p> : null}

      {result && !loading && extras ? (
        <>
          <div>
            <div className="gm-ins-sec-lbl">Engajamento de usuários</div>
            <div className="gm-ins-kpi-grid gm-ins-g4">
              <div className="gm-ins-kpi gm-ins-kpi--pu">
                <div className="gm-ins-kl">DAU — Usuários ativos hoje</div>
                <div className="gm-ins-kv">{numFmt(result.metrics.dau)}</div>
                <div className="gm-ins-ks">
                  de {numFmt(result.metrics.perfisTotal)} perfis totais (
                  {result.metrics.perfisTotal > 0
                    ? pctFmt((result.metrics.dau / result.metrics.perfisTotal) * 100, 1)
                    : "—"}
                  )
                </div>
                <div
                  className={cn(
                    "gm-ins-kd",
                    extras.dauDelta > 0 ? "gm-ins-kd-up" : extras.dauDelta < 0 ? "gm-ins-kd-dn" : "gm-ins-kd-fl",
                  )}
                >
                  {extras.dauDelta > 0 ? "↑" : extras.dauDelta < 0 ? "↓" : "→"}{" "}
                  {extras.dauDelta === 0 ? "igual a ontem" : `${extras.dauDelta > 0 ? "+" : ""}${extras.dauDelta} vs ontem`}
                </div>
              </div>
              <div className="gm-ins-kpi gm-ins-kpi--bl">
                <div className="gm-ins-kl">WAU — Últimos 7 dias</div>
                <div className="gm-ins-kv">{numFmt(result.metrics.wau)}</div>
                <div className="gm-ins-ks">usuários distintos com ação</div>
                <div
                  className={cn(
                    "gm-ins-kd",
                    extras.wauDelta > 0 ? "gm-ins-kd-up" : extras.wauDelta < 0 ? "gm-ins-kd-dn" : "gm-ins-kd-fl",
                  )}
                >
                  {extras.wauDelta > 0 ? "↑" : extras.wauDelta < 0 ? "↓" : "→"}{" "}
                  {extras.wauDelta === 0 ? "vs semana anterior" : `${extras.wauDelta > 0 ? "+" : ""}${extras.wauDelta} vs semana anterior`}
                </div>
              </div>
              <div className="gm-ins-kpi gm-ins-kpi--gr">
                <div className="gm-ins-kl">MAU — Últimos 30 dias</div>
                <div className="gm-ins-kv">{numFmt(result.metrics.mau)}</div>
                <div className="gm-ins-ks">
                  {result.metrics.mauShareOfPerfisPct != null ? `${pctFmt(result.metrics.mauShareOfPerfisPct, 1)} da base total` : "— % da base"}
                </div>
                <div
                  className={cn(
                    "gm-ins-kd",
                    extras.mauDelta > 0 ? "gm-ins-kd-up" : extras.mauDelta < 0 ? "gm-ins-kd-dn" : "gm-ins-kd-fl",
                  )}
                >
                  {extras.mauDelta > 0 ? "↑" : extras.mauDelta < 0 ? "↓" : "→"}{" "}
                  {extras.mauDelta === 0 ? "vs mês anterior (proxy)" : `${extras.mauDelta > 0 ? "+" : ""}${extras.mauDelta} vs período anterior`}
                </div>
              </div>
              <div className="gm-ins-kpi gm-ins-kpi--am">
                <div className="gm-ins-kl">Retenção 30d</div>
                <div className="gm-ins-kv">{pctFmt(result.metrics.retention30dPct)}</div>
                <div className="gm-ins-ks">coorte 8–30d → últimos 7d (proxy)</div>
                <div
                  className={cn(
                    "gm-ins-kd",
                    result.metrics.retention30dPct != null && result.metrics.retention30dPct >= 80 ? "gm-ins-kd-up" : "gm-ins-kd-fl",
                  )}
                >
                  {result.metrics.retention30dPct != null && result.metrics.retention30dPct >= 80
                    ? "↑ acima da meta (80%)"
                    : "↔ meta 80% (referência)"}
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="gm-ins-sec-lbl">Crescimento & captação</div>
            <div className="gm-ins-kpi-grid gm-ins-g4">
              <div className="gm-ins-kpi gm-ins-kpi--gr">
                <div className="gm-ins-kl">Novos leads (30d)</div>
                <div className="gm-ins-kv">{numFmt(result.metrics.leadsHeuristic30d)}</div>
                <div className="gm-ins-ks">eventos com texto tipo lead / captação (auditoria)</div>
                <div
                  className={cn(
                    "gm-ins-kd",
                    extras.leadsDelta > 0 ? "gm-ins-kd-up" : extras.leadsDelta < 0 ? "gm-ins-kd-dn" : "gm-ins-kd-fl",
                  )}
                >
                  {extras.leadsDelta > 0 ? "↑" : extras.leadsDelta < 0 ? "↓" : "→"}{" "}
                  {extras.leadsDelta === 0 ? "vs período anterior" : `${extras.leadsDelta > 0 ? "+" : ""}${extras.leadsDelta} vs período anterior`}
                </div>
              </div>
              <div className="gm-ins-kpi gm-ins-kpi--bl">
                <div className="gm-ins-kl">Taxa de conversão</div>
                <div className="gm-ins-kv">{pctFmt(result.metrics.taxaConversaoLeadsNovosClientesPct)}</div>
                <div className="gm-ins-ks">novos clientes / eventos lead (proxy)</div>
                <div className="gm-ins-kd gm-ins-kd-fl">↔ ver CSV para série completa</div>
              </div>
              <div className="gm-ins-kpi gm-ins-kpi--pu">
                <div className="gm-ins-kl">Novos clientes (30d)</div>
                <div className="gm-ins-kv">{numFmt(result.metrics.novosClientes30d)}</div>
                <div className="gm-ins-ks">perfis cliente / cliente_gestao criados</div>
                <div className="gm-ins-kd gm-ins-kd-fl">↔ carteira B2C</div>
              </div>
              <div className="gm-ins-kpi gm-ins-kpi--re">
                <div className="gm-ins-kl">Risco de churn</div>
                <div className="gm-ins-kv" style={{ color: "var(--err)" }}>
                  {numFmt(result.metrics.churnRiskClientes14d)}
                </div>
                <div className="gm-ins-ks">clientes sem evento em logs há +14 dias</div>
                <div
                  className={cn(
                    "gm-ins-kd",
                    result.metrics.churnRiskClientes14d > 0 ? "gm-ins-kd-dn" : "gm-ins-kd-up",
                  )}
                >
                  {result.metrics.churnRiskClientes14d > 0 ? "⚠ Ação necessária" : "✓ dentro do esperado"}
                </div>
              </div>
            </div>
          </div>

          <div className="gm-ins-kpi-grid gm-ins-g21">
            <div className="gm-ins-scard">
              <div className="gm-ins-sc-h">
                <div className="gm-ins-sc-ti">
                  <div className="gm-ins-sc-ic">
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#8A05BE" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                      <polyline points="1,10 4,6.5 7,8 10,3 13,5" />
                    </svg>
                  </div>
                  Atividade diária — últimos {result.windowDays} dias
                </div>
                <div className="gm-ins-legend">
                  <div className="gm-ins-legend-item">
                    <span style={{ width: 10, height: 3, background: "#8A05BE", borderRadius: 2 }} />
                    Logins
                  </div>
                  <div className="gm-ins-legend-item">
                    <span style={{ width: 10, height: 3, background: "#16A34A", borderRadius: 2 }} />
                    Ações
                  </div>
                  <div className="gm-ins-legend-item">
                    <span
                      style={{
                        width: 10,
                        height: 3,
                        background: "#B56CFF",
                        borderRadius: 2,
                        borderStyle: "dashed",
                        borderWidth: 0,
                        boxSizing: "border-box",
                        backgroundImage:
                          "repeating-linear-gradient(90deg, #B56CFF 0, #B56CFF 3px, transparent 3px, transparent 6px)",
                      }}
                    />
                    Usuários únicos
                  </div>
                </div>
              </div>
              <div className="gm-ins-line-chart">
                <ResponsiveContainer width="100%" height={120}>
                  <ComposedChart data={extras.chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id={chartGradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8A05BE" stopOpacity={0.22} />
                        <stop offset="100%" stopColor="#8A05BE" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#F0F0F0" vertical={false} />
                    <XAxis dataKey="dayLabel" tick={{ fontSize: 9.5 }} interval="preserveStartEnd" stroke="#9B9B9B" />
                    <YAxis hide domain={["auto", "auto"]} />
                    <Area
                      type="monotone"
                      dataKey="logins"
                      stroke="#8A05BE"
                      strokeWidth={2.5}
                      fill={`url(#${chartGradId})`}
                      dot={false}
                    />
                    <Line type="monotone" dataKey="acoes" stroke="#16A34A" strokeWidth={2} dot={false} />
                    <Line
                      type="monotone"
                      dataKey="usuariosAtivos"
                      stroke="#B56CFF"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
                <div className="gm-ins-x-labels">
                  {extras.chartData.length > 0 ? (
                    <>
                      <span>{extras.chartData[0]?.dayLabel}</span>
                      {extras.chartData.length > 2 ? (
                        <span>{extras.chartData[Math.floor(extras.chartData.length / 2)]?.dayLabel}</span>
                      ) : null}
                      <span className="gm-ins-x-label--hi">{extras.chartData[extras.chartData.length - 1]?.dayLabel}</span>
                    </>
                  ) : (
                    <span>—</span>
                  )}
                </div>
              </div>
            </div>

            <div className="gm-ins-scard">
              <div className="gm-ins-sc-h">
                <div className="gm-ins-sc-ti">
                  <div className="gm-ins-sc-ic" style={{ background: "#FEF2F2", borderColor: "rgba(220,38,38,0.2)" }}>
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                      <path d="M6.5 1L1 11.5h11L6.5 1Z" />
                      <line x1="6.5" y1="5" x2="6.5" y2="8" />
                      <circle cx="6.5" cy="10" r=".6" fill="#DC2626" />
                    </svg>
                  </div>
                  <span style={{ color: "var(--t1)" }}>Alertas automáticos</span>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    background: "var(--err-bg)",
                    color: "var(--err)",
                    border: "1px solid var(--err-bd)",
                    padding: "2px 8px",
                    borderRadius: 20,
                  }}
                >
                  {result.alerts.length} atenções
                </span>
              </div>
              <div>
                {result.alerts.length === 0 ? (
                  <div className="gm-ins-alert-item">
                    <div className="gm-ins-alert-ic" style={{ background: "#F0FDF4" }}>
                      ✓
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="gm-ins-alert-title">Sem alertas automáticos</div>
                      <div className="gm-ins-alert-sub">Os indicadores estão dentro do esperado com a amostra actual.</div>
                    </div>
                    <span className="gm-ins-alert-time">—</span>
                  </div>
                ) : (
                  result.alerts.map((a, i) => {
                    const link = alertLink(a.title);
                    return (
                      <div key={`${a.title}-${i}`} className="gm-ins-alert-item">
                        <div className="gm-ins-alert-ic" style={{ background: alertIconBg(a.tone) }}>
                          {alertEmoji(a.tone, i)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="gm-ins-alert-title">{a.title}</div>
                          <div className="gm-ins-alert-sub">{a.subtitle}</div>
                          {link ? (
                            <Link to={link.to} className="gm-ins-alert-action">
                              {link.label}
                            </Link>
                          ) : null}
                        </div>
                        <span className="gm-ins-alert-time">Hoje</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="gm-ins-kpi-grid gm-ins-g2">
            <div className="gm-ins-scard">
              <div className="gm-ins-sc-h">
                <div className="gm-ins-sc-ti">
                  <div className="gm-ins-sc-ic">
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#8A05BE" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                      <path d="M2 2h9L8 7v4l-3-1.5V7L2 2Z" />
                    </svg>
                  </div>
                  Funil de conversão — 30 dias
                </div>
                <span className="gm-ins-sc-sub">Heurística em logs</span>
              </div>
              <div style={{ padding: "8px 0" }}>
                {result.funnelStages.map((s) => {
                  const pct = extras.funnelFirst > 0 ? (s.count / extras.funnelFirst) * 100 : 0;
                  return (
                    <div key={s.id} className="gm-ins-funnel-item">
                      <div className="gm-ins-funnel-label">{s.label}</div>
                      <div className="gm-ins-funnel-bar-bg">
                        <div
                          className="gm-ins-funnel-bar"
                          style={{
                            width: `${Math.min(100, pct)}%`,
                            background: "linear-gradient(90deg,#6A00A3,#B56CFF)",
                            opacity: Math.max(0.45, pct / 100),
                          }}
                        />
                      </div>
                      <div className="gm-ins-funnel-num">{s.count}</div>
                      <div className="gm-ins-funnel-pct" style={{ color: pct >= 50 ? "var(--ok)" : "var(--t3)" }}>
                        {extras.funnelFirst > 0 ? `${pct.toFixed(1).replace(".", ",")}%` : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
              {extras.bottleneck ? (
                <div className="gm-ins-funnel-foot">
                  <span style={{ fontSize: 12, color: "var(--p)", fontWeight: 600 }}>🎯 Gargalo: {extras.bottleneck}</span>
                  <Link to="/logs" className="gm-ins-link-all">
                    Analisar →
                  </Link>
                </div>
              ) : null}
            </div>

            <div className="gm-ins-scard">
              <div className="gm-ins-sc-h">
                <div className="gm-ins-sc-ti">
                  <div className="gm-ins-sc-ic">
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#8A05BE" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                      <circle cx="6.5" cy="4" r="2.5" />
                      <path d="M1 12c0-2.5 2.5-4 5.5-4s5.5 1.5 5.5 4" />
                      <line x1="10" y1="3" x2="10" y2="7" />
                      <line x1="8" y1="5" x2="12" y2="5" />
                    </svg>
                  </div>
                  Ranking de gestores — 30 dias
                </div>
                <Link to="/users" className="gm-ins-link-all">
                  Ver todos →
                </Link>
              </div>
              <div>
                <div className="gm-ins-rank-hd">
                  <span style={{ width: 20, textAlign: "center", flexShrink: 0 }}>nº</span>
                  <span style={{ flex: 1 }}>Gestor</span>
                  <span style={{ width: 60, textAlign: "center" }}>Clientes</span>
                  <span style={{ width: 60, textAlign: "center" }}>Emissões</span>
                  <span style={{ width: 70, textAlign: "right" }}>Score</span>
                </div>
                {extras.gestorRows.length === 0 ? (
                  <div className="gm-ins-rank-item">
                    <span style={{ fontSize: 12, color: "var(--t3)" }}>Sem actividade de gestores na amostra.</span>
                  </div>
                ) : (
                  extras.gestorRows.map((g, idx) => (
                    <div
                      key={g.usuarioId}
                      className={cn("gm-ins-rank-item", g.lowActivity && "gm-ins-rank-item--warn")}
                    >
                      <span
                        className={cn(
                          "gm-ins-rank-num",
                          idx === 0 && "gm-ins-rank-num--1",
                          idx === 1 && "gm-ins-rank-num--2",
                          idx === 2 && "gm-ins-rank-num--3",
                        )}
                      >
                        {idx + 1}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                        <div className="gm-ins-rank-av" style={{ background: g.avGradient }}>
                          {g.initials}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--t1)" }}>{g.nome}</div>
                          <div className={cn("gm-ins-rank-meta", g.lowActivity && "gm-ins-rank-meta--err")}>
                            {g.lowActivity ? "⚠ Pouca actividade (30d)" : "Gestor"}
                          </div>
                        </div>
                      </div>
                      <span className="gm-ins-rank-col">{g.clientes}</span>
                      <span className={cn("gm-ins-rank-col", g.emissoes > 0 ? "gm-ins-rank-col--p" : g.lowActivity ? "gm-ins-rank-col--err" : "")}>
                        {g.emissoes}
                      </span>
                      <div className="gm-ins-rank-score">
                        <div className="gm-ins-prog">
                          <div className="gm-ins-prog-f" style={{ width: `${g.score}%`, background: g.scoreGradient }} />
                        </div>
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 700,
                            color: g.lowActivity ? "var(--err)" : "var(--p)",
                          }}
                        >
                          {g.score} pts
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="gm-ins-kpi-grid gm-ins-g2">
            <div className="gm-ins-scard">
              <div className="gm-ins-sc-h">
                <div className="gm-ins-sc-ti">
                  <div className="gm-ins-sc-ic">
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#8A05BE" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                      <rect x="1.5" y="1.5" width="10" height="10" rx="2" />
                      <line x1="4.5" y1="5" x2="8.5" y2="5" />
                      <line x1="4.5" y1="7.5" x2="7" y2="7.5" />
                    </svg>
                  </div>
                  Funcionalidades mais usadas — {result.windowDays}d
                </div>
              </div>
              <div style={{ padding: "8px 0" }}>
                {result.usage.byFeature.length === 0 ? (
                  <div className="gm-ins-feat-row">
                    <span className="gm-ins-feat-name">Sem dados na amostra</span>
                  </div>
                ) : (
                  result.usage.byFeature.slice(0, 6).map((f, i) => {
                    const w = (f.count / extras.topFeatCount) * 100;
                    const rel = extras.topFeatCount > 0 ? Math.round((f.count / extras.topFeatCount) * 100) : 0;
                    return (
                      <div key={f.key} className="gm-ins-feat-row">
                        <span className="gm-ins-feat-name" title={f.key}>
                          {f.key}
                        </span>
                        <div className="gm-ins-feat-bar-wrap">
                          <div className="gm-ins-feat-bar" style={{ width: `${w}%`, background: FEATURE_BAR_GRADIENTS[i % FEATURE_BAR_GRADIENTS.length] }} />
                        </div>
                        <span className="gm-ins-feat-n" style={{ color: i === 0 ? "var(--p)" : "var(--t1)" }}>
                          {f.count}
                        </span>
                        <span className="gm-ins-feat-pct">{rel}%</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="gm-ins-scard">
              <div className="gm-ins-sc-h">
                <div className="gm-ins-sc-ti">
                  <div className="gm-ins-sc-ic">
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#8A05BE" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                      <path d="M1 6.5L3.5 1 6 4.5 8 2.5 10.5 6.5 12 5" />
                      <line x1="1" y1="12" x2="12" y2="12" />
                    </svg>
                  </div>
                  Milhas gerenciadas — plataforma
                </div>
                <span className="badge badge-off">Em integração</span>
              </div>
              <div className="gm-ins-milhas-grid">
                <div className="gm-ins-milhas-cell">
                  <div className="gm-ins-milhas-lbl">Total em carteira</div>
                  <div className="gm-ins-milhas-val" style={{ color: "var(--p)" }}>
                    —
                  </div>
                  <div className="gm-ins-milhas-sub">Quando houver fonte no Supabase</div>
                </div>
                <div className="gm-ins-milhas-cell">
                  <div className="gm-ins-milhas-lbl">Emitidas este mês</div>
                  <div className="gm-ins-milhas-val" style={{ color: "var(--ok)" }}>
                    —
                  </div>
                  <div className="gm-ins-milhas-sub">CRM / emissões</div>
                </div>
                <div className="gm-ins-milhas-cell">
                  <div className="gm-ins-milhas-lbl">Economia gerada</div>
                  <div className="gm-ins-milhas-val" style={{ color: "var(--info)" }}>
                    —
                  </div>
                  <div className="gm-ins-milhas-sub">vs tarifa pagante</div>
                </div>
                <div className="gm-ins-milhas-cell">
                  <div className="gm-ins-milhas-lbl">Média por cliente</div>
                  <div className="gm-ins-milhas-val" style={{ color: "var(--warn)" }}>
                    —
                  </div>
                  <div className="gm-ins-milhas-sub">milhas por carteira</div>
                </div>
              </div>
              <div className="gm-ins-milhas-foot">
                <div className="gm-ins-milhas-foot-lbl">Distribuição por programa (exemplo visual)</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {MILHAS_PLACEHOLDER_ROWS.map((row) => (
                    <div key={row.label} className="gm-ins-milhas-prog-row">
                      <div className="gm-ins-milhas-dot" style={{ background: row.dot }} />
                      <span style={{ fontSize: 12, flex: 1, color: "var(--t2)" }}>{row.label}</span>
                      <div className="gm-ins-milhas-prog-mini">
                        <div style={{ width: `${row.pct}%`, height: "100%", background: row.dot, borderRadius: 20 }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, width: 35, textAlign: "right", color: "var(--t1)" }}>{row.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
