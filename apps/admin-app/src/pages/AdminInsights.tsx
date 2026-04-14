import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, XAxis, YAxis } from "recharts";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useAccessScope } from "@/hooks/useAccessScope";
import { canSeeAuditLogs } from "@/lib/accessScope";
import {
  formatSupabaseError,
  listAuditLogsForAnalytics,
  listEquipes,
  listPerfisInsightRows,
  type LogAcaoRow,
  type PerfilInsightRow,
} from "@/lib/adminApi";
import {
  buildFeatureUsageCsv,
  buildFullExportBundleCsv,
  buildMonthlyReportCsv,
  buildUsageTimeseriesCsv,
  computeStrategicInsights,
  downloadTextFile,
  INSIGHTS_AUTO_SUGGEST_KEY,
  INSIGHTS_LAST_EXPORT_MONTH_KEY,
  type StrategicInsightsResult,
} from "@/services/strategicInsights";

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

function pctFmt(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

function numFmt(n: number): string {
  return String(n);
}

export default function AdminInsightsPage() {
  const { scope } = useAccessScope();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<InsightBundle | null>(null);
  const [windowDays, setWindowDays] = useState<number>(30);
  const [autoSuggest, setAutoSuggest] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(INSIGHTS_AUTO_SUGGEST_KEY) !== "0";
  });

  const result = useMemo<StrategicInsightsResult | null>(() => {
    if (!bundle) return null;
    return computeStrategicInsights({
      logs: bundle.logs,
      perfis: bundle.perfis,
      equipes: bundle.equipes,
      windowDays,
    });
  }, [bundle, windowDays]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(INSIGHTS_AUTO_SUGGEST_KEY, autoSuggest ? "1" : "0");
  }, [autoSuggest]);

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

  const reminder = useMemo(() => {
    if (!autoSuggest || !result) return null;
    const last = typeof window !== "undefined" ? window.localStorage.getItem(INSIGHTS_LAST_EXPORT_MONTH_KEY) : null;
    if (last === result.previousMonth.key) return null;
    const dom = new Date().getDate();
    if (dom > 7) return null;
    return `Considere exportar o relatório CSV do mês anterior (${result.previousMonth.labelPt}) para arquivo.`;
  }, [autoSuggest, result]);

  if (!canSeeAuditLogs(scope)) {
    return <Navigate to="/dashboard" replace />;
  }

  const markMonthlyExported = () => {
    if (!result) return;
    window.localStorage.setItem(INSIGHTS_LAST_EXPORT_MONTH_KEY, result.previousMonth.key);
  };

  const funnelMax = result ? Math.max(1, ...result.funnelStages.map((s) => s.count)) : 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="page-hdr" style={{ alignItems: "flex-start" }}>
        <div>
          <div className="page-title" style={{ fontSize: 22, letterSpacing: "-0.6px" }}>
            Inteligência estratégica
          </div>
          <p className="page-meta" style={{ marginTop: 4, maxWidth: 560 }}>
            Uso, crescimento e desempenho com base em <code style={{ fontSize: 11 }}>logs_acoes</code> e{" "}
            <code style={{ fontSize: 11 }}>perfis</code>. Registe logins com <code style={{ fontSize: 11 }}>tipo_acao</code> contendo “login” para
            métricas de sessão mais fiéis.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <span className="badge badge-ok">Dados em tempo real</span>
            <span className="badge badge-info">Auditoria</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button type="button" className="btn-outline" disabled={loading} onClick={() => void load()}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
              <path d="M2 9.5V11h3M12 5V2H9" />
              <path d="M2 7a5 5 0 0 1 9-2.2M11 6a5 5 0 0 1-9 2.2" />
            </svg>
            Atualizar dados
          </button>
        </div>
      </div>

      {reminder ? (
        <p
          style={{
            fontSize: 12.5,
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid var(--warn-bd)",
            background: "var(--warn-bg)",
            color: "var(--t1)",
            margin: 0,
          }}
        >
          {reminder}
        </p>
      ) : null}

      {error ? <p style={{ fontSize: 13, color: "var(--err)" }}>{error}</p> : null}
      {loading ? <p style={{ fontSize: 13, color: "var(--t3)" }}>A carregar analytics…</p> : null}

      {result && !loading ? (
        <>
          <div className="insights-date-tabs" role="tablist" aria-label="Janela do gráfico">
            {WINDOW_PRESETS.map((p) => (
              <button
                key={p.days}
                type="button"
                role="tab"
                aria-selected={windowDays === p.days}
                className={`insights-date-tab${windowDays === p.days ? " insights-date-tab-active" : ""}`}
                onClick={() => setWindowDays(p.days)}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div>
            <div className="kpi-section-title">Sessão e retenção</div>
            <div className="kpi-grid" style={{ marginBottom: 0 }}>
              <div className="kpi-card purple">
                <div className="kpi-label">DAU</div>
                <div className="kpi-value">{numFmt(result.metrics.dau)}</div>
                <div className="kpi-sub">Utilizadores distintos com ação hoje (timezone local)</div>
              </div>
              <div className="kpi-card blue">
                <div className="kpi-label">WAU (7d)</div>
                <div className="kpi-value">{numFmt(result.metrics.wau)}</div>
                <div className="kpi-sub">Activos nos últimos 7 dias corridos</div>
              </div>
              <div className="kpi-card green">
                <div className="kpi-label">MAU (30d)</div>
                <div className="kpi-value">{numFmt(result.metrics.mau)}</div>
                <div className="kpi-sub">
                  {result.metrics.mauShareOfPerfisPct != null
                    ? `${pctFmt(result.metrics.mauShareOfPerfisPct, 1)}% da base de perfis`
                    : "— % da base"}
                </div>
              </div>
              <div className="kpi-card amber">
                <div className="kpi-label">Retenção 7d (proxy)</div>
                <div className="kpi-value">{pctFmt(result.metrics.retention7dPct)}</div>
                <div className="kpi-sub">Coorte 8–15d → últimos 7d</div>
              </div>
            </div>
          </div>

          <div>
            <div className="kpi-section-title">Crescimento e risco (30d · heurísticas)</div>
            <div className="kpi-grid" style={{ marginBottom: 0 }}>
              <div className="kpi-card teal">
                <div className="kpi-label">Novos clientes</div>
                <div className="kpi-value">{numFmt(result.metrics.novosClientes30d)}</div>
                <div className="kpi-sub">Perfis cliente / cliente_gestao criados nos últimos 30d</div>
              </div>
              <div className="kpi-card violet">
                <div className="kpi-label">Leads (auditoria)</div>
                <div className="kpi-value">{numFmt(result.metrics.leadsHeuristic30d)}</div>
                <div className="kpi-sub">Eventos com texto tipo lead / captação / pipeline</div>
              </div>
              <div className="kpi-card blue">
                <div className="kpi-label">Conversão leads → novos</div>
                <div className="kpi-value">{pctFmt(result.metrics.taxaConversaoLeadsNovosClientesPct)}</div>
                <div className="kpi-sub">Novos clientes / eventos lead (proxy)</div>
              </div>
              <div className="kpi-card red">
                <div className="kpi-label">Retenção 30d (proxy)</div>
                <div className="kpi-value">{pctFmt(result.metrics.retention30dPct)}</div>
                <div className="kpi-sub">Coorte 8–30d → últimos 7d</div>
              </div>
            </div>
          </div>

          <div className="kpi-grid" style={{ marginBottom: 0 }}>
            <div className="kpi-card amber">
              <div className="kpi-label">Risco churn (14d)</div>
              <div className="kpi-value">{numFmt(result.metrics.churnRiskClientes14d)}</div>
              <div className="kpi-sub">Clientes sem log há 14d (excl. perfis com menos de 14d)</div>
            </div>
            <div className="kpi-card purple">
              <div className="kpi-label">Amostra de logs</div>
              <div className="kpi-value">{numFmt(result.logSampleSize)}</div>
              <div className="kpi-sub">Linhas carregadas para agregação</div>
            </div>
            <div className="kpi-card green">
              <div className="kpi-label">Perfis carregados</div>
              <div className="kpi-value">{numFmt(result.perfisSampleSize)}</div>
              <div className="kpi-sub">Base para MAU % e funil cliente</div>
            </div>
            <div className="kpi-card blue">
              <div className="kpi-label">Janela gráfico</div>
              <div className="kpi-value">{numFmt(result.windowDays)}d</div>
              <div className="kpi-sub">Séries temporais abaixo</div>
            </div>
          </div>

          <div className="two-col">
            <div className="assin-scard">
              <div className="assin-scard-h">
                <span>Uso ao longo do tempo</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--t3)" }}>Últimos {result.windowDays} dias</span>
              </div>
              <ChartContainer
                className="h-[300px] w-full"
                config={{
                  logins: { label: "Logins", color: "#22c55e" },
                  acoes: { label: "Ações", color: "#8b5cf6" },
                  usuariosAtivos: { label: "Utilizadores ativos", color: "#0ea5e9" },
                }}
              >
                <LineChart data={result.usage.byDay}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend />
                  <Line type="monotone" dataKey="logins" stroke="var(--color-logins)" strokeWidth={2} dot={false} name="Logins" />
                  <Line type="monotone" dataKey="acoes" stroke="var(--color-acoes)" strokeWidth={2} dot={false} name="Ações" />
                  <Line
                    type="monotone"
                    dataKey="usuariosAtivos"
                    stroke="var(--color-usuariosAtivos)"
                    strokeWidth={2}
                    dot={false}
                    name="Utilizadores"
                  />
                </LineChart>
              </ChartContainer>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="table-card">
                <div className="tc-header">
                  <div className="tc-title">
                    <span className="tc-icon" aria-hidden>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 9v4M12 17h.01M10.3 3.6h3.4L22 18H2L10.3 3.6z" />
                      </svg>
                    </span>
                    Alertas
                  </div>
                </div>
                <div style={{ padding: "14px 18px" }}>
                  {result.alerts.length === 0 ? (
                    <p style={{ fontSize: 12, color: "var(--t3)", margin: 0 }}>Sem alertas automáticos com os dados actuais.</p>
                  ) : (
                    result.alerts.map((a, i) => (
                      <div
                        key={i}
                        className={`insight-alert insight-alert-${a.tone === "err" ? "err" : a.tone === "warn" ? "warn" : "info"}`}
                      >
                        <div>
                          <div className="insight-alert-title">{a.title}</div>
                          <div className="insight-alert-sub">{a.subtitle}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="table-card">
                <div className="tc-header">
                  <div className="tc-title">
                    <span className="tc-icon" aria-hidden>
                      ✈
                    </span>
                    Milhas & programas
                  </div>
                  <span className="badge badge-off">Em integração</span>
                </div>
                <div style={{ padding: "18px 20px" }}>
                  <div className="kpi-value" style={{ fontSize: 24 }}>
                    —
                  </div>
                  <p style={{ fontSize: 11.5, color: "var(--t3)", margin: "8px 0 0", lineHeight: 1.45 }}>
                    Quando existir fonte de emissões ou saldos no Supabase, este cartão mostrará totais e tendência.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="assin-scard">
            <div className="assin-scard-h">
              <span>Uso por funcionalidade</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--t3)" }}>Top 10 na amostra</span>
            </div>
            {result.usage.byFeature.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--t3)", padding: "0 4px 12px" }}>Sem dados.</p>
            ) : (
              <ChartContainer className="h-[280px] w-full" config={{ count: { label: "Eventos", color: "#7c3aed" } }}>
                <BarChart data={result.usage.byFeature.slice(0, 10)} layout="vertical" margin={{ left: 8, right: 12 }}>
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="key" width={200} tick={{ fontSize: 9 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="#7c3aed" radius={[0, 6, 6, 0]} name="Eventos" />
                </BarChart>
              </ChartContainer>
            )}
          </div>

          <div className="assin-two-col">
            <div className="table-card">
              <div className="tc-header">
                <div className="tc-title">Funil (heurística 30d)</div>
              </div>
              <div style={{ padding: "16px 20px" }}>
                {result.funnelStages.map((s) => (
                  <div key={s.id} className="funnel-stage">
                    <div className="funnel-stage-hd">
                      <span className="funnel-stage-label">{s.label}</span>
                      <span className="funnel-stage-count">{s.count}</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${Math.min(100, (s.count / funnelMax) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="table-card">
              <div className="tc-header">
                <div className="tc-title">Ranking gestores (30d)</div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table className="am-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Gestor</th>
                      <th>Ações</th>
                      <th>Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.gestoresRanking.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ fontSize: 12, color: "var(--t3)" }}>
                          Sem actividade de gestores na amostra.
                        </td>
                      </tr>
                    ) : (
                      result.gestoresRanking.map((g, idx) => (
                        <tr key={g.usuarioId}>
                          <td>{idx + 1}</td>
                          <td style={{ fontWeight: 600 }}>{g.nome}</td>
                          <td className="tabular-nums">{g.acoes}</td>
                          <td>
                            <span className="badge badge-ok">{g.score}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="assin-two-col">
            <div className="table-card">
              <div className="tc-header">
                <div className="tc-title">Equipes com mais crescimento</div>
              </div>
              <div className="activity-card" style={{ border: "none", borderRadius: 0 }}>
                {result.equipesTopGrowth.length === 0 ? (
                  <p style={{ fontSize: 12, color: "var(--t3)", padding: "12px 16px", margin: 0 }}>
                    Sem dados de crescimento por equipe (created_at + equipe_id).
                  </p>
                ) : (
                  result.equipesTopGrowth.map((e) => (
                    <div key={e.equipeId} className="act-item">
                      <div className="act-msg">
                        <strong>{e.nome}</strong>
                        <span style={{ color: "var(--t3)", fontWeight: 500 }}> +{e.novos30d} novos · anterior {e.novosPrev30d}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="table-card">
              <div className="tc-header">
                <div className="tc-title">Clientes mais ativos</div>
              </div>
              <div className="activity-card" style={{ border: "none", borderRadius: 0 }}>
                {result.clientesTopActivity.length === 0 ? (
                  <p style={{ fontSize: 12, color: "var(--t3)", padding: "12px 16px", margin: 0 }}>
                    Sem eventos de perfis cliente na amostra.
                  </p>
                ) : (
                  result.clientesTopActivity.map((c) => (
                    <div key={c.usuarioId} className="act-item">
                      <div className="act-msg">
                        <strong>{c.nome}</strong>
                        <span style={{ color: "var(--t3)" }}> {c.acoes} ações</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="table-card">
            <div className="tc-header">
              <div className="tc-title">Motor de insights</div>
            </div>
            <ul style={{ margin: 0, padding: "16px 20px 18px 28px", fontSize: 12.5, lineHeight: 1.55, color: "var(--t1)" }}>
              {result.insightLines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>

          <div className="table-card">
            <div className="tc-header">
              <div className="tc-title">Automações (painel)</div>
            </div>
            <div style={{ padding: "4px 20px 16px" }}>
              <div className="insights-toggle-row">
                <div>
                  <div style={{ fontWeight: 600 }}>Lembrete de relatório mensal</div>
                  <div className="insights-toggle-meta">Primeiros 7 dias do mês · gravado neste browser</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Switch id="auto-suggest" checked={autoSuggest} onCheckedChange={setAutoSuggest} />
                  <Label htmlFor="auto-suggest" style={{ fontSize: 12, fontWeight: 400, cursor: "pointer" }}>
                    Activo
                  </Label>
                </div>
              </div>
              <div className="insights-toggle-row">
                <div>
                  <div style={{ fontWeight: 600 }}>Digest semanal por e-mail</div>
                  <div className="insights-toggle-meta">Requer Edge Function + cron</div>
                </div>
                <Switch disabled checked={false} aria-label="Digest semanal (indisponível)" />
              </div>
              <div className="insights-toggle-row">
                <div>
                  <div style={{ fontWeight: 600 }}>Alertas de churn automáticos</div>
                  <div className="insights-toggle-meta">Planeado</div>
                </div>
                <Switch disabled checked={false} aria-label="Alertas churn (indisponível)" />
              </div>
            </div>
          </div>

          <div className="table-card">
            <div className="tc-header">
              <div className="tc-title">Relatórios e exportação CSV</div>
            </div>
            <p style={{ fontSize: 12, color: "var(--t2)", margin: 0, padding: "0 20px", lineHeight: 1.5 }}>
              Relatório mensal: <strong>{result.previousMonth.labelPt}</strong> — {result.previousMonth.totalAcoes} ações,{" "}
              {result.previousMonth.usuariosUnicos} utilizadores únicos, {result.previousMonth.logins} logins detetados. Exportação gerada no browser.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "14px 20px 18px" }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  downloadTextFile(`relatorio-mensal-${result.previousMonth.key}.csv`, buildMonthlyReportCsv(result));
                  markMonthlyExported();
                }}
              >
                Exportar relatório mensal
              </button>
              <button
                type="button"
                className="btn-outline"
                onClick={() => downloadTextFile(`insights-uso-${result.windowDays}d-${result.previousMonth.key}.csv`, buildUsageTimeseriesCsv(result.usage.byDay))}
              >
                CSV — uso por dia
              </button>
              <button
                type="button"
                className="btn-outline"
                onClick={() =>
                  downloadTextFile(`insights-funcionalidades-${result.previousMonth.key}.csv`, buildFeatureUsageCsv(result.usage.byFeature))
                }
              >
                CSV — funcionalidades
              </button>
              <button
                type="button"
                className="btn-outline"
                onClick={() => downloadTextFile(`insights-bundle-${new Date().toISOString().slice(0, 10)}.csv`, buildFullExportBundleCsv(result))}
              >
                CSV — pacote completo
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
