import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { AdminTableToolbar } from "@/components/admin/AdminTableToolbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminEquipe } from "@/context/AdminEquipeContext";
import { useGestoresEscopo } from "@/hooks/useGestoresEscopo";
import { formatSupabaseError, type Perfil } from "@/lib/adminApi";
import { fetchClienteIdsForGestor, fetchPerfisByIds } from "@/services/gestoresScoped";

export default function GestoresPage() {
  const { selectedEquipeId, equipeIdsFiltro } = useAdminEquipe();
  const { rows, loading, error, refetch } = useGestoresEscopo(equipeIdsFiltro);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [clientRows, setClientRows] = useState<Perfil[]>([]);
  const [clientLoading, setClientLoading] = useState(false);
  const [clientErr, setClientErr] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.gestor_nome.toLowerCase().includes(q) || r.gestor_id.toLowerCase().includes(q));
  }, [rows, search]);

  async function toggleClients(gestorId: string) {
    if (openId === gestorId) {
      setOpenId(null);
      setClientRows([]);
      return;
    }
    setOpenId(gestorId);
    setClientLoading(true);
    setClientErr(null);
    try {
      const ids = await fetchClienteIdsForGestor(gestorId);
      setClientRows(await fetchPerfisByIds(ids));
    } catch (e) {
      setClientErr(formatSupabaseError(e));
      setClientRows([]);
    } finally {
      setClientLoading(false);
    }
  }

  if (!selectedEquipeId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Gestores</CardTitle>
          <CardDescription>Selecione um grupo no cabeçalho para ver dados no âmbito da equipe.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Gestores</CardTitle>
          <CardDescription>
            Carteira e métricas derivadas de <code className="text-xs">programas_cliente</code> no âmbito do grupo (equipe
            raiz + filhas).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
          <AdminTableToolbar value={search} onChange={setSearch} placeholder="Pesquisar gestor…" />
          {!loading && !error && filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum dado encontrado.</p>
          ) : null}
          <div className="overflow-x-auto rounded-[14px] border border-nubank-border bg-white">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-nubank-border text-left text-xs font-medium uppercase tracking-wide text-nubank-text-secondary">
                  <th className="px-4 py-3">Gestor</th>
                  <th className="px-4 py-3">Clientes</th>
                  <th className="px-4 py-3">Economia (R$)</th>
                  <th className="px-4 py-3">Score médio</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="border-t border-nubank-border">
                        <td className="px-4 py-3" colSpan={5}>
                          <Skeleton className="h-9 w-full" />
                        </td>
                      </tr>
                    ))
                  : filtered.map((r) => (
                      <Fragment key={r.gestor_id}>
                        <tr className="border-t border-nubank-border">
                          <td className="px-4 py-3 font-medium text-nubank-text">{r.gestor_nome}</td>
                          <td className="px-4 py-3">{r.clientes_count}</td>
                          <td className="px-4 py-3 tabular-nums">
                            {r.economia_gerada.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </td>
                          <td className="px-4 py-3 tabular-nums">{r.score_medio || "—"}</td>
                          <td className="px-4 py-3 text-right">
                            <Button type="button" variant="outline" size="sm" onClick={() => void toggleClients(r.gestor_id)}>
                              {openId === r.gestor_id ? "Fechar" : "Ver clientes"}
                            </Button>
                          </td>
                        </tr>
                        {openId === r.gestor_id ? (
                          <tr className="border-t border-nubank-border bg-muted/30">
                            <td colSpan={5} className="px-4 py-3">
                              {clientLoading ? <Skeleton className="h-16 w-full" /> : null}
                              {clientErr ? <p className="text-sm text-destructive">{clientErr}</p> : null}
                              {!clientLoading && !clientErr && clientRows.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Nenhum cliente vinculado.</p>
                              ) : null}
                              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-sm">
                                {clientRows.map((c) => (
                                  <li key={c.usuario_id}>
                                    <Link to={`/users`} className="text-primary hover:underline">
                                      {c.nome_completo ?? c.usuario_id}
                                    </Link>{" "}
                                    <span className="text-nubank-text-secondary">({c.role})</span>
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4">
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              Atualizar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
