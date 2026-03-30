import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  createFinanceiroLancamento,
  formatSupabaseError,
  listEquipes,
  listFinanceiroLancamentos,
  listPerfis,
  type Equipe,
  type FinanceiroCategoria,
  type FinanceiroCategoriaDespesa,
  type FinanceiroCategoriaReceita,
  type FinanceiroTipo,
  type Perfil,
} from "@/lib/adminApi";

const RECEITA_CATEGORIAS: FinanceiroCategoriaReceita[] = ["assinatura_equipe", "assinatura_cliente", "agencia_viagens"];
const DESPESA_CATEGORIAS: FinanceiroCategoriaDespesa[] = ["marketing", "ferramentas", "equipe", "infraestrutura"];
const PIE_COLORS = ["#8b5cf6", "#06b6d4", "#22c55e"];
const BAR_COLOR = "#f97316";
const CATEGORIA_LABEL: Record<FinanceiroCategoria, string> = {
  assinatura_equipe: "Servico para gestao B2B",
  assinatura_cliente: "Servico para cliente final",
  agencia_viagens: "Servico para agencia de viagens",
  marketing: "Marketing",
  ferramentas: "Ferramentas",
  equipe: "Equipe",
  infraestrutura: "Infraestrutura",
};

function brl(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

type Periodo = "mes" | "ano";

export function FinanceiroPanel() {
  const now = useMemo(() => new Date(), []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listFinanceiroLancamentos>>>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1).padStart(2, "0"));
  const [equipeFilter, setEquipeFilter] = useState("__all__");
  const [openNew, setOpenNew] = useState(false);
  const [form, setForm] = useState({
    tipo: "receita" as FinanceiroTipo,
    categoria: "assinatura_equipe" as FinanceiroCategoria,
    valor: "",
    data: new Date().toISOString().slice(0, 10),
    descricao: "",
    equipe_id: "__none__",
    usuario_id: "__none__",
    qtd_cs: "",
    qtd_clientes: "",
    qtd_gestores: "",
    preco_medio_cs: "",
    preco_medio_clientes: "",
    preco_medio_gestores: "",
  });

  const clienteNomeById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of perfis) map[p.usuario_id] = p.nome_completo ?? p.usuario_id;
    return map;
  }, [perfis]);

  const equipeNomeById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const e of equipes) map[e.id] = e.nome;
    return map;
  }, [equipes]);

  const years = useMemo(() => {
    const current = now.getFullYear();
    return Array.from({ length: 6 }).map((_, i) => String(current - i));
  }, [now]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const y = Number(year);
      const m = Number(month);
      const [lancamentos, eqs, pfs] = await Promise.all([
        listFinanceiroLancamentos({
          equipeId: equipeFilter === "__all__" ? null : equipeFilter === "__none__" ? null : equipeFilter,
          year: Number.isFinite(y) ? y : null,
          month: periodo === "mes" && Number.isFinite(m) ? m : null,
        }),
        listEquipes(),
        listPerfis(),
      ]);
      const filteredByNone =
        equipeFilter === "__none__" ? lancamentos.filter((x) => !x.equipe_id) : lancamentos;
      setRows(filteredByNone);
      setEquipes(eqs);
      setPerfis(pfs);
    } catch (e) {
      setError(formatSupabaseError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo, year, month, equipeFilter]);

  const receitaTotal = useMemo(() => rows.filter((r) => r.tipo === "receita").reduce((acc, cur) => acc + cur.valor, 0), [rows]);
  const despesaTotal = useMemo(() => rows.filter((r) => r.tipo === "despesa").reduce((acc, cur) => acc + cur.valor, 0), [rows]);
  const lucro = receitaTotal - despesaTotal;
  const margem = receitaTotal > 0 ? (lucro / receitaTotal) * 100 : 0;

  const lineData = useMemo(() => {
    const map = new Map<string, { month: string; receita: number; despesa: number }>();
    for (const r of rows) {
      const key = r.data.slice(0, 7);
      if (!map.has(key)) map.set(key, { month: key, receita: 0, despesa: 0 });
      const item = map.get(key)!;
      if (r.tipo === "receita") item.receita += r.valor;
      else item.despesa += r.valor;
    }
    return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
  }, [rows]);

  const receitaPorFonte = useMemo(
    () =>
      RECEITA_CATEGORIAS.map((cat) => ({
        categoria: cat,
        valor: rows.filter((r) => r.tipo === "receita" && r.categoria === cat).reduce((acc, cur) => acc + cur.valor, 0),
      })),
    [rows],
  );

  const despesaPorCategoria = useMemo(
    () =>
      DESPESA_CATEGORIAS.map((cat) => ({
        categoria: cat,
        valor: rows.filter((r) => r.tipo === "despesa" && r.categoria === cat).reduce((acc, cur) => acc + cur.valor, 0),
      })),
    [rows],
  );

  const topReceitaEquipe = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      if (r.tipo !== "receita") continue;
      const key = r.equipe_id ?? "__none__";
      map.set(key, (map.get(key) ?? 0) + r.valor);
    }
    return [...map.entries()]
      .map(([id, total]) => ({ id, nome: id === "__none__" ? "Sem gestão" : (equipeNomeById[id] ?? id), total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [rows, equipeNomeById]);

  const receitaB2BPorEmpresa = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      if (r.tipo !== "receita" || r.categoria !== "assinatura_equipe") continue;
      const key = r.equipe_id ?? "__none__";
      map.set(key, (map.get(key) ?? 0) + r.valor);
    }
    return [...map.entries()]
      .map(([id, total]) => ({
        id,
        empresa: id === "__none__" ? "Sem empresa B2B vinculada" : (equipeNomeById[id] ?? id),
        total,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);
  }, [rows, equipeNomeById]);

  const topReceitaCliente = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      if (r.tipo !== "receita" || !r.usuario_id) continue;
      map.set(r.usuario_id, (map.get(r.usuario_id) ?? 0) + r.valor);
    }
    return [...map.entries()]
      .map(([id, total]) => ({ id, nome: clienteNomeById[id] ?? id, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [rows, clienteNomeById]);

  const categoriasForm = form.tipo === "receita" ? RECEITA_CATEGORIAS : DESPESA_CATEGORIAS;
  const isReceitaB2B = form.tipo === "receita" && form.categoria === "assinatura_equipe";
  const b2bCalc = useMemo(() => {
    const qtdCs = Number(form.qtd_cs || 0);
    const qtdClientes = Number(form.qtd_clientes || 0);
    const qtdGestores = Number(form.qtd_gestores || 0);
    const precoCs = Number(form.preco_medio_cs || 0);
    const precoClientes = Number(form.preco_medio_clientes || 0);
    const precoGestores = Number(form.preco_medio_gestores || 0);
    const total = qtdCs * precoCs + qtdClientes * precoClientes + qtdGestores * precoGestores;
    return { qtdCs, qtdClientes, qtdGestores, precoCs, precoClientes, precoGestores, total };
  }, [
    form.qtd_cs,
    form.qtd_clientes,
    form.qtd_gestores,
    form.preco_medio_cs,
    form.preco_medio_clientes,
    form.preco_medio_gestores,
  ]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Operações financeiras</CardTitle>
          <CardDescription>Receitas, despesas, lucro, filtros, gráficos e lançamentos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium">Período</label>
              <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mes">mês</SelectItem>
                  <SelectItem value="ano">ano</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Ano</label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={y}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Mês</label>
              <Select value={month} onValueChange={setMonth} disabled={periodo === "ano"}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }).map((_, idx) => {
                    const m = String(idx + 1).padStart(2, "0");
                    return (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Equipe</label>
              <Select value={equipeFilter} onValueChange={setEquipeFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas as equipes</SelectItem>
                  <SelectItem value="__none__">Sem gestão</SelectItem>
                  {equipes.map((eq) => (
                    <SelectItem key={eq.id} value={eq.id}>
                      {eq.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
              Atualizar
            </Button>
            <Button type="button" onClick={() => setOpenNew((x) => !x)}>
              {openNew ? "Fechar lançamento" : "Novo lançamento"}
            </Button>
          </div>
          {openNew ? (
            <div className="rounded-md border p-3">
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium">Tipo</label>
                  <Select
                    value={form.tipo}
                    onValueChange={(v) => {
                      const tipo = v as FinanceiroTipo;
                      setForm((prev) => ({
                        ...prev,
                        tipo,
                        categoria: tipo === "receita" ? "assinatura_equipe" : "marketing",
                      }));
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="receita">receita</SelectItem>
                      <SelectItem value="despesa">despesa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Categoria</label>
                  <Select value={form.categoria} onValueChange={(v) => setForm((prev) => ({ ...prev, categoria: v as FinanceiroCategoria }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categoriasForm.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {CATEGORIA_LABEL[cat]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Valor</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={isReceitaB2B ? String(b2bCalc.total || "") : form.valor}
                    onChange={(e) => setForm((prev) => ({ ...prev, valor: e.target.value }))}
                    disabled={isReceitaB2B}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Data</label>
                  <Input type="date" value={form.data} onChange={(e) => setForm((prev) => ({ ...prev, data: e.target.value }))} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">
                    {form.tipo === "receita" && form.categoria === "assinatura_equipe"
                      ? "Empresa B2B (grupo de gestao)"
                      : "Equipe (opcional)"}
                  </label>
                  <Select value={form.equipe_id} onValueChange={(v) => setForm((prev) => ({ ...prev, equipe_id: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sem gestão</SelectItem>
                      {equipes.map((eq) => (
                        <SelectItem key={eq.id} value={eq.id}>
                          {eq.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Cliente (opcional)</label>
                  <Select value={form.usuario_id} onValueChange={(v) => setForm((prev) => ({ ...prev, usuario_id: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sem cliente</SelectItem>
                      {perfis
                        .filter((p) => p.role === "cliente" || p.role === "cliente_gestao")
                        .slice(0, 200)
                        .map((p) => (
                          <SelectItem key={p.usuario_id} value={p.usuario_id}>
                            {p.nome_completo ?? p.usuario_id}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {isReceitaB2B ? (
                <div className="mt-3 rounded-md border p-3">
                  <p className="mb-2 text-sm font-medium">Composicao por role (empresa B2B)</p>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium">Qtd CS</label>
                      <Input type="number" min="0" value={form.qtd_cs} onChange={(e) => setForm((prev) => ({ ...prev, qtd_cs: e.target.value }))} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Qtd Clientes</label>
                      <Input
                        type="number"
                        min="0"
                        value={form.qtd_clientes}
                        onChange={(e) => setForm((prev) => ({ ...prev, qtd_clientes: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Qtd Gestores</label>
                      <Input
                        type="number"
                        min="0"
                        value={form.qtd_gestores}
                        onChange={(e) => setForm((prev) => ({ ...prev, qtd_gestores: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Preco medio CS</label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.preco_medio_cs}
                        onChange={(e) => setForm((prev) => ({ ...prev, preco_medio_cs: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Preco medio Cliente</label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.preco_medio_clientes}
                        onChange={(e) => setForm((prev) => ({ ...prev, preco_medio_clientes: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Preco medio Gestor</label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.preco_medio_gestores}
                        onChange={(e) => setForm((prev) => ({ ...prev, preco_medio_gestores: e.target.value }))}
                      />
                    </div>
                  </div>
                  <p className="mt-3 text-sm">
                    Total calculado: <strong>{brl(b2bCalc.total)}</strong>
                  </p>
                </div>
              ) : null}
              <div className="mt-3">
                <label className="mb-1 block text-xs font-medium">Descrição</label>
                <Input value={form.descricao} onChange={(e) => setForm((prev) => ({ ...prev, descricao: e.target.value }))} placeholder="Descrição do lançamento" />
              </div>
              <div className="mt-3">
                <Button
                  type="button"
                  disabled={saving || Number(isReceitaB2B ? b2bCalc.total : form.valor) <= 0 || !form.data}
                  onClick={async () => {
                    setSaving(true);
                    setError(null);
                    try {
                      if (form.tipo === "receita" && form.categoria === "assinatura_equipe" && form.equipe_id === "__none__") {
                        throw new Error("Para receita B2B, selecione a empresa (grupo de gestao) que contratou o servico.");
                      }
                      await createFinanceiroLancamento({
                        tipo: form.tipo,
                        categoria: form.categoria,
                        valor: Number(isReceitaB2B ? b2bCalc.total : form.valor),
                        data: form.data,
                        descricao: form.descricao || null,
                        equipe_id: form.equipe_id === "__none__" ? null : form.equipe_id,
                        usuario_id: form.usuario_id === "__none__" ? null : form.usuario_id,
                        detalhes: isReceitaB2B
                          ? {
                              qtd_cs: b2bCalc.qtdCs,
                              qtd_clientes: b2bCalc.qtdClientes,
                              qtd_gestores: b2bCalc.qtdGestores,
                              preco_medio_cs: b2bCalc.precoCs,
                              preco_medio_clientes: b2bCalc.precoClientes,
                              preco_medio_gestores: b2bCalc.precoGestores,
                            }
                          : null,
                      });
                      setForm((prev) => ({
                        ...prev,
                        valor: "",
                        descricao: "",
                        qtd_cs: "",
                        qtd_clientes: "",
                        qtd_gestores: "",
                        preco_medio_cs: "",
                        preco_medio_clientes: "",
                        preco_medio_gestores: "",
                      }));
                      await load();
                    } catch (e) {
                      setError(formatSupabaseError(e));
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  {saving ? "Salvando..." : "Salvar lançamento"}
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Receita total" value={brl(receitaTotal)} />
        <KpiCard title="Despesa total" value={brl(despesaTotal)} />
        <KpiCard title="Lucro" value={brl(lucro)} />
        <KpiCard title="Margem (%)" value={`${margem.toFixed(1)}%`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Receita vs Despesa ao longo do tempo</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              className="h-[280px] w-full"
              config={{
                receita: { label: "Receita", color: "#8b5cf6" },
                despesa: { label: "Despesa", color: "#f43f5e" },
              }}
            >
              <LineChart data={lineData}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="month" />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Line type="monotone" dataKey="receita" stroke="var(--color-receita)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="despesa" stroke="var(--color-despesa)" strokeWidth={2} dot={false} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Receita por fonte</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              className="h-[280px] w-full"
              config={{
                assinatura_equipe: { label: CATEGORIA_LABEL.assinatura_equipe, color: PIE_COLORS[0] },
                assinatura_cliente: { label: CATEGORIA_LABEL.assinatura_cliente, color: PIE_COLORS[1] },
                agencia_viagens: { label: CATEGORIA_LABEL.agencia_viagens, color: PIE_COLORS[2] },
              }}
            >
              <PieChart>
                <Pie data={receitaPorFonte} dataKey="valor" nameKey="categoria" outerRadius={90}>
                  {receitaPorFonte.map((_, index) => (
                    <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent nameKey="categoria" />} />
                <ChartLegend content={<ChartLegendContent nameKey="categoria" />} />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Despesas por categoria</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer className="h-[280px] w-full" config={{ valor: { label: "Despesas", color: BAR_COLOR } }}>
            <BarChart data={despesaPorCategoria}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="categoria" />
              <YAxis />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="valor" fill={BAR_COLOR} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Receita B2B por empresa de gestao</CardTitle>
          <CardDescription>Quanto cada grupo de gestao pagou pelo uso do servico.</CardDescription>
        </CardHeader>
        <CardContent>
          {receitaB2BPorEmpresa.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem receitas B2B no filtro atual.</p>
          ) : (
            <ChartContainer className="h-[320px] w-full" config={{ total: { label: "Receita B2B", color: "#7c3aed" } }}>
              <BarChart data={receitaB2BPorEmpresa} layout="vertical" margin={{ left: 16, right: 16 }}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" />
                <YAxis type="category" dataKey="empresa" width={210} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="total" fill="#7c3aed" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top receitas por equipe</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {topReceitaEquipe.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados.</p>
            ) : (
              topReceitaEquipe.map((x) => (
                <div key={x.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <span>{x.nome}</span>
                  <strong>{brl(x.total)}</strong>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top receitas por cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {topReceitaCliente.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados.</p>
            ) : (
              topReceitaCliente.map((x) => (
                <div key={x.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <span>{x.nome}</span>
                  <strong>{brl(x.total)}</strong>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lançamentos</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="px-2 py-2">Tipo</th>
                <th className="px-2 py-2">Categoria</th>
                <th className="px-2 py-2">Valor</th>
                <th className="px-2 py-2">Data</th>
                <th className="px-2 py-2">Equipe</th>
                <th className="px-2 py-2">Composicao B2B</th>
                <th className="px-2 py-2">Descrição</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-2 py-3 text-muted-foreground">
                    Carregando...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-2 py-3 text-muted-foreground">
                    Sem lançamentos no filtro atual.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-2 py-2">{r.tipo}</td>
                    <td className="px-2 py-2">{CATEGORIA_LABEL[r.categoria]}</td>
                    <td className="px-2 py-2">{brl(r.valor)}</td>
                    <td className="px-2 py-2">{r.data}</td>
                    <td className="px-2 py-2">{r.equipe_id ? (equipeNomeById[r.equipe_id] ?? r.equipe_id) : "Sem gestão"}</td>
                    <td className="px-2 py-2 text-xs">
                      {r.categoria === "assinatura_equipe" && r.detalhes ? (
                        <>
                          CS {Number(r.detalhes.qtd_cs ?? 0)} x {brl(Number(r.detalhes.preco_medio_cs ?? 0))} · Clientes{" "}
                          {Number(r.detalhes.qtd_clientes ?? 0)} x {brl(Number(r.detalhes.preco_medio_clientes ?? 0))} · Gestores{" "}
                          {Number(r.detalhes.qtd_gestores ?? 0)} x {brl(Number(r.detalhes.preco_medio_gestores ?? 0))}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-2 py-2">{r.descricao ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ title, value }: { title: string; value: string }) {
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
