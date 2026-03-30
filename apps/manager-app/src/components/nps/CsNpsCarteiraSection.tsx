import { useMemo, useState } from "react";

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
  computeNpsStats,
  npsByGestor,
  type NpsAvaliacaoEnriched,
  useNpsDashboard,
} from "@/hooks/useNpsDashboard";
import { cn } from "@/lib/utils";

type CsNpsCarteiraSectionProps = {
  /** Carteira CS: filtra pelos gestores supervisionados. Gestor: null (só RLS). */
  restrictToGestorIds: string[] | null;
  enabled: boolean;
  /** Para o filtro e tabela “por gestor” no modo CS */
  gestoresFlat: CsGestorItem[];
  onOpenClient: (clienteId: string) => void;
};

const CLASS_LABEL: Record<string, string> = {
  all: "Todas",
  promotor: "Promotores",
  neutro: "Neutros",
  detrator: "Detratores",
};

function formatPct(n: number) {
  return `${n.toFixed(1)}%`;
}

export default function CsNpsCarteiraSection({
  restrictToGestorIds,
  enabled,
  gestoresFlat,
  onOpenClient,
}: CsNpsCarteiraSectionProps) {
  const { data: rows = [], isLoading, error } = useNpsDashboard(enabled, restrictToGestorIds);

  const [gestorFilter, setGestorFilter] = useState<string>("all");
  const [classFilter, setClassFilter] = useState<string>("all");

  const gestorNomeMap = useMemo(() => {
    const m = new Map<string, string>();
    gestoresFlat.forEach((g) => m.set(g.gestorId, g.gestorNome));
    rows.forEach((r) => {
      if (!m.has(r.gestor_id)) m.set(r.gestor_id, r.gestorNome);
    });
    return m;
  }, [gestoresFlat, rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (gestorFilter !== "all" && r.gestor_id !== gestorFilter) return false;
      if (classFilter !== "all" && r.classificacao !== classFilter) return false;
      return true;
    });
  }, [rows, gestorFilter, classFilter]);

  const stats = useMemo(() => computeNpsStats(filtered), [filtered]);
  const byGestor = useMemo(() => npsByGestor(filtered, gestorNomeMap), [filtered, gestorNomeMap]);

  const detratores = useMemo(
    () =>
      filtered
        .filter((r) => r.classificacao === "detrator")
        .sort((a, b) => new Date(b.data_avaliacao).getTime() - new Date(a.data_avaliacao).getTime()),
    [filtered],
  );

  const ultimosFeedbacks = useMemo(() => filtered.slice(0, 20), [filtered]);

  if (!enabled) return null;

  if (isLoading) {
    return (
      <Card className="rounded-xl border-border/80 bg-white/95 shadow-nubank dark:border-border dark:bg-card">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Carregando NPS da carteira…
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="rounded-xl border-destructive/40 bg-white/95 dark:bg-card">
        <CardContent className="py-8 text-center text-sm text-destructive">
          {error instanceof Error ? error.message : "Erro ao carregar NPS."}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-xl border-border/80 bg-white/95 shadow-nubank dark:border-border dark:bg-card">
      <CardHeader className="pb-2 pt-4">
        <p className="text-sm font-semibold text-foreground">NPS da carteira</p>
        <p className="text-xs text-muted-foreground">
          Nota média, índice NPS (% promotores − % detratores) e priorização de detratores. Os dados respeitam
          sua visão no Supabase (RLS).
        </p>
      </CardHeader>
      <CardContent className="space-y-4 pb-4 pt-0">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">Gestor</p>
            <Select value={gestorFilter} onValueChange={setGestorFilter}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os gestores</SelectItem>
                {gestoresFlat.map((g) => (
                  <SelectItem key={g.gestorId} value={g.gestorId}>
                    {g.gestorNome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">Classificação</p>
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                {(["all", "promotor", "neutro", "detrator"] as const).map((k) => (
                  <SelectItem key={k} value={k}>
                    {CLASS_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">NPS (índice)</p>
            <p className="text-lg font-bold tabular-nums text-foreground">
              {stats.npsScore === null ? "—" : stats.npsScore.toFixed(0)}
            </p>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Nota média</p>
            <p className="text-lg font-bold tabular-nums text-foreground">
              {stats.avgNota === null ? "—" : stats.avgNota.toFixed(1)}
            </p>
          </div>
          <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2">
            <p className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400">Promotores</p>
            <p className="text-sm font-semibold tabular-nums">{formatPct(stats.pct.promotor)}</p>
          </div>
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2">
            <p className="text-[10px] font-medium text-amber-800 dark:text-amber-300">Neutros</p>
            <p className="text-sm font-semibold tabular-nums">{formatPct(stats.pct.neutro)}</p>
          </div>
        </div>
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
          <p className="text-[10px] font-medium text-red-700 dark:text-red-400">Detratores</p>
          <p className="text-sm font-semibold tabular-nums">{formatPct(stats.pct.detrator)}</p>
        </div>

        {byGestor.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              NPS por gestor (filtro aplicado)
            </p>
            <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-border/60 p-2">
              {byGestor.map((g) => (
                <div
                  key={g.gestorId}
                  className="flex items-center justify-between gap-2 rounded-md bg-muted/30 px-2 py-1.5 text-xs"
                >
                  <span className="min-w-0 truncate font-medium">{g.gestorNome}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    n={g.count}
                    {g.npsScore !== null ? ` · NPS ${g.npsScore.toFixed(0)}` : ""}
                    {g.avgNota !== null ? ` · ∅ ${g.avgNota.toFixed(1)}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">
            Clientes detratores (prioridade alta)
          </p>
          {detratores.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum detrator no filtro atual.</p>
          ) : (
            <ul className="max-h-44 space-y-1.5 overflow-y-auto">
              {detratores.map((r) => (
                <DetratorRow key={r.id} row={r} onOpenClient={onOpenClient} />
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Últimos feedbacks
          </p>
          {ultimosFeedbacks.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma avaliação no filtro atual.</p>
          ) : (
            <ul className="max-h-52 space-y-2 overflow-y-auto pr-1">
              {ultimosFeedbacks.map((r) => (
                <li
                  key={r.id}
                  className="rounded-lg border border-border/70 bg-background/60 p-2 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <button
                      type="button"
                      className="truncate text-left font-semibold text-[#8A05BE] underline-offset-2 hover:underline"
                      onClick={() => onOpenClient(r.cliente_id)}
                    >
                      {r.clienteNome}
                    </button>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                        r.classificacao === "promotor" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
                        r.classificacao === "neutro" && "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
                        r.classificacao === "detrator" && "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
                      )}
                    >
                      {r.classificacao} · {r.nota}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {r.gestorNome} · {new Date(r.data_avaliacao).toLocaleString("pt-BR")}
                  </p>
                  {r.comentario ? (
                    <p className="mt-1 text-[11px] leading-snug text-foreground">{r.comentario}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DetratorRow({
  row,
  onOpenClient,
}: {
  row: NpsAvaliacaoEnriched;
  onOpenClient: (id: string) => void;
}) {
  return (
    <li className="flex flex-col gap-1 rounded-lg border border-red-200/80 bg-red-50/50 px-2 py-2 dark:border-red-900/40 dark:bg-red-950/20">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="min-w-0 truncate text-left text-xs font-semibold text-[#8A05BE] underline-offset-2 hover:underline"
          onClick={() => onOpenClient(row.cliente_id)}
        >
          {row.clienteNome}
        </button>
        <span className="shrink-0 text-[10px] font-medium text-red-700 dark:text-red-400">
          Nota {row.nota}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Gestor: {row.gestorNome} · {new Date(row.data_avaliacao).toLocaleString("pt-BR")}
      </p>
      {row.comentario ? <p className="text-[11px] text-foreground">{row.comentario}</p> : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 w-fit text-[11px]"
        onClick={() => onOpenClient(row.cliente_id)}
      >
        Abrir perfil do cliente
      </Button>
    </li>
  );
}
