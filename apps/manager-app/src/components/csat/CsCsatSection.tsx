import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CsGestorItem } from "@/hooks/useCsGestores";
import {
  csatAvg,
  csatByGestor,
  csatEvolutionSeries,
  detectCsatDrops,
  formatMesRef,
  type CsatAvaliacaoEnriched,
  useCsatDashboard,
} from "@/hooks/useCsatDashboard";

type CsCsatSectionProps = {
  restrictToGestorIds: string[] | null;
  enabled: boolean;
  gestoresFlat: CsGestorItem[];
  onOpenClient: (clienteId: string) => void;
};

export default function CsCsatSection({
  restrictToGestorIds,
  enabled,
  gestoresFlat,
  onOpenClient,
}: CsCsatSectionProps) {
  const { data: rows = [], isLoading, error } = useCsatDashboard(enabled, restrictToGestorIds);

  const [gestorFilter, setGestorFilter] = useState<string>("all");
  const [mesFilter, setMesFilter] = useState<string>("all");

  const mesOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.mes_referencia.slice(0, 10)));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [rows]);

  const gestorNomeMap = useMemo(() => {
    const m = new Map<string, string>();
    gestoresFlat.forEach((g) => m.set(g.gestorId, g.gestorNome));
    rows.forEach((r) => {
      if (!m.has(r.gestor_id)) m.set(r.gestor_id, r.gestorNome);
    });
    return m;
  }, [gestoresFlat, rows]);

  const filteredByGestor = useMemo(() => {
    if (gestorFilter === "all") return rows;
    return rows.filter((r) => r.gestor_id === gestorFilter);
  }, [rows, gestorFilter]);

  const filteredFull = useMemo(() => {
    if (mesFilter === "all") return filteredByGestor;
    return filteredByGestor.filter((r) => r.mes_referencia.slice(0, 10) === mesFilter);
  }, [filteredByGestor, mesFilter]);

  const teamAvg = useMemo(() => csatAvg(filteredFull), [filteredFull]);
  const byGestor = useMemo(() => csatByGestor(filteredFull, gestorNomeMap), [filteredFull, gestorNomeMap]);
  const evolution = useMemo(() => csatEvolutionSeries(filteredByGestor), [filteredByGestor]);
  const drops = useMemo(() => detectCsatDrops(filteredByGestor), [filteredByGestor]);
  const baixas = useMemo(
    () =>
      filteredFull
        .filter((r) => r.nota <= 2)
        .sort((a, b) => new Date(b.data_avaliacao).getTime() - new Date(a.data_avaliacao).getTime()),
    [filteredFull],
  );

  if (!enabled) return null;

  if (isLoading) {
    return (
      <Card className="rounded-xl border-border/80 bg-white/95 shadow-nubank dark:border-border dark:bg-card">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Carregando CSAT…
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="rounded-xl border-destructive/40 bg-white/95 dark:bg-card">
        <CardContent className="py-8 text-center text-sm text-destructive">
          {error instanceof Error ? error.message : "Erro ao carregar CSAT."}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-xl border-border/80 bg-white/95 shadow-nubank dark:border-border dark:bg-card">
      <CardHeader className="pb-2 pt-4">
        <p className="text-sm font-semibold text-foreground">Satisfação mensal (CSAT)</p>
        <p className="text-xs text-muted-foreground">
          Médias e evolução por mês de referência. Dados limitados pela sua visão no Supabase (RLS).
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
            <p className="text-[11px] font-medium text-muted-foreground">Mês de referência</p>
            <Select value={mesFilter} onValueChange={setMesFilter}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os meses</SelectItem>
                {mesOptions.map((m) => (
                  <SelectItem key={m} value={m}>
                    {formatMesRef(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              CSAT médio (filtro)
            </p>
            <p className="text-lg font-bold tabular-nums text-foreground">
              {teamAvg === null ? "—" : teamAvg.toFixed(2)}
            </p>
            <p className="text-[10px] text-muted-foreground">Escala 1–5</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Avaliações (filtro)
            </p>
            <p className="text-lg font-bold tabular-nums text-foreground">{filteredFull.length}</p>
          </div>
        </div>

        {byGestor.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              CSAT médio por gestor
            </p>
            <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-border/60 p-2">
              {byGestor.map((g) => (
                <div
                  key={g.gestorId}
                  className="flex items-center justify-between gap-2 rounded-md bg-muted/30 px-2 py-1.5 text-xs"
                >
                  <span className="min-w-0 truncate font-medium">{g.gestorNome}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    n={g.count}
                    {g.avg !== null ? ` · ∅ ${g.avg.toFixed(2)}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Evolução mensal (média da equipe no filtro de gestor)
          </p>
          {evolution.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem dados para o gráfico.</p>
          ) : (
            <ChartContainer
              config={{
                csat: { label: "CSAT médio", color: "hsl(292 88% 42%)" },
              }}
              className="h-52 w-full"
            >
              <LineChart data={evolution} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/50" />
                <XAxis
                  dataKey="mesLabel"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  className="text-[10px]"
                />
                <YAxis
                  domain={[1, 5]}
                  width={28}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals
                  className="text-[10px]"
                />
                <ChartTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as { mesLabel: string; avg: number; n: number };
                    return (
                      <div className="rounded-md border border-border bg-background px-2 py-1.5 text-xs shadow-md">
                        <p className="font-medium">{p.mesLabel}</p>
                        <p className="text-muted-foreground">Média: {p.avg.toFixed(2)}</p>
                        <p className="text-muted-foreground">Respostas: {p.n}</p>
                      </div>
                    );
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="avg"
                  stroke="hsl(292 88% 42%)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="CSAT"
                />
              </LineChart>
            </ChartContainer>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">
            Clientes com nota ≤ 2
          </p>
          {baixas.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum no filtro atual.</p>
          ) : (
            <ul className="max-h-40 space-y-2 overflow-y-auto">
              {baixas.map((r) => (
                <BaixaRow key={r.id} row={r} onOpenClient={onOpenClient} />
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
            Queda de satisfação (último mês vs. anterior, mesmo par cliente–gestor)
          </p>
          {drops.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma queda relevante no período filtrado por gestor.</p>
          ) : (
            <ul className="max-h-44 space-y-2 overflow-y-auto">
              {drops.map((d) => (
                <li
                  key={`${d.clienteId}-${d.gestorId}-${d.mesAtual}`}
                  className="rounded-lg border border-amber-200/80 bg-amber-50/60 px-2 py-2 text-xs dark:border-amber-900/40 dark:bg-amber-950/25"
                >
                  <button
                    type="button"
                    className="text-left font-semibold text-[#8A05BE] underline-offset-2 hover:underline"
                    onClick={() => onOpenClient(d.clienteId)}
                  >
                    {d.clienteNome}
                  </button>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {d.gestorNome}: {d.notaAnterior} → {d.notaAtual} ({d.mesAnterior} → {d.mesAtual})
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2 h-7 text-[11px]"
                    onClick={() => onOpenClient(d.clienteId)}
                  >
                    Abrir perfil
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function BaixaRow({
  row,
  onOpenClient,
}: {
  row: CsatAvaliacaoEnriched;
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
          {formatMesRef(row.mes_referencia)} · {row.nota}/5
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground">Gestor: {row.gestorNome}</p>
      {row.comentario ? <p className="text-[11px] text-foreground">{row.comentario}</p> : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 w-fit text-[11px]"
        onClick={() => onOpenClient(row.cliente_id)}
      >
        Abrir perfil
      </Button>
    </li>
  );
}
