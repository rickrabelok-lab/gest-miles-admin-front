import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ClipboardList, ExternalLink, Lightbulb, ShieldAlert, Zap } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

import type {
  ClientInsightEnriched,
  InsightNivel,
  InsightStatus,
} from "@/hooks/useClientInsights";
import {
  useClientInsights,
  useClientInsightsSyncForClient,
  useResolveClientInsight,
  useTriggerTaskFromInsight,
} from "@/hooks/useClientInsights";

function nivelStyles(n: InsightNivel) {
  switch (n) {
    case "critico":
      return "border-red-500/50 bg-red-500/10 text-red-950 dark:bg-red-500/10 dark:text-red-200";
    case "alto":
      return "border-orange-500/45 bg-orange-500/10 text-orange-950 dark:bg-orange-500/10 dark:text-orange-200";
    case "medio":
      return "border-amber-500/45 bg-amber-500/10 text-amber-950 dark:bg-amber-500/10 dark:text-amber-200";
    default:
      return "border-slate-400/40 bg-slate-500/10 text-slate-900 dark:bg-slate-500/10 dark:text-slate-100";
  }
}

function nivelLabel(n: InsightNivel) {
  switch (n) {
    case "critico":
      return "Crítico";
    case "alto":
      return "Alto";
    case "medio":
      return "Médio";
    default:
      return "Baixo";
  }
}

function iconForInsight(tipo: ClientInsightEnriched["tipo_insight"]) {
  switch (tipo) {
    case "CHURN_RISK":
      return ShieldAlert;
    case "SATISFACTION_DROP":
      return Zap;
    case "EMISSION_OPPORTUNITY":
    case "UPSELL_OPPORTUNITY":
      return Lightbulb;
    case "LOW_USAGE":
      return ClipboardList;
    case "HIGH_ENGAGEMENT":
      return Zap;
    default:
      return Lightbulb;
  }
}

function suggestedActionFor(tipo: ClientInsightEnriched["tipo_insight"]) {
  switch (tipo) {
    case "CHURN_RISK":
      return "Contato e follow-up com o cliente para reduzir churn.";
    case "SATISFACTION_DROP":
      return "Analisar atendimento e corrigir pontos de insatisfação.";
    case "EMISSION_OPPORTUNITY":
      return "Planejar emissão com base em saldo alto e ganhos recentes.";
    case "UPSELL_OPPORTUNITY":
      return "Avaliar oferta de upsell (condições premium/engajamento).";
    case "LOW_USAGE":
      return "Reativar o cliente: sugerir emissões e incentivos.";
    case "HIGH_ENGAGEMENT":
      return "Aproveitar engajamento: orientar próximos passos e oportunidades.";
    default:
      return "Ação sugerida para este insight.";
  }
}

export default function ClientInsightsSection({
  clienteId,
  enabled,
}: {
  clienteId: string | null;
  enabled: boolean;
}) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"all" | InsightStatus>("ativo");
  const syncedRef = useRef<string | null>(null);

  const { data: insights = [], isLoading, error } = useClientInsights(clienteId, enabled, { status });
  const resolveMutation = useResolveClientInsight();
  const triggerTaskMutation = useTriggerTaskFromInsight();
  const syncMutation = useClientInsightsSyncForClient();

  const activeCount = useMemo(() => insights.filter((i) => i.status === "ativo").length, [insights]);

  useEffect(() => {
    if (!enabled || !clienteId) return;
    if (syncedRef.current === clienteId) return;

    syncedRef.current = clienteId;
    void syncMutation
      .mutateAsync({ clienteId })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Falha ao sincronizar insights."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, clienteId]);

  const onOpenClient = (id: string) => {
    navigate(`/?clientId=${encodeURIComponent(id)}`);
  };

  if (!enabled) return null;

  return (
    <Card className="mt-2 rounded-xl border-border/80 bg-white/95 shadow-nubank dark:border-border dark:bg-card">
      <CardHeader className="pb-2 pt-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-foreground/5 text-foreground">
              <Lightbulb className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">Insights</p>
              <p className="text-xs text-muted-foreground">
                Recomendações acionáveis para Gestor e CS. Ativos: {activeCount}.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger className="h-9 w-[150px] text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ativo">Ativos</SelectItem>
                <SelectItem value="resolvido">Resolvidos</SelectItem>
                <SelectItem value="all">Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pb-4 pt-0">
        {isLoading && <p className="py-6 text-center text-sm text-muted-foreground">Carregando insights…</p>}

        {error && (
          <p className="py-4 text-center text-sm text-destructive">
            {error instanceof Error ? error.message : "Erro ao carregar insights."}
          </p>
        )}

        {!isLoading && !error && insights.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhum insight encontrado.</p>
        )}

        {!isLoading && !error && insights.length > 0 && (
          <ul className="space-y-2">
            {insights.map((ins) => {
              const Icon = iconForInsight(ins.tipo_insight);
              return (
                <li key={ins.id} className={`rounded-xl border px-3 py-2.5 ${nivelStyles(ins.nivel)}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-muted/40">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[12px] font-semibold text-foreground">{ins.titulo}</p>
                        <p className="mt-0.5 line-clamp-3 text-[11px] text-muted-foreground">{ins.descricao}</p>
                        <p className="mt-1 text-[10px] font-medium text-muted-foreground">
                          Prioridade: {nivelLabel(ins.nivel)} • Sugestão: {suggestedActionFor(ins.tipo_insight)}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 flex flex-col items-end gap-2">
                      {ins.status === "ativo" && (
                        <span className="rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900/80">
                          Ativo
                        </span>
                      )}
                      {ins.status === "resolvido" && (
                        <span className="rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800">
                          Resolvido
                        </span>
                      )}

                      <div className="flex flex-col gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-8 gap-1 text-xs"
                          onClick={() => onOpenClient(ins.cliente_id)}
                        >
                          <ExternalLink className="h-3 w-3" />
                          Abrir cliente
                        </Button>

                        {ins.status === "ativo" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1 text-xs border-amber-500/40 text-amber-900 hover:bg-amber-50 dark:text-amber-200 dark:hover:bg-amber-950/40"
                            disabled={triggerTaskMutation.isPending || resolveMutation.isPending}
                            onClick={() => {
                              void triggerTaskMutation
                                .mutateAsync({ insightId: ins.id })
                                .then(() => toast.success("Tarefa gerada a partir do insight."))
                                .catch((e) =>
                                  toast.error(e instanceof Error ? e.message : "Falha ao gerar tarefa."),
                                );
                            }}
                          >
                            <ClipboardList className="h-3 w-3" />
                            Trigger tarefa
                          </Button>
                        )}

                        {ins.status === "ativo" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1 text-xs border-emerald-500/40 text-emerald-800 hover:bg-emerald-50 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
                            disabled={resolveMutation.isPending}
                            onClick={() => {
                              void resolveMutation
                                .mutateAsync({ insightId: ins.id })
                                .then(() => toast.success("Insight marcado como resolvido."))
                                .catch((e) =>
                                  toast.error(e instanceof Error ? e.message : "Falha ao resolver insight."),
                                );
                            }}
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Marcar resolvido
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

