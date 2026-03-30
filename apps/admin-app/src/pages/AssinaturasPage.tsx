import { useMemo, useState } from "react";

import { AdminTableToolbar } from "@/components/admin/AdminTableToolbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAssinaturasAdmin } from "@/hooks/useAssinaturasAdmin";

export default function AssinaturasPage() {
  const { rows, available, loading, error, extend30 } = useAssinaturasAdmin();
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.label.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q),
    );
  }, [rows, search]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Assinaturas</CardTitle>
          <CardDescription>
            Dados da tabela <code className="text-xs">subscriptions</code> no Supabase. Colunas de data são detetadas
            automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
          {!available && !loading ? (
            <p className="text-sm text-muted-foreground">
              Tabela <code>subscriptions</code> não disponível ou sem permissão (RLS).
            </p>
          ) : null}
          {available ? (
            <>
              <AdminTableToolbar value={search} onChange={setSearch} placeholder="Pesquisar…" />
              {!loading && filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum dado encontrado.</p>
              ) : null}
              <div className="overflow-x-auto rounded-[14px] border border-nubank-border bg-white">
                <table className="w-full min-w-[760px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-nubank-border text-left text-xs font-medium uppercase tracking-wide text-nubank-text-secondary">
                      <th className="px-4 py-3">Referência</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3">Fim / renovação</th>
                      <th className="px-4 py-3">Dias</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {loading
                      ? Array.from({ length: 5 }).map((_, i) => (
                          <tr key={i} className="border-t border-nubank-border">
                            <td className="px-4 py-3" colSpan={5}>
                              <Skeleton className="h-9 w-full" />
                            </td>
                          </tr>
                        ))
                      : filtered.map((r) => (
                          <tr key={r.id} className="border-t border-nubank-border">
                            <td className="max-w-[220px] truncate px-4 py-3 font-medium text-nubank-text" title={r.label}>
                              {r.label}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={
                                  r.isExpired
                                    ? "rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive"
                                    : r.isActive
                                      ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700"
                                      : "text-nubank-text-secondary"
                                }
                              >
                                {r.isExpired ? "Expirada" : r.isActive ? "Ativa" : r.status || "—"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-nubank-text-secondary">
                              {r.endsAt ? r.endsAt.toLocaleString("pt-BR") : "—"}
                            </td>
                            <td className="px-4 py-3 tabular-nums">{r.daysRemaining ?? "—"}</td>
                            <td className="px-4 py-3 text-right">
                              {typeof r.raw.id === "string" ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={busyId === r.id}
                                  onClick={async () => {
                                    setBusyId(r.id);
                                    try {
                                      await extend30(r.id);
                                    } catch (e) {
                                      alert(e instanceof Error ? e.message : String(e));
                                    } finally {
                                      setBusyId(null);
                                    }
                                  }}
                                >
                                  +30 dias
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">Sem id</span>
                              )}
                            </td>
                          </tr>
                        ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
