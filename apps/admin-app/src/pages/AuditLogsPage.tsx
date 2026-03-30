import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";

import { AdminTableToolbar } from "@/components/admin/AdminTableToolbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccessScope } from "@/hooks/useAccessScope";
import { canSeeAuditLogs } from "@/lib/accessScope";
import { createAuditLogTestEntry, formatSupabaseError, listAuditLogs, type LogAcaoRow } from "@/lib/adminApi";

export default function AuditLogsPage() {
  const { scope } = useAccessScope();
  const [rows, setRows] = useState<LogAcaoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listAuditLogs(400);
      setRows(data);
    } catch (e) {
      setError(formatSupabaseError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const blob = `${r.tipo_acao ?? ""} ${r.entidade_afetada ?? ""} ${r.entidade_id ?? ""} ${r.user_id ?? ""} ${r.created_at ?? ""}`.toLowerCase();
      return blob.includes(q);
    });
  }, [rows, search]);

  if (!canSeeAuditLogs(scope)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Logs de auditoria</CardTitle>
          <CardDescription>
            Últimas entradas em <code className="text-xs">logs_acoes</code> (mesma fonte que o app do gestor).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
          <div className="mb-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              Atualizar
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  setError(null);
                  await createAuditLogTestEntry();
                  await load();
                } catch (e) {
                  setError(formatSupabaseError(e));
                }
              }}
            >
              Registrar log de teste real
            </Button>
          </div>
          <AdminTableToolbar value={search} onChange={setSearch} placeholder="Filtrar logs…" />
          {!loading && !error && filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum dado encontrado.</p>
          ) : null}
          <div className="overflow-x-auto rounded-[14px] border border-nubank-border bg-white">
            <table className="w-full min-w-[720px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-nubank-border text-left font-medium uppercase tracking-wide text-nubank-text-secondary">
                  <th className="px-3 py-2">Quando</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Entidade</th>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">user_id</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="border-t border-nubank-border">
                        <td className="px-3 py-2" colSpan={5}>
                          <Skeleton className="h-8 w-full" />
                        </td>
                      </tr>
                    ))
                  : filtered.map((r) => (
                      <tr key={r.id} className="border-t border-nubank-border align-top text-nubank-text">
                        <td className="whitespace-nowrap px-3 py-2 text-nubank-text-secondary">{r.created_at ?? "—"}</td>
                        <td className="px-3 py-2">{r.tipo_acao ?? "—"}</td>
                        <td className="px-3 py-2">{r.entidade_afetada ?? "—"}</td>
                        <td className="px-3 py-2 font-mono text-[11px]">{r.entidade_id ?? "—"}</td>
                        <td className="break-all px-3 py-2 font-mono text-[11px]">{r.user_id ?? "—"}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
