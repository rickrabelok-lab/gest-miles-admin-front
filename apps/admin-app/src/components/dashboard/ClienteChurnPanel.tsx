import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  assinaturaPermiteAcesso,
  formatSupabaseError,
  getNegocioDashboardSnapshot,
  listAssinaturasNegocio,
  updateAssinaturaMotivoChurn,
  type AssinaturaRow,
  type NegocioDashboardSnapshot,
} from "@/lib/adminApi";

function todayYmdLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function diasRestantes(dataFim: string): number | null {
  const hoje = todayYmdLocal();
  if (!dataFim || dataFim < hoje) return null;
  const a = new Date(`${hoje}T12:00:00`);
  const b = new Date(`${dataFim}T12:00:00`);
  return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function pctFmt(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${v.toFixed(1)}%`;
}

export function ClienteChurnPanel() {
  const [snap, setSnap] = useState<NegocioDashboardSnapshot | null>(null);
  const [assinaturas, setAssinaturas] = useState<AssinaturaRow[]>([]);
  const [filtroStatus, setFiltroStatus] = useState<string>("__all__");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, rows] = await Promise.all([
        getNegocioDashboardSnapshot(),
        listAssinaturasNegocio({
          status: filtroStatus === "__all__" ? null : filtroStatus,
        }),
      ]);
      setSnap(s);
      setAssinaturas(rows);
    } catch (e) {
      setError(formatSupabaseError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroStatus]);

  const hoje = todayYmdLocal();

  const rowsComDias = useMemo(
    () =>
      assinaturas.map((a) => ({
        ...a,
        dias: diasRestantes(a.data_fim),
        acessoOk: assinaturaPermiteAcesso(a.status, a.data_fim, hoje),
      })),
    [assinaturas, hoje],
  );

  const motivosChartData = useMemo(
    () =>
      (snap?.churnMotivos ?? []).map((m) => ({
        motivo: m.motivo.length > 48 ? `${m.motivo.slice(0, 45)}…` : m.motivo,
        total: m.count,
      })),
    [snap?.churnMotivos],
  );

  return (
    <div id="dashboard-assinaturas" className="scroll-mt-4 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Clientes, churn e assinaturas</CardTitle>
          <CardDescription>
            Métricas de retenção, motivos de saída (assinaturas tipo cliente) e listagem. Execute{" "}
            <code className="text-xs">sql/assinaturas.sql</code> no Supabase se a tabela não existir; a coluna{" "}
            <code className="text-xs">motivo_churn</code> é opcional (migração no mesmo ficheiro).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {!snap?.assinaturasDisponivel && !loading ? (
            <p className="text-sm text-muted-foreground">
              Tabela <code className="text-xs">assinaturas</code> ainda não existe — execute <code className="text-xs">sql/assinaturas.sql</code> no
              Supabase.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi title="Clientes na base (perfis)" value={snap?.clientesNaBase ?? "—"} loading={loading} />
        <Kpi title="Clientes com assinatura ativa" value={snap?.clientesAtivos ?? "—"} loading={loading} />
        <Kpi title="Assinaturas cliente ativas" value={snap?.assinaturasClienteAtivas ?? "—"} loading={loading} />
        <Kpi title="Assinaturas cliente inativas" value={snap?.assinaturasClienteInativas ?? "—"} loading={loading} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi title="Equipes com assinatura ativa" value={snap?.equipesAtivas ?? "—"} loading={loading} />
        <Kpi title="Assinaturas ativas / trial (todas)" value={snap?.assinaturasAtivas ?? "—"} loading={loading} />
        <Kpi title="Assinaturas vencidas (todas)" value={snap?.assinaturasVencidas ?? "—"} loading={loading} />
        <Kpi
          title="Retenção (assinaturas cliente)"
          value={pctFmt(snap?.retencaoAssinaturasClientesPct ?? null)}
          subtitle="% com acesso entre linhas tipo cliente"
          loading={loading}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Kpi
          title="Saída (assinaturas cliente)"
          value={pctFmt(snap?.saidaAssinaturasClientesPct ?? null)}
          subtitle="% sem acesso no mesmo conjunto"
          loading={loading}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Churn (cancelamentos / vencimentos)</CardTitle>
            <CardDescription>Por mês: cancelamentos explícitos ou vencimento por data fim.</CardDescription>
          </CardHeader>
          <CardContent>
            {!snap?.assinaturasDisponivel ? (
              <p className="text-sm text-muted-foreground">Sem dados.</p>
            ) : (
              <ChartContainer className="h-[260px] w-full" config={{ total: { label: "Churn", color: "#ef4444" } }}>
                <BarChart data={snap?.churnPorMes ?? []}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="total" fill="#ef4444" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Motivos de churn (assinatura cliente)</CardTitle>
            <CardDescription>Agrupado por campo motivo_churn; vazio conta como “Sem registo de motivo”.</CardDescription>
          </CardHeader>
          <CardContent>
            {!snap?.assinaturasDisponivel || (snap?.assinaturasClienteInativas ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">Sem assinaturas de cliente inativas para analisar.</p>
            ) : motivosChartData.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem motivos registados.</p>
            ) : (
              <ChartContainer className="h-[260px] w-full" config={{ total: { label: "Ocorrências", color: "#6366f1" } }}>
                <BarChart data={motivosChartData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="motivo" width={200} tick={{ fontSize: 10 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="total" fill="#6366f1" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
          <CardHeader>
            <CardTitle>Crescimento</CardTitle>
            <CardDescription>Novos perfis e novas equipes por mês (requer coluna `created_at`).</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              className="h-[260px] w-full"
              config={{
                usuarios: { label: "Novos utilizadores", color: "#8b5cf6" },
                equipes: { label: "Novas equipes", color: "#06b6d4" },
              }}
            >
              <LineChart
                data={(snap?.novosUsuariosPorMes ?? []).map((u, i) => ({
                  mes: u.mes,
                  usuarios: u.total,
                  equipes: snap?.novasEquipesPorMes[i]?.total ?? 0,
                }))}
              >
                <CartesianGrid vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="usuarios" stroke="var(--color-usuarios)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="equipes" stroke="var(--color-equipes)" strokeWidth={2} dot={false} />
              </LineChart>
            </ChartContainer>
            <p className="mt-2 text-xs text-muted-foreground">
              {!snap?.perfisCreatedAtDisponivel ? "Perfis: created_at não disponível ou vazio. " : null}
              {!snap?.equipesCreatedAtDisponivel ? "Equipes: created_at não disponível ou vazio." : null}
            </p>
          </CardContent>
        </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assinaturas</CardTitle>
          <CardDescription>Listagem com dias restantes, motivo de churn (cliente inativo) e filtro por estado.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs">
            <label className="mb-1 block text-xs font-medium">Status</label>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                <SelectItem value="ativa">ativa</SelectItem>
                <SelectItem value="trial">trial</SelectItem>
                <SelectItem value="vencida">vencida</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="overflow-x-auto rounded-[14px] border border-nubank-border bg-white">
            <table className="w-full min-w-[960px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-nubank-border text-left font-medium uppercase tracking-wide text-nubank-text-secondary">
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Referência</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Início</th>
                  <th className="px-3 py-2">Fim</th>
                  <th className="px-3 py-2">Dias restantes</th>
                  <th className="px-3 py-2">Acesso</th>
                  <th className="px-3 py-2">Motivo churn</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-4 text-muted-foreground">
                      A carregar…
                    </td>
                  </tr>
                ) : rowsComDias.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-4 text-muted-foreground">
                      Nenhuma assinatura no filtro.
                    </td>
                  </tr>
                ) : (
                  rowsComDias.map((r) => (
                    <tr key={r.id} className="border-t border-nubank-border align-top text-nubank-text">
                      <td className="px-3 py-2">{r.tipo}</td>
                      <td className="px-3 py-2 font-mono text-[11px]">{r.referencia_id}</td>
                      <td className="px-3 py-2">{r.status}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.data_inicio}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.data_fim}</td>
                      <td className="px-3 py-2">{r.dias == null ? "—" : r.dias}</td>
                      <td className="px-3 py-2">{r.acessoOk ? "Permitido" : "Bloqueado"}</td>
                      <MotivoChurnCell row={r} onSaved={() => void load()} />
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MotivoChurnCell({
  row,
  onSaved,
}: {
  row: AssinaturaRow & { dias: number | null; acessoOk: boolean };
  onSaved: () => void;
}) {
  const canEdit = row.tipo === "cliente" && !row.acessoOk;
  const [val, setVal] = useState(row.motivo_churn ?? "");
  const [busy, setBusy] = useState(false);
  const [cellErr, setCellErr] = useState<string | null>(null);

  useEffect(() => {
    setVal(row.motivo_churn ?? "");
    setCellErr(null);
  }, [row.id, row.motivo_churn]);

  if (!canEdit) {
    return <td className="px-3 py-2 max-w-[200px]">{row.motivo_churn?.trim() ? row.motivo_churn : "—"}</td>;
  }

  return (
    <td className="px-3 py-2 min-w-[220px]">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center">
        <Input
          className="h-8 text-[11px]"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="Ex.: preço, produto, suporte…"
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-8 shrink-0"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setCellErr(null);
            try {
              await updateAssinaturaMotivoChurn({ id: row.id, motivo_churn: val.trim() === "" ? null : val });
              onSaved();
            } catch (e) {
              setCellErr(formatSupabaseError(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "…" : "Guardar"}
        </Button>
      </div>
      {cellErr ? <p className="mt-1 text-[10px] text-destructive">{cellErr}</p> : null}
    </td>
  );
}

function Kpi({
  title,
  value,
  loading,
  subtitle,
}: {
  title: string;
  value: number | string;
  subtitle?: string;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{loading ? "…" : value}</div>
      </CardContent>
    </Card>
  );
}
