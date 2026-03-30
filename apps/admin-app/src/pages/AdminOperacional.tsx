import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  formatSupabaseError,
  listFilaProcessos,
  listLogsErros,
  reprocessarFilaProcesso,
  runOperationalHealthCheck,
  type FilaProcessoRow,
  type LogErroOrigem,
  type LogErroRow,
  type OperationalHealthResult,
} from "@/lib/adminApi";

const HEALTH_INTERVAL_MS = 45_000;

function startOfTodayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseTs(s: string | null): number {
  if (!s) return 0;
  const t = Date.parse(s);
  return Number.isNaN(t) ? 0 : t;
}

export default function AdminOperacionalPage() {
  const [health, setHealth] = useState<OperationalHealthResult | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [erros, setErros] = useState<LogErroRow[]>([]);
  const [fila, setFila] = useState<FilaProcessoRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reprocId, setReprocId] = useState<string | null>(null);
  const [errosHojeCount, setErrosHojeCount] = useState(0);

  const [filtroOrigem, setFiltroOrigem] = useState<string>("__all__");
  const [filtroDe, setFiltroDe] = useState("");
  const [filtroAte, setFiltroAte] = useState("");

  const runHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const h = await runOperationalHealthCheck();
      setHealth(h);
    } catch (e) {
      setHealth({
        checkedAt: new Date().toISOString(),
        sistemaOnline: false,
        supabaseOk: false,
        supabaseMessage: formatSupabaseError(e),
        externasOk: false,
        externasDetalhes: [],
      });
    } finally {
      setHealthLoading(false);
    }
  }, []);

  const loadTables = useCallback(async () => {
    setLoadingData(true);
    setError(null);
    try {
      const day = startOfTodayISO();
      const [eRows, fRows, hojeRows] = await Promise.all([
        listLogsErros({
          origem: filtroOrigem === "__all__" ? null : (filtroOrigem as LogErroOrigem),
          fromDate: filtroDe.trim() || null,
          toDate: filtroAte.trim() || null,
          limit: 300,
        }),
        listFilaProcessos(150),
        listLogsErros({ fromDate: day, toDate: day, limit: 500 }),
      ]);
      setErros(eRows);
      setFila(fRows);
      setErrosHojeCount(hojeRows.length);
    } catch (e) {
      setError(formatSupabaseError(e));
    } finally {
      setLoadingData(false);
    }
  }, [filtroOrigem, filtroDe, filtroAte]);

  useEffect(() => {
    void runHealth();
    const id = setInterval(() => void runHealth(), HEALTH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [runHealth]);

  useEffect(() => {
    void loadTables();
  }, [loadTables]);

  const alertas = useMemo(() => {
    const items: string[] = [];
    if (health && health.externasOk === false) items.push("Falha em pelo menos uma API externa configurada.");
    if (health && !health.supabaseOk) items.push("Conexão com Supabase indisponível ou com erro.");
    const stuckMs = 15 * 60 * 1000;
    const pendenteMs = 2 * 60 * 60 * 1000;
    const now = Date.now();
    const travados = fila.filter((f) => {
      if (f.status === "processando") return now - parseTs(f.updated_at ?? f.created_at) > stuckMs;
      if (f.status === "pendente") return now - parseTs(f.created_at) > pendenteMs;
      return false;
    });
    if (travados.length > 0) items.push(`${travados.length} processo(s) possivelmente travado(s) na fila.`);
    const falhasEmail = fila.filter((f) => f.tipo === "envio_email" && f.status === "erro").length;
    if (falhasEmail > 0) items.push(`${falhasEmail} falha(s) de envio (e-mail) na fila.`);
    return { items, travados: travados.length };
  }, [health, fila]);

  const handleReprocessar = async (id: string) => {
    setReprocId(id);
    setError(null);
    try {
      await reprocessarFilaProcesso(id);
      await loadTables();
    } catch (e) {
      setError(formatSupabaseError(e));
    } finally {
      setReprocId(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Operacional</CardTitle>
          <CardDescription>Monitorização de saúde do sistema, filas e erros.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void runHealth()} disabled={healthLoading}>
              {healthLoading ? "A verificar…" : "Verificar agora"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadTables()} disabled={loadingData}>
              Atualizar dados
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Status geral</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {health == null ? "—" : health.sistemaOnline ? "Online" : "Offline"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Supabase + APIs externas (quando configuradas)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">APIs externas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {health == null
                ? "—"
                : health.externasOk === null
                  ? "N/D"
                  : health.externasOk
                    ? "OK"
                    : "Erro"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Configure <code className="text-[11px]">VITE_ADMIN_EXTERNAL_HEALTH_URLS</code> (URLs separadas por vírgula).
              Nota: o browser exige CORS nas respostas.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Última verificação</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-sm">{health?.checkedAt ? new Date(health.checkedAt).toLocaleString("pt-BR") : "—"}</p>
            {health?.supabaseMessage ? (
              <p className="mt-2 text-xs text-destructive">{health.supabaseMessage}</p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="border-amber-200 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/20">
        <CardHeader>
          <CardTitle className="text-base">Alertas</CardTitle>
          <CardDescription>
            {errosHojeCount > 0 ? `⚠️ ${errosHojeCount} erro(s) registado(s) hoje` : "Sem erros registados hoje."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {alertas.items.length === 0 ? (
            <p className="text-muted-foreground">Nenhum alerta operacional ativo.</p>
          ) : (
            alertas.items.map((t, i) => (
              <div key={i} className="rounded-md border border-amber-200/80 bg-background/80 px-3 py-2 dark:border-amber-900/40">
                {t}
              </div>
            ))
          )}
          {health?.externasDetalhes?.length ? (
            <ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">
              {health.externasDetalhes.map((d) => (
                <li key={d.url}>
                  {d.url}: {d.ok ? "ok" : d.error ?? "falhou"}
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Logs de erros</CardTitle>
          <CardDescription>Tabela <code className="text-xs">logs_erros</code></CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium">Origem</label>
              <Select value={filtroOrigem} onValueChange={setFiltroOrigem}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  <SelectItem value="frontend">frontend</SelectItem>
                  <SelectItem value="backend">backend</SelectItem>
                  <SelectItem value="api">api</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">De (data)</label>
              <Input type="date" value={filtroDe} onChange={(e) => setFiltroDe(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Até (data)</label>
              <Input type="date" value={filtroAte} onChange={(e) => setFiltroAte(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button type="button" variant="outline" className="w-full" onClick={() => void loadTables()}>
                Aplicar filtros
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-[14px] border border-nubank-border bg-white">
            <table className="w-full min-w-[720px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-nubank-border text-left font-medium uppercase tracking-wide text-nubank-text-secondary">
                  <th className="px-3 py-2">Quando</th>
                  <th className="px-3 py-2">Origem</th>
                  <th className="px-3 py-2">Mensagem</th>
                  <th className="px-3 py-2">Stack</th>
                </tr>
              </thead>
              <tbody>
                {loadingData ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-muted-foreground">
                      A carregar…
                    </td>
                  </tr>
                ) : erros.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-muted-foreground">
                      Sem registos. Execute o SQL em <code className="text-[11px]">sql/logs_erros.sql</code> no Supabase.
                    </td>
                  </tr>
                ) : (
                  erros.map((r) => (
                    <tr key={r.id} className="border-t border-nubank-border align-top text-nubank-text">
                      <td className="whitespace-nowrap px-3 py-2 text-nubank-text-secondary">
                        {r.created_at ? new Date(r.created_at).toLocaleString("pt-BR") : "—"}
                      </td>
                      <td className="px-3 py-2">{r.origem}</td>
                      <td className="max-w-[280px] px-3 py-2">{r.mensagem}</td>
                      <td className="max-w-[320px] px-3 py-2 font-mono text-[10px] text-muted-foreground">
                        {r.stack ? <pre className="whitespace-pre-wrap break-all">{r.stack}</pre> : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fila de processos</CardTitle>
          <CardDescription>Tabela <code className="text-xs">fila_processos</code></CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-[14px] border border-nubank-border bg-white">
            <table className="w-full min-w-[800px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-nubank-border text-left font-medium uppercase tracking-wide text-nubank-text-secondary">
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Tentativas</th>
                  <th className="px-3 py-2">Criado</th>
                  <th className="px-3 py-2">Atualizado</th>
                  <th className="px-3 py-2">Ação</th>
                </tr>
              </thead>
              <tbody>
                {loadingData ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-muted-foreground">
                      A carregar…
                    </td>
                  </tr>
                ) : fila.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-muted-foreground">
                      Sem itens. Execute o SQL em <code className="text-[11px]">sql/fila_processos.sql</code> no Supabase.
                    </td>
                  </tr>
                ) : (
                  fila.map((f) => (
                    <tr key={f.id} className="border-t border-nubank-border align-top text-nubank-text">
                      <td className="px-3 py-2">{f.tipo}</td>
                      <td className="px-3 py-2 font-medium">{f.status}</td>
                      <td className="px-3 py-2">{f.tentativas}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-nubank-text-secondary">
                        {f.created_at ? new Date(f.created_at).toLocaleString("pt-BR") : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-nubank-text-secondary">
                        {f.updated_at ? new Date(f.updated_at).toLocaleString("pt-BR") : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {f.status === "concluido" ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={reprocId === f.id}
                            onClick={() => void handleReprocessar(f.id)}
                          >
                            {reprocId === f.id ? "…" : "Reprocessar"}
                          </Button>
                        )}
                      </td>
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
