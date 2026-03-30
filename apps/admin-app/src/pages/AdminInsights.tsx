import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAccessScope } from "@/hooks/useAccessScope";
import { canSeeAuditLogs } from "@/lib/accessScope";
import { formatSupabaseError, listAuditLogsForAnalytics, listEquipes, listPerfisInsightRows } from "@/lib/adminApi";
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

export default function AdminInsightsPage() {
  const { scope } = useAccessScope();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StrategicInsightsResult | null>(null);
  const [autoSuggest, setAutoSuggest] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(INSIGHTS_AUTO_SUGGEST_KEY) !== "0";
  });

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
      const computed = computeStrategicInsights({
        logs,
        perfis,
        equipes: equipes.map((e) => ({ id: e.id, nome: e.nome })),
      });
      setResult(computed);
    } catch (e) {
      setError(formatSupabaseError(e));
      setResult(null);
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-nubank-text">Inteligência estratégica</h1>
        <p className="mt-1 text-sm text-nubank-text-secondary">
          Uso, crescimento e desempenho com base em <code className="text-xs">logs_acoes</code> e <code className="text-xs">perfis</code>. Registe
          eventos de login com <code className="text-xs">tipo_acao</code> contendo “login” para métricas de sessão mais fiéis.
        </p>
      </div>

      {reminder ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          {reminder}
        </p>
      ) : null}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Fontes e atualização</CardTitle>
            <CardDescription>Carrega até 8000 linhas recentes de auditoria e perfis para agregações.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch id="auto-suggest" checked={autoSuggest} onCheckedChange={setAutoSuggest} />
              <Label htmlFor="auto-suggest" className="text-sm font-normal">
                Lembrete de relatório mensal (início do mês)
              </Label>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              Atualizar dados
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {loading ? <p className="text-sm text-muted-foreground">A carregar analytics…</p> : null}
        </CardContent>
      </Card>

      {result && !loading ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="DAU" value={String(result.metrics.dau)} hint="Utilizadores distintos com ação hoje (timezone local)" />
            <MetricCard title="MAU (30d)" value={String(result.metrics.mau)} hint="Utilizadores distintos nos últimos 30 dias" />
            <MetricCard
              title="Retenção 7d (proxy)"
              value={result.metrics.retention7dPct != null ? `${result.metrics.retention7dPct.toFixed(1)}%` : "—"}
              hint="Activos há 8–14d que voltaram nos últimos 7d"
            />
            <MetricCard title="Amostra de logs" value={String(result.logSampleSize)} hint="Linhas usadas neste cálculo" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Uso ao longo do tempo (30 dias)</CardTitle>
              <CardDescription>Logins detetados, total de ações e utilizadores distintos por dia.</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer
                className="h-[320px] w-full"
                config={{
                  logins: { label: "Logins", color: "#22c55e" },
                  acoes: { label: "Ações", color: "#8b5cf6" },
                  usuariosAtivos: { label: "Utilizadores ativos", color: "#0ea5e9" },
                }}
              >
                <LineChart data={result.usage.byDay}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                  <YAxis />
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Uso por funcionalidade</CardTitle>
              <CardDescription>Top combinações entidade + tipo de ação (dados de auditoria).</CardDescription>
            </CardHeader>
            <CardContent>
              {result.usage.byFeature.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem dados.</p>
              ) : (
                <ChartContainer className="h-[300px] w-full" config={{ count: { label: "Eventos", color: "#7c3aed" } }}>
                  <BarChart data={result.usage.byFeature.slice(0, 10)} layout="vertical" margin={{ left: 8, right: 12 }}>
                    <CartesianGrid horizontal={false} />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="key" width={220} tick={{ fontSize: 9 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" fill="#7c3aed" radius={[0, 6, 6, 0]} name="Eventos" />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Equipes com mais crescimento (perfis)</CardTitle>
                <CardDescription>Novos perfis por equipe: últimos 30 dias vs 30 dias anteriores (requer created_at).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {result.equipesTopGrowth.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem dados de crescimento por equipe.</p>
                ) : (
                  result.equipesTopGrowth.map((e) => (
                    <div key={e.equipeId} className="flex items-center justify-between rounded-md border p-2 text-sm">
                      <span className="font-medium">{e.nome}</span>
                      <span className="text-muted-foreground">
                        +{e.novos30d} / anterior {e.novosPrev30d}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Clientes mais ativos</CardTitle>
                <CardDescription>Top contagem de eventos em logs para roles cliente / cliente_gestao.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {result.clientesTopActivity.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem atividade de clientes na amostra.</p>
                ) : (
                  result.clientesTopActivity.map((c) => (
                    <div key={c.usuarioId} className="flex items-center justify-between rounded-md border p-2 text-sm">
                      <span className="font-medium">{c.nome}</span>
                      <span className="tabular-nums text-muted-foreground">{c.acoes} ações</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Motor de insights</CardTitle>
              <CardDescription>Resumo automático a partir das agregações atuais.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-inside list-disc space-y-2 text-sm text-nubank-text">
                {result.insightLines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Relatórios e exportação CSV</CardTitle>
              <CardDescription>
                Relatório mensal referente a <strong>{result.previousMonth.labelPt}</strong>: {result.previousMonth.totalAcoes} ações,{" "}
                {result.previousMonth.usuariosUnicos} utilizadores únicos, {result.previousMonth.logins} logins detetados. A exportação é gerada no
                browser; para envio automático por e-mail agende um job (ex.: Supabase Edge Function + cron).
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="default"
                onClick={() => {
                  downloadTextFile(`relatorio-mensal-${result.previousMonth.key}.csv`, buildMonthlyReportCsv(result));
                  markMonthlyExported();
                }}
              >
                Exportar relatório mensal (mês anterior)
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => downloadTextFile(`insights-uso-30d-${result.previousMonth.key}.csv`, buildUsageTimeseriesCsv(result.usage.byDay))}
              >
                CSV — uso por dia
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => downloadTextFile(`insights-funcionalidades-${result.previousMonth.key}.csv`, buildFeatureUsageCsv(result.usage.byFeature))}
              >
                CSV — funcionalidades
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => downloadTextFile(`insights-bundle-${new Date().toISOString().slice(0, 10)}.csv`, buildFullExportBundleCsv(result))}
              >
                CSV — pacote completo
              </Button>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function MetricCard({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardHeader>
      <CardContent>
        <p className="font-display text-3xl font-bold tracking-tight text-primary">{value}</p>
      </CardContent>
    </Card>
  );
}
