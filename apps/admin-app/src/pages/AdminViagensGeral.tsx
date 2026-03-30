import { useEffect, useMemo, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdminEquipe } from "@/context/AdminEquipeContext";
import {
  formatSupabaseError,
  listPerfis,
  listViagens,
  markViagemMensagemEnviada,
  updateViagemStatus,
  type Viagem,
  type ViagemStatus,
} from "@/lib/adminApi";

type DateFilter = "hoje" | "semana" | "mes";
type MsgTipo = "pre_viagem" | "chegada" | "pos_viagem";

const EQUIPE_ALL = "__all__";
const EQUIPE_NONE = "__none__";

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function mondayOfWeek(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfWeek(d: Date): Date {
  const m = mondayOfWeek(d);
  const e = new Date(m);
  e.setDate(m.getDate() + 6);
  e.setHours(23, 59, 59, 999);
  return e;
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function computeStatus(v: Viagem, todayISO: string): ViagemStatus {
  if (v.status === "chegada_confirmada") return "chegada_confirmada";
  if (v.status === "finalizada") return "finalizada";
  if (todayISO < v.data_ida) return "planejada";
  if (todayISO > v.data_volta) return "finalizada";
  return "em_andamento";
}

function statusBadge(status: ViagemStatus): { label: string; className: string } {
  if (status === "planejada") return { label: "🟡 planejada", className: "bg-amber-50 text-amber-700 border-amber-200" };
  if (status === "em_andamento") return { label: "🔵 em viagem", className: "bg-blue-50 text-blue-700 border-blue-200" };
  if (status === "chegada_confirmada") return { label: "🟢 chegada confirmada", className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  return { label: "⚫ finalizada", className: "bg-zinc-100 text-zinc-700 border-zinc-300" };
}

export default function AdminViagensGeralPage() {
  const { equipes } = useAdminEquipe();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viagens, setViagens] = useState<Viagem[]>([]);
  const [clienteNomeById, setClienteNomeById] = useState<Record<string, string>>({});
  const [destinoSearch, setDestinoSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("semana");
  const [equipeFilter, setEquipeFilter] = useState<string>(EQUIPE_ALL);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);

  const today = new Date();
  const todayISO = toISODate(today);

  const equipeNomeById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const e of equipes) map[e.id] = e.nome;
    return map;
  }, [equipes]);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listViagens({ destino: destinoSearch });
      setViagens(rows);
      const perfis = await listPerfis();
      const map: Record<string, string> = {};
      for (const p of perfis) map[p.usuario_id] = p.nome_completo ?? p.usuario_id;
      setClienteNomeById(map);
    } catch (e) {
      setError(formatSupabaseError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const id = setInterval(() => {
      void refresh();
    }, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinoSearch]);

  const filtradasEquipe = useMemo(() => {
    if (equipeFilter === EQUIPE_ALL) return viagens;
    if (equipeFilter === EQUIPE_NONE) return viagens.filter((v) => !v.equipe_id);
    return viagens.filter((v) => v.equipe_id === equipeFilter);
  }, [viagens, equipeFilter]);

  const viagensFiltradasData = useMemo(() => {
    const t = new Date();
    const startISO = toISODate(t);
    const startWeekISO = toISODate(mondayOfWeek(t));
    const endWeekISO = toISODate(endOfWeek(t));
    const endMonthISO = toISODate(endOfMonth(t));
    return filtradasEquipe.filter((v) => {
      if (dateFilter === "hoje") return v.data_ida === startISO || (v.data_ida <= startISO && v.data_volta >= startISO);
      if (dateFilter === "semana") return v.data_ida >= startWeekISO && v.data_ida <= endWeekISO;
      return v.data_ida >= startISO.slice(0, 8) + "01" && v.data_ida <= endMonthISO;
    });
  }, [filtradasEquipe, dateFilter]);

  const normalized = useMemo(
    () =>
      viagensFiltradasData.map((v) => ({
        ...v,
        computedStatus: computeStatus(v, todayISO),
        clienteNome: clienteNomeById[v.cliente_id] ?? v.cliente_id,
        equipeNome: v.equipe_id ? (equipeNomeById[v.equipe_id] ?? v.equipe_id) : "Sem gestão",
      })),
    [viagensFiltradasData, todayISO, clienteNomeById, equipeNomeById],
  );

  const groupedByDate = useMemo(() => {
    const map: Record<string, typeof normalized> = {};
    for (const v of normalized) {
      const key = v.data_ida;
      if (!map[key]) map[key] = [];
      map[key].push(v);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [normalized]);

  const resumo = useMemo(() => {
    const hoje = todayISO;
    const viajandoHoje = normalized.filter((v) => v.data_ida === hoje).length;
    const emViagemAgora = normalized.filter((v) => v.computedStatus === "em_andamento").length;
    const proximosEmbarques = normalized.filter((v) => v.data_ida > hoje).length;
    const finalizadas = normalized.filter((v) => v.computedStatus === "finalizada").length;
    return { viajandoHoje, emViagemAgora, proximosEmbarques, finalizadas };
  }, [normalized, todayISO]);

  const destinoAgg = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of normalized) {
      const key = `${v.data_ida}::${v.destino}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([key, count]) => {
        const [date, destino] = key.split("::");
        return { date, destino, count };
      })
      .sort((a, b) => a.date.localeCompare(b.date) || b.count - a.count);
  }, [normalized]);

  const handleStatus = async (viagemId: string, status: ViagemStatus) => {
    setStatusSavingId(viagemId);
    setError(null);
    try {
      await updateViagemStatus({ viagemId, status });
      await refresh();
    } catch (e) {
      setError(formatSupabaseError(e));
    } finally {
      setStatusSavingId(null);
    }
  };

  const handleMsg = async (viagemId: string, tipo: MsgTipo) => {
    setSendingId(viagemId);
    setError(null);
    try {
      await markViagemMensagemEnviada({ viagemId, tipo });
      await refresh();
    } catch (e) {
      setError(formatSupabaseError(e));
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Viagens Gerais</CardTitle>
          <CardDescription>Monitoramento de viagens de todos os clientes, com e sem gestão.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium">Equipe</label>
              <Select value={equipeFilter} onValueChange={setEquipeFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={EQUIPE_ALL}>Todas as equipes</SelectItem>
                  <SelectItem value={EQUIPE_NONE}>Sem gestão</SelectItem>
                  {equipes.map((eq) => (
                    <SelectItem key={eq.id} value={eq.id}>
                      {eq.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Período</label>
              <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hoje">hoje</SelectItem>
                  <SelectItem value="semana">essa semana</SelectItem>
                  <SelectItem value="mes">esse mês</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Destino</label>
              <Input value={destinoSearch} onChange={(e) => setDestinoSearch(e.target.value)} placeholder="Pesquisar destino..." />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <SummaryCard title="Clientes embarcando hoje" value={resumo.viajandoHoje} />
            <SummaryCard title="Clientes em viagem agora" value={resumo.emViagemAgora} />
            <SummaryCard title="Próximos embarques" value={resumo.proximosEmbarques} />
            <SummaryCard title="Viagens finalizadas" value={resumo.finalizadas} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Linha do tempo</CardTitle>
          <CardDescription>Viagens agrupadas por data de ida.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? <p className="text-sm text-muted-foreground">Carregando viagens...</p> : null}
          {!loading && groupedByDate.length === 0 ? <p className="text-sm text-muted-foreground">Sem viagens no filtro atual.</p> : null}
          {groupedByDate.map(([date, items]) => (
            <div key={date} className="rounded-md border p-3">
              <div className="mb-2 text-sm font-semibold">{date}</div>
              <div className="space-y-2">
                {items.map((v) => {
                  const b = statusBadge(v.computedStatus);
                  return (
                    <div key={v.id} className="rounded-md border bg-card p-3">
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                        <div className="font-medium">{v.clienteNome}</div>
                        <span className={`rounded-full border px-2 py-0.5 text-xs ${b.className}`}>{b.label}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {v.equipeNome} · {v.destino} · {v.qtd_passageiros} pessoas · {v.data_ida} → {v.data_volta}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={statusSavingId === v.id}
                          onClick={() => void handleStatus(v.id, "chegada_confirmada")}
                        >
                          Confirmar chegada
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={statusSavingId === v.id}
                          onClick={() => void handleStatus(v.id, "finalizada")}
                        >
                          Confirmar retorno
                        </Button>
                        <Select onValueChange={(x) => void handleMsg(v.id, x as MsgTipo)}>
                          <SelectTrigger className="h-8 w-[170px]"><SelectValue placeholder="Enviar mensagem" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pre_viagem" disabled={sendingId === v.id}>Pré-viagem</SelectItem>
                            <SelectItem value="chegada" disabled={sendingId === v.id}>Chegada</SelectItem>
                            <SelectItem value="pos_viagem" disabled={sendingId === v.id}>Pós-viagem</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alertas inteligentes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <AlertLine label="Hoje" text={`Clientes embarcando hoje: ${resumo.viajandoHoje}`} />
          <AlertLine label="Durante viagem" text={`Clientes em viagem agora: ${resumo.emViagemAgora}`} />
          <AlertLine label="Chegada" text="Verifique pendências de confirmação de chegada." />
          <AlertLine label="Retorno" text="Verifique pendências de confirmação de retorno." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agregado por data e destino</CardTitle>
          <CardDescription>Ex.: 28/03 → 5 clientes indo para Miami.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {destinoAgg.length === 0 ? (
            <p className="text-muted-foreground">Sem agregações para o filtro atual.</p>
          ) : (
            destinoAgg.slice(0, 20).map((r) => <p key={`${r.date}-${r.destino}`}>{r.date} → {r.count} clientes para {r.destino}</p>)
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function AlertLine({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-md border p-2">
      <strong>{label}: </strong>
      <span>{text}</span>
    </div>
  );
}
