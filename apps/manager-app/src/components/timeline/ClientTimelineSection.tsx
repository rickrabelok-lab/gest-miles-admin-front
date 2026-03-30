import { useEffect, useMemo, useState } from "react";
import { Bell, ClipboardList, LogIn, Star, TrendingUp, Zap, ThumbsUp } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import {
  type TimelineEventoTipo,
  useClientTimeline,
  loadGestoresForCliente,
} from "@/hooks/useClientTimeline";

export default function ClientTimelineSection({
  clienteId,
  enabled,
}: {
  clienteId: string | null;
  enabled: boolean;
}) {
  const [tipoEvento, setTipoEvento] = useState<"all" | TimelineEventoTipo>("all");
  const [gestorId, setGestorId] = useState<"all" | string>("all");
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);

  const [gestores, setGestores] = useState<Array<{ id: string; nome: string }>>([]);
  const [gestoresLoading, setGestoresLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!enabled || !clienteId) return;
    setGestoresLoading(true);
    void loadGestoresForCliente(clienteId)
      .then((list) => {
        if (!mounted) return;
        setGestores(list);
      })
      .catch((e) => {
        if (!mounted) return;
        toast.error(e instanceof Error ? e.message : "Erro ao carregar gestores.");
        setGestores([]);
      })
      .finally(() => {
        if (!mounted) return;
        setGestoresLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [clienteId, enabled]);

  const { data: events = [], isLoading, error } = useClientTimeline(clienteId, enabled, {
    tipoEvento,
    gestorId,
    startDate,
    endDate,
  });

  const iconFor = (t: TimelineEventoTipo) => {
    switch (t) {
      case "EMISSAO":
        return Zap;
      case "NPS":
        return ThumbsUp;
      case "CSAT":
        return Star;
      case "ALERTA":
        return Bell;
      case "TAREFA":
        return ClipboardList;
      case "LOGIN":
        return LogIn;
      case "ATUALIZACAO_CONTA":
        return TrendingUp;
      default:
        return Zap;
    }
  };

  const formatDt = (iso: string) => {
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
  };

  const typeLabel: Record<TimelineEventoTipo, string> = {
    EMISSAO: "Emissão",
    NPS: "NPS",
    CSAT: "CSAT",
    ALERTA: "Alerta",
    TAREFA: "Tarefa",
    LOGIN: "Login",
    ATUALIZACAO_CONTA: "Atualização conta",
  };

  const hasAnyFilter = tipoEvento !== "all" || gestorId !== "all" || !!startDate || !!endDate;

  return (
    <Card className="mt-2 rounded-xl border-border/80 bg-white/95 shadow-nubank dark:border-border dark:bg-card">
      <CardHeader className="pb-2 pt-4">
        <p className="text-sm font-semibold text-foreground">Timeline</p>
        <p className="text-xs text-muted-foreground">Histórico completo de eventos do cliente (mais recente primeiro).</p>
      </CardHeader>

      <CardContent className="space-y-4 pb-4 pt-0">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">Tipo</p>
            <Select value={tipoEvento} onValueChange={(v) => setTipoEvento(v as typeof tipoEvento)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(
                  [
                    "EMISSAO",
                    "NPS",
                    "CSAT",
                    "ALERTA",
                    "TAREFA",
                    "LOGIN",
                    "ATUALIZACAO_CONTA",
                  ] as TimelineEventoTipo[]
                ).map((t) => (
                  <SelectItem key={t} value={t}>
                    {typeLabel[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">Gestor</p>
            <Select value={gestorId} onValueChange={(v) => setGestorId(v as typeof gestorId)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os gestores</SelectItem>
                {gestores.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {gestoresLoading && <p className="text-[10px] text-muted-foreground">Carregando…</p>}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">Data inicial</p>
            <DatePickerField
              value={startDate ?? ""}
              onChange={(ymd) => setStartDate(ymd || null)}
              placeholder="Início (opcional)"
              triggerClassName="w-full"
            />
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">Data final</p>
            <DatePickerField
              value={endDate ?? ""}
              onChange={(ymd) => setEndDate(ymd || null)}
              placeholder="Fim (opcional)"
              triggerClassName="w-full"
            />
          </div>
        </div>

        {hasAnyFilter && (
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setTipoEvento("all");
                setGestorId("all");
                setStartDate(null);
                setEndDate(null);
              }}
            >
              Limpar filtros
            </Button>
          </div>
        )}

        {isLoading && <p className="py-6 text-center text-sm text-muted-foreground">Carregando timeline…</p>}
        {error && (
          <p className="py-4 text-center text-sm text-destructive">
            {error instanceof Error ? error.message : "Erro ao carregar timeline."}
          </p>
        )}

        {!isLoading && !error && events.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhum evento encontrado.</p>
        )}

        {!isLoading && !error && events.length > 0 && (
          <ul className="space-y-2">
            {events.map((ev) => {
              const Icon = iconFor(ev.tipo_evento);
              return (
                <li
                  key={ev.id}
                  className={cn(
                    "rounded-xl border border-border/70 bg-background/50 px-3 py-2.5",
                    ev.tipo_evento === "ALERTA" && "border-amber-400/40",
                    ev.tipo_evento === "TAREFA" && "border-blue-400/30",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-muted/40">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[12px] font-semibold text-foreground">{ev.titulo}</p>
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{ev.descricao}</p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[10px] font-medium text-muted-foreground">{typeLabel[ev.tipo_evento]}</p>
                      <p className="text-[10px] text-muted-foreground">{formatDt(ev.data_evento)}</p>
                    </div>
                  </div>
                  {ev.gestorNome && (
                    <p className="mt-1 text-[10px] text-muted-foreground">Gestor: {ev.gestorNome}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

