import { useMemo, useState } from "react";
import { ClipboardList, ExternalLink, Play, CheckCircle2, UserRound, RefreshCcw } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CsGestorItem } from "@/hooks/useCsGestores";
import {
  type PrioridadeTarefa,
  type StatusTarefa,
  useCsTarefas,
  useCsTarefasSync,
  useCsTarefasUpdateStatus,
  type TarefaCsEnriched,
} from "@/hooks/useCsTarefas";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type CsTarefasSectionProps = {
  enabled: boolean;
  canSync: boolean;
  gestoresFlat: CsGestorItem[];
  onOpenClient: (clienteId: string) => void | Promise<void>;
  onOpenGestor: (gestorId: string) => void;
};

type PrioridadeFilter = "all" | PrioridadeTarefa;
type StatusFilter = "all" | StatusTarefa;

function prioridadeStyles(p: PrioridadeTarefa) {
  switch (p) {
    case "critica":
      return "border-red-500/50 bg-red-500/10 text-red-950 dark:bg-red-500/10 dark:text-red-200";
    case "alta":
      return "border-orange-500/45 bg-orange-500/10 text-orange-950 dark:bg-orange-500/10 dark:text-orange-200";
    case "media":
      return "border-amber-500/45 bg-amber-500/10 text-amber-950 dark:bg-amber-500/10 dark:text-amber-200";
    default:
      return "border-slate-400/40 bg-slate-500/10 text-slate-900 dark:bg-slate-500/10 dark:text-slate-100";
  }
}

function prioridadeLabel(p: PrioridadeTarefa) {
  switch (p) {
    case "critica":
      return "Crítica";
    case "alta":
      return "Alta";
    case "media":
      return "Média";
    default:
      return "Baixa";
  }
}

function statusStyles(s: StatusTarefa) {
  switch (s) {
    case "pendente":
      return "bg-slate-500/10 text-slate-900 dark:bg-slate-500/10 dark:text-slate-100 border-slate-500/40";
    case "em_andamento":
      return "bg-amber-500/10 text-amber-950 dark:bg-amber-500/10 dark:text-amber-200 border-amber-500/40";
    default:
      return "bg-emerald-500/10 text-emerald-950 dark:bg-emerald-500/10 dark:text-emerald-200 border-emerald-500/40";
  }
}

function statusLabel(s: StatusTarefa) {
  switch (s) {
    case "pendente":
      return "Pendente";
    case "em_andamento":
      return "Em andamento";
    default:
      return "Concluída";
  }
}

function formatDt(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
}

