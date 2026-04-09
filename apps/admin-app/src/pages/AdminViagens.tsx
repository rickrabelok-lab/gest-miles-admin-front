import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";

import { getStatusViagem, groupViagensByDestino, groupViagensTimelineByDataIda } from "@gest-miles/core";
import { listViagensDashboard, type ViagemDashboardItem } from "@gest-miles/services";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatSupabaseError } from "@/lib/adminApi";

const AdminViagensRadarMap = lazy(() => import("@/components/admin/AdminViagensRadarMap"));

type TipoUsuarioFiltro = "todos" | "clientes" | "clientes_gestao";
type MapaStatusFiltro = "todas" | "planejada" | "em_andamento" | "finalizada";

function ymd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function statusLabel(status: "planejada" | "em_andamento" | "finalizada"): string {
  if (status === "em_andamento") return "em andamento";
  if (status === "finalizada") return "finalizada";
  return "planejada";
}

export default function AdminViagensPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ViagemDashboardItem[]>([]);
  const [tipoUsuario, setTipoUsuario] = useState<TipoUsuarioFiltro>("todos");
  const [equipeFilter, setEquipeFilter] = useState<string>("all");
  const [gestorFilter, setGestorFilter] = useState<string>("all");
  const [destinoFilter, setDestinoFilter] = useState("");
  const [periodoInicio, setPeriodoInicio] = useState("");
  const [periodoFim, setPeriodoFim] = useState("");
  const [mapaStatusFiltro, setMapaStatusFiltro] = useState<MapaStatusFiltro>("todas");

  const hoje = ymd(new Date());

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await listViagensDashboard({
          equipeId: equipeFilter !== "all" ? equipeFilter : undefined,
          gestorId: gestorFilter !== "all" ? gestorFilter : undefined,
          tipoUsuario,
          periodoInicio: periodoInicio || undefined,
          periodoFim: periodoFim || undefined,
          destino: destinoFilter || undefined,
        });
        if (mounted) setRows(data);
      } catch (e) {
        if (mounted) setError(formatSupabaseError(e));
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [tipoUsuario, equipeFilter, gestorFilter, destinoFilter, periodoInicio, periodoFim]);

  const enriched = useMemo(() => {
    return rows.map((v) => {
      const status = getStatusViagem({ data_ida: v.data_ida, data_volta: v.data_volta });
      return {
        ...v,
        status,
        viagemHoje: v.data_ida === hoje,
        chegadaHoje: v.data_ida === hoje,
        retornoHoje: v.data_volta === hoje,
      };
    });
  }, [rows, hoje]);

  const proximos7Dias = useMemo(() => {
    const limite = ymd(addDays(new Date(), 7));
    return enriched.filter((v) => v.data_ida >= hoje && v.data_ida <= limite);
  }, [enriched, hoje]);

  const emAndamento = useMemo(() => enriched.filter((v) => v.status === "em_andamento"), [enriched]);
  const viagensMapa = useMemo(() => {
    if (mapaStatusFiltro === "todas") return enriched;
    return enriched.filter((v) => v.status === mapaStatusFiltro);
  }, [enriched, mapaStatusFiltro]);
  const porDestino = useMemo(() => groupViagensByDestino(enriched), [enriched]);
  const timeline = useMemo(() => groupViagensTimelineByDataIda(enriched), [enriched]);

  const equipes = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      if (row.equipe_id) map.set(row.equipe_id, row.equipe_id);
    }
    return [...map.entries()].map(([id, nome]) => ({ id, nome }));
  }, [rows]);

  const gestores = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      if (row.gestor_id && row.gestor_nome) map.set(row.gestor_id, row.gestor_nome);
    }
    return [...map.entries()].map(([id, nome]) => ({ id, nome }));
  }, [rows]);

  const clientesEmViagemHoje = useMemo(() => new Set(enriched.filter((v) => v.status === "em_andamento").map((v) => v.cliente_id)).size, [enriched]);
  const totalPassageiros = useMemo(() => enriched.reduce((sum, v) => sum + v.passageiros, 0), [enriched]);
  const destinoMaisFrequente = porDestino[0]?.destino ?? "N/A";
  const chegadasHoje = useMemo(() => enriched.filter((v) => v.chegadaHoje).length, [enriched]);
  const retornosHoje = useMemo(() => enriched.filter((v) => v.retornoHoje).length, [enriched]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Viagens</CardTitle>
          <CardDescription>Radar operacional de viagens com a estrutura Gest Miles.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="grid gap-3 md:grid-cols-5">
            <div>
              <label className="mb-1 block text-xs font-medium">Tipo usuário</label>
              <Select value={tipoUsuario} onValueChange={(v) => setTipoUsuario(v as TipoUsuarioFiltro)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">todos</SelectItem>
                  <SelectItem value="clientes">clientes</SelectItem>
                  <SelectItem value="clientes_gestao">clientes_gestao</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Equipe</label>
              <Select value={equipeFilter} onValueChange={setEquipeFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">todas</SelectItem>
                  {equipes.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Gestor</label>
              <Select value={gestorFilter} onValueChange={setGestorFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">todos</SelectItem>
                  {gestores.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Período início</label>
              <Input type="date" value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Período fim</label>
              <Input type="date" value={periodoFim} onChange={(e) => setPeriodoFim(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Destino</label>
            <Input value={destinoFilter} onChange={(e) => setDestinoFilter(e.target.value)} placeholder="IATA, cidade ou nome..." />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard title="Clientes em viagem hoje" value={clientesEmViagemHoje} />
            <SummaryCard title="Próximas viagens (7 dias)" value={proximos7Dias.length} />
            <SummaryCard title="Total passageiros" value={totalPassageiros} />
            <SummaryCard title="Destino mais frequente" value={destinoMaisFrequente} text />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[2fr,1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Radar Map</CardTitle>
            <CardDescription>Mapa principal com rotas, clusters e destaque de status.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative z-50 mb-3 max-w-[280px]">
              <label className="mb-1 block text-xs font-medium">Exibir no mapa</label>
              <Select value={mapaStatusFiltro} onValueChange={(v) => setMapaStatusFiltro(v as MapaStatusFiltro)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="z-[2000]">
                  <SelectItem value="todas">todas</SelectItem>
                  <SelectItem value="planejada">planejadas</SelectItem>
                  <SelectItem value="em_andamento">em andamento</SelectItem>
                  <SelectItem value="finalizada">finalizadas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Suspense fallback={<div className="h-[620px] animate-pulse rounded-md border bg-muted/40" />}>
              <AdminViagensRadarMap
                viagens={viagensMapa.map((v) => ({
                  id: v.id,
                  cliente_nome: v.cliente_nome,
                  origem_iata: v.origem_iata,
                  destino_iata: v.destino_iata,
                  data_ida: v.data_ida,
                  data_volta: v.data_volta,
                  passageiros: v.passageiros,
                  tipo_usuario: v.tipo_usuario,
                  equipe_nome: v.equipe_nome,
                  status: v.status,
                  viagemHoje: v.viagemHoje,
                  chegadaHoje: v.chegadaHoje,
                  retornoHoje: v.retornoHoje,
                  origem: v.aeroporto_origem?.lat != null && v.aeroporto_origem?.lng != null
                    ? {
                        lat: v.aeroporto_origem.lat,
                        lng: v.aeroporto_origem.lng,
                        label: `${v.origem_iata} - ${v.aeroporto_origem.nome}`,
                      }
                    : null,
                  destino: v.aeroporto_destino?.lat != null && v.aeroporto_destino?.lng != null
                    ? {
                        lat: v.aeroporto_destino.lat,
                        lng: v.aeroporto_destino.lng,
                        label: `${v.destino_iata} - ${v.aeroporto_destino.nome}`,
                      }
                    : null,
                }))}
              />
            </Suspense>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <SectionCard title="Destaques do dia" description="Pulse operacional para acompanhamento rápido.">
            <HighlightLine label="Viagens hoje" value={enriched.filter((v) => v.viagemHoje).length} />
            <HighlightLine label="Chegadas hoje" value={chegadasHoje} />
            <HighlightLine label="Retornos hoje" value={retornosHoje} />
          </SectionCard>

          <SectionCard title="1. Em andamento" description="Viagens em curso agora.">
            {emAndamento.length === 0 ? <p className="text-sm text-muted-foreground">Sem viagens em andamento.</p> : null}
            {emAndamento.slice(0, 8).map((v) => (
              <TravelLine key={v.id} v={v} pulse={v.viagemHoje} />
            ))}
          </SectionCard>

          <SectionCard title="2. Próximas viagens" description="Saídas previstas (7 dias).">
            {proximos7Dias.length === 0 ? <p className="text-sm text-muted-foreground">Sem viagens previstas.</p> : null}
            {proximos7Dias.slice(0, 8).map((v) => (
              <TravelLine key={v.id} v={v} pulse={v.viagemHoje} />
            ))}
          </SectionCard>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="3. Por destino" description="Cluster de clientes por destino mais frequente.">
          {porDestino.length === 0 ? <p className="text-sm text-muted-foreground">Sem dados para agrupamento.</p> : null}
          <div className="grid gap-2">
            {porDestino.slice(0, 12).map((item) => (
              <div key={item.destino} className="rounded-md border p-3 text-sm">
                <div className="font-semibold">{item.destino}</div>
                <div className="text-muted-foreground">{item.clientes} clientes · {item.passageiros} passageiros</div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="4. Timeline" description="Sequência por data para leitura de operação.">
          {loading ? <p className="text-sm text-muted-foreground">Carregando...</p> : null}
          {!loading && timeline.length === 0 ? <p className="text-sm text-muted-foreground">Sem viagens no filtro atual.</p> : null}
          <div className="space-y-3">
            {timeline.slice(0, 12).map((group) => (
              <div key={group.data} className="rounded-md border p-3">
                <div className="mb-2 text-sm font-semibold">{group.data}</div>
                <div className="space-y-2">
                  {group.itens.map((v) => (
                    <TravelLine key={v.id} v={v} pulse={v.viagemHoje || v.chegadaHoje || v.retornoHoje} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Legenda de status" description="Cores padronizadas no mapa e listas.">
        <div className="grid gap-2 md:grid-cols-3">
          <LegendPill label="Planejada" color="bg-zinc-400" />
          <LegendPill label="Em andamento" color="bg-violet-600" />
          <LegendPill label="Finalizada" color="bg-emerald-600" />
        </div>
      </SectionCard>
    </div>
  );
}

function SummaryCard({ title, value, text = false }: { title: string; value: number | string; text?: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={text ? "text-base font-semibold" : "text-2xl font-bold"}>{value}</div>
      </CardContent>
    </Card>
  );
}

function SectionCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">{children}</CardContent>
    </Card>
  );
}

function TravelLine({
  v,
  pulse,
}: {
  v: ViagemDashboardItem & {
    status: "planejada" | "em_andamento" | "finalizada";
    viagemHoje: boolean;
    chegadaHoje: boolean;
    retornoHoje: boolean;
  };
  pulse?: boolean;
}) {
  return (
    <div className={`rounded-md border p-3 text-sm ${pulse ? "animate-pulse border-purple-300" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold">{v.cliente_nome}</div>
        <span className="text-xs text-muted-foreground">{statusLabel(v.status)}</span>
      </div>
      <div className="text-muted-foreground">
        {v.origem_iata} -&gt; {v.destino_iata} · {v.data_ida} a {v.data_volta} · {v.passageiros} passageiros
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {v.aeroporto_origem?.cidade ?? "Origem n/d"} - {v.aeroporto_destino?.cidade ?? "Destino n/d"} · gestor: {v.gestor_nome ?? "n/d"}
      </div>
    </div>
  );
}

function HighlightLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-md border p-2 text-sm">
      <span>{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function LegendPill({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span>{label}</span>
    </div>
  );
}

