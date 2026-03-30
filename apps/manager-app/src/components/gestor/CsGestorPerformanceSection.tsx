import { useMemo, useState } from "react";
import { Trophy } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CsGestorItem } from "@/hooks/useCsGestores";
import {
  detectPerformanceDrops,
  historyByGestor,
  latestScoreByGestor,
  scoreBand,
  type GestorScoreEnriched,
  useGestorScores,
  useGestorScoresRefresh,
} from "@/hooks/useGestorScores";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type ScoreRangeFilter = "all" | "green" | "yellow" | "red";

type CsGestorPerformanceSectionProps = {
  restrictToGestorIds: string[] | null;
  enabled: boolean;
  gestoresFlat: CsGestorItem[];
  canRefresh: boolean;
};

function bandClasses(band: ReturnType<typeof scoreBand>) {
  if (band === "green")
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200";
  if (band === "yellow")
    return "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200";
  return "border-red-500/40 bg-red-500/10 text-red-900 dark:text-red-200";
}

function formatDt(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function CsGestorPerformanceSection({
  restrictToGestorIds,
  enabled,
  gestoresFlat,
  canRefresh,
}: CsGestorPerformanceSectionProps) {
  const { data: rows = [], isLoading, error } = useGestorScores(enabled, restrictToGestorIds);
  const refresh = useGestorScoresRefresh();

  const [rangeFilter, setRangeFilter] = useState<ScoreRangeFilter>("all");
  const [detail, setDetail] = useState<GestorScoreEnriched | null>(null);

  const hist = useMemo(() => historyByGestor(rows), [rows]);
  const latestMap = useMemo(() => latestScoreByGestor(rows), [rows]);

  const ranking = useMemo(() => {
    const list = [...latestMap.values()];
    list.sort((a, b) => b.score_total - a.score_total);
    return list;
  }, [latestMap]);

  const filteredRanking = useMemo(() => {
    if (rangeFilter === "all") return ranking;
    return ranking.filter((r) => scoreBand(r.score_total) === rangeFilter);
  }, [ranking, rangeFilter]);

  const drops = useMemo(() => detectPerformanceDrops(hist), [hist]);
  const dropIds = useMemo(() => new Set(drops.map((d) => d.gestor_id)), [drops]);

  const topPerformers = useMemo(() => ranking.filter((r) => r.score_total >= 80).slice(0, 3), [ranking]);
  const below50 = useMemo(() => ranking.filter((r) => r.score_total < 50), [ranking]);

  const dropSummaries = useMemo(
    () =>
      drops.map((d) => {
        const snaps = hist.get(d.gestor_id) ?? [];
        const prev = snaps[1];
        const delta = prev ? prev.score_total - d.score_total : 0;
        const label =
          rows.find((r) => r.gestor_id === d.gestor_id)?.gestorNome ??
          gestoresFlat.find((g) => g.gestorId === d.gestor_id)?.gestorNome ??
          "—";
        return `${label} (−${delta.toFixed(1)})`;
      }),
    [drops, hist, rows, gestoresFlat],
  );

  if (!enabled) return null;

  if (isLoading) {
    return (
      <Card className="rounded-xl border-border/80 bg-white/95 shadow-nubank dark:border-border dark:bg-card">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Carregando performance dos gestores…
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="rounded-xl border-destructive/40 bg-white/95 dark:bg-card">
        <CardContent className="py-8 text-center text-sm text-destructive">
          {error instanceof Error ? error.message : "Erro ao carregar ranking."}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="rounded-xl border-border/80 bg-white/95 shadow-nubank dark:border-border dark:bg-card">
        <CardHeader className="pb-2 pt-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Performance dos gestores</p>
              <p className="text-xs text-muted-foreground">
                Ranking com economia (40%), NPS (30%), CSAT (20%) e SLA (10%), normalizados 0–100. Dados
                limitados pela RLS (sem vazamento entre equipes).
              </p>
            </div>
            {canRefresh && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0"
                disabled={refresh.isPending}
                onClick={() =>
                  void refresh.mutateAsync().then(
                    (n) => {
                      toast.success(
                        n === 0
                          ? "Nenhuma linha inserida (sem gestores em carteira?)."
                          : `Ranking atualizado (${n} gestor${n === 1 ? "" : "es"}).`,
                      );
                    },
                    (e) => {
                      toast.error(e instanceof Error ? e.message : "Falha ao atualizar ranking.");
                    },
                  )
                }
              >
                {refresh.isPending ? "Atualizando…" : "Atualizar ranking"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pb-4 pt-0">
          {ranking.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum snapshot ainda.
              {canRefresh
                ? " Clique em «Atualizar ranking» para calcular a partir de economia, NPS, CSAT e demandas."
                : " Peça ao CS para gerar o primeiro ranking."}
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1">
                  <p className="text-[11px] font-medium text-muted-foreground">Faixa de score total</p>
                  <Select value={rangeFilter} onValueChange={(v) => setRangeFilter(v as ScoreRangeFilter)}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas (0–100)</SelectItem>
                      <SelectItem value="green">Alto (80–100)</SelectItem>
                      <SelectItem value="yellow">Médio (50–79)</SelectItem>
                      <SelectItem value="red">Crítico (0–49)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/15 p-3 text-xs">
                <p className="mb-2 flex items-center gap-1.5 font-semibold text-foreground">
                  <Trophy className="h-3.5 w-3.5" />
                  Insights
                </p>
                <ul className="space-y-1.5 text-muted-foreground">
                  <li>
                    <span className="font-medium text-foreground">Destaques: </span>
                    {topPerformers.length === 0
                      ? "Nenhum gestor ≥ 80 neste snapshot."
                      : topPerformers.map((r) => `${r.gestorNome} (${r.score_total})`).join(" · ")}
                  </li>
                  <li>
                    <span className="font-medium text-foreground">Queda de performance: </span>
                    {drops.length === 0
                      ? "Nenhuma queda relevante vs. snapshot anterior (Δ &gt; 5 pts)."
                      : dropSummaries.join(" · ")}
                  </li>
                  <li>
                    <span className="font-medium text-foreground">Abaixo de 50: </span>
                    {below50.length === 0
                      ? "Nenhum."
                      : below50.map((r) => `${r.gestorNome} (${r.score_total})`).join(" · ")}
                  </li>
                </ul>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-medium text-muted-foreground">
                  Ranking ({filteredRanking.length} gestor{filteredRanking.length === 1 ? "" : "es"})
                </p>
                <ul className="max-h-[55vh] space-y-2 overflow-y-auto">
                  {filteredRanking.map((r) => {
                    const band = scoreBand(r.score_total);
                    const isDrop = dropIds.has(r.gestor_id);
                    const globalRank = ranking.findIndex((x) => x.gestor_id === r.gestor_id) + 1;
                    return (
                      <li key={r.gestor_id}>
                        <button
                          type="button"
                          onClick={() => setDetail(r)}
                          className={cn(
                            "flex w-full flex-col gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors hover:opacity-95",
                            bandClasses(band),
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold">
                              #{globalRank} · {r.gestorNome}
                            </span>
                            <span className="text-sm font-bold tabular-nums">{r.score_total}</span>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] opacity-90">
                            <span>Econ. {r.score_economia}</span>
                            <span>NPS {r.score_nps}</span>
                            <span>CSAT {r.score_csat}</span>
                            <span>SLA {r.score_sla}</span>
                          </div>
                          <p className="text-[10px] opacity-80">{formatDt(r.data_calculo)}</p>
                          {isDrop && (
                            <p className="text-[10px] font-medium text-amber-900 dark:text-amber-100">
                              Queda vs. cálculo anterior
                            </p>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Detalhe do score</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <p className="font-medium">{detail.gestorNome}</p>
              <p className="text-xs text-muted-foreground">Calculado em {formatDt(detail.data_calculo)}</p>
              <div
                className={cn(
                  "rounded-lg border px-3 py-2 text-center text-lg font-bold tabular-nums",
                  bandClasses(scoreBand(detail.score_total)),
                )}
              >
                Total: {detail.score_total}
              </div>
              <ul className="space-y-2 text-xs">
                <li className="flex justify-between border-b border-border/50 pb-1">
                  <span>Economia (40%)</span>
                  <span className="font-mono tabular-nums">{detail.score_economia}</span>
                </li>
                <li className="flex justify-between border-b border-border/50 pb-1">
                  <span>NPS (30%)</span>
                  <span className="font-mono tabular-nums">{detail.score_nps}</span>
                </li>
                <li className="flex justify-between border-b border-border/50 pb-1">
                  <span>CSAT (20%)</span>
                  <span className="font-mono tabular-nums">{detail.score_csat}</span>
                </li>
                <li className="flex justify-between pb-1">
                  <span>SLA (10%)</span>
                  <span className="font-mono tabular-nums">{detail.score_sla}</span>
                </li>
              </ul>
              <p className="text-[11px] text-muted-foreground">
                Pesos aplicados sobre componentes já normalizados 0–100 no servidor.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