export default function CsTarefasSection({
  enabled,
  canSync,
  gestoresFlat,
  onOpenClient,
  onOpenGestor,
}: CsTarefasSectionProps) {
  const { data: rows = [], isLoading, error } = useCsTarefas(enabled);
  const sync = useCsTarefasSync();
  const updateStatus = useCsTarefasUpdateStatus();

  const [prioridade, setPrioridade] = useState<PrioridadeFilter>("all");
  const [gestorId, setGestorId] = useState<string>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const gestorOptions = useMemo(() => {
    const m = new Map<string, string>();
    gestoresFlat.forEach((g) => m.set(g.gestorId, g.gestorNome));
    rows.forEach((r) => {
      if (r.gestor_id) m.set(r.gestor_id, r.gestorNome);
    });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [gestoresFlat, rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (prioridade !== "all" && r.prioridade !== prioridade) return false;
      if (status !== "all" && r.status !== status) return false;
      if (gestorId !== "all") {
        if (!r.gestor_id) return false;
        if (r.gestor_id !== gestorId) return false;
      }
      return true;
    });
  }, [rows, prioridade, status, gestorId]);

  if (!enabled) return null;

  const actOnUpdate = async (tarefa: TarefaCsEnriched, next: StatusTarefa) => {
    try {
      setBusyId(tarefa.id);
      await updateStatus.mutateAsync({ tarefaId: tarefa.id, nextStatus: next });
      toast.success(next === "concluida" ? "Tarefa concluída." : "Tarefa iniciada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao atualizar tarefa.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="mb-4">
      <Card className="rounded-xl border-border/80 bg-white/95 shadow-nubank dark:border-border dark:bg-card">
        <CardHeader className="pb-2 pt-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-foreground/5 text-foreground">
                <ClipboardList className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">Tarefas do CS</p>
                <p className="text-xs text-muted-foreground">
                  Itens acionáveis gerados a partir de alertas inteligentes. Marque, inicie e encaminhe para clientes/gestores.
                </p>
              </div>
            </div>
            {canSync && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0 gap-2"
                disabled={sync.isPending}
                onClick={() => {
                  void sync.mutateAsync().then((n) => {
                    toast.success(
                      n === 0
                        ? "Nenhuma tarefa para sincronizar."
                        : `Sincronização concluída (${n} alerta(s) processado(s)).`,
                    );
                  });
                }}
              >
                <RefreshCcw className="h-3.5 w-3.5" />
                {sync.isPending ? "Sincronizando…" : "Atualizar tarefas"}
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-3 pb-4 pt-0">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground">Prioridade</p>
              <Select value={prioridade} onValueChange={(v) => setPrioridade(v as PrioridadeFilter)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {(["critica", "alta", "media", "baixa"] as PrioridadeTarefa[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {prioridadeLabel(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground">Status</p>
              <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {(["pendente", "em_andamento", "concluida"] as StatusTarefa[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {statusLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground">Gestor</p>
              <Select value={gestorId} onValueChange={setGestorId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os gestores</SelectItem>
                  {gestorOptions.map(([id, nome]) => (
                    <SelectItem key={id} value={id}>
                      {nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoading && <p className="py-6 text-center text-sm text-muted-foreground">Carregando tarefas…</p>}
          {error && (
            <p className="py-4 text-center text-sm text-destructive">
              {error instanceof Error ? error.message : "Erro ao carregar tarefas."}
            </p>
          )}

          {!isLoading && !error && filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma tarefa com estes filtros.</p>
          )}

          {!isLoading && !error && filtered.length > 0 && (
            <ul className="max-h-[70vh] space-y-2 overflow-y-auto pr-0.5">
              {filtered.map((t) => (
                <li
                  key={t.id}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-sm shadow-sm dark:shadow-none",
                    prioridadeStyles(t.prioridade),
                  )}
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-foreground">{t.titulo}</p>
                      <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase", statusStyles(t.status))}>
                        {statusLabel(t.status)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] opacity-90">
                      <span className="font-medium">Cliente:</span>
                      <span>{t.clienteNome}</span>
                      <span className="font-medium">Gestor:</span>
                      <span>{t.gestor_id ? t.gestorNome : "—"}</span>
                      <span className="font-medium">Vencimento:</span>
                      <span>{formatDt(t.data_vencimento)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {t.cliente_id && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-8 gap-1 text-xs"
                          onClick={() => void onOpenClient(t.cliente_id!)}
                        >
                          <ExternalLink className="h-3 w-3" />
                          Abrir cliente
                        </Button>
                      )}
                      {t.gestor_id && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-8 gap-1 text-xs"
                          onClick={() => onOpenGestor(t.gestor_id!)}
                        >
                          <UserRound className="h-3 w-3" />
                          Abrir gestor
                        </Button>
                      )}
                      {t.status === "pendente" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1 text-xs border-amber-500/40 text-amber-900 hover:bg-amber-50 dark:text-amber-200 dark:hover:bg-amber-950/40"
                          disabled={busyId === t.id || updateStatus.isPending}
                          onClick={() => void actOnUpdate(t, "em_andamento")}
                        >
                          <Play className="h-3 w-3" />
                          Iniciar tarefa
                        </Button>
                      )}
                      {t.status !== "concluida" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1 text-xs border-emerald-500/40 text-emerald-800 hover:bg-emerald-50 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
                          disabled={busyId === t.id || updateStatus.isPending}
                          onClick={() => void actOnUpdate(t, "concluida")}
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          Marcar como concluída
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

