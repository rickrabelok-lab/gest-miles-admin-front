import { useState } from "react";
import { Navigate } from "react-router-dom";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccessScope } from "@/hooks/useAccessScope";
import { canSeeAuditLogs } from "@/lib/accessScope";
import { hasApiUrl } from "@/lib/backendApi";
import {
  useAuditLogs,
  useAuditLogsTables,
  type AuditLogRow,
  type AuditLogsFilters,
} from "@/hooks/useAuditLogs";

const PAGE_SIZE = 50;
const ALL = "__all__";

function DiffCell({ antes, depois }: { antes: Record<string, unknown> | null; depois: Record<string, unknown> | null }) {
  const [open, setOpen] = useState(false);

  if (!antes && !depois) {
    return <span className="text-muted-foreground">—</span>;
  }

  const changedKeys = new Set<string>();
  if (antes && depois) {
    const allKeys = new Set([...Object.keys(antes), ...Object.keys(depois)]);
    allKeys.forEach((k) => {
      if (JSON.stringify(antes[k]) !== JSON.stringify(depois[k])) changedKeys.add(k);
    });
  }

  const summary =
    antes && depois
      ? `${changedKeys.size} campo(s) alterado(s)`
      : antes
        ? "Registo removido"
        : "Registo criado";

  return (
    <div>
      <button
        type="button"
        className="flex items-center gap-1 text-xs text-primary hover:underline"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {summary}
      </button>
      {open && (
        <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted/60 p-2 text-[10px] leading-relaxed">
          {antes && depois
            ? [...changedKeys].map((k) => `${k}: ${JSON.stringify(antes[k])} → ${JSON.stringify(depois[k])}`).join("\n")
            : JSON.stringify(antes ?? depois, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function AuditLogsPage() {
  const { scope } = useAccessScope();
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<AuditLogsFilters>({});

  const offset = page * PAGE_SIZE;
  const { data, isLoading, error, refetch } = useAuditLogs(filters, PAGE_SIZE, offset);
  const { data: tablesData } = useAuditLogsTables();

  if (!canSeeAuditLogs(scope)) {
    return <Navigate to="/dashboard" replace />;
  }

  const logs: AuditLogRow[] = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const tables = tablesData?.tables ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Logs de auditoria</CardTitle>
              <CardDescription>
                {total} registo(s) — visão{" "}
                {scope?.kind === "global_admin" ? "global (todas as empresas)" : "da sua equipe"}. Página {page + 1} de{" "}
                {totalPages}.
                {!hasApiUrl() ? (
                  <>
                    {" "}
                    Fonte: tabela <code className="text-xs">logs_acoes</code> (Supabase). Opcional:{" "}
                    <code className="text-xs">VITE_API_URL</code> para uma API de auditoria com mais campos.
                  </>
                ) : null}
              </CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()} disabled={isLoading}>
              <RefreshCw className="mr-1.5 h-4 w-4" />
              Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Select
              value={filters.tabela ?? ALL}
              onValueChange={(v) => {
                setFilters((f) => ({ ...f, tabela: v === ALL ? undefined : v }));
                setPage(0);
              }}
            >
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue placeholder="Tabela" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas as tabelas</SelectItem>
                {tables.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.acao ?? ALL}
              onValueChange={(v) => {
                setFilters((f) => ({ ...f, acao: v === ALL ? undefined : v }));
                setPage(0);
              }}
            >
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue placeholder="Ação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas as ações</SelectItem>
                {["INSERT", "UPDATE", "DELETE", "LOGIN", "CHECKOUT"].map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              type="text"
              className="h-8 w-64 text-xs"
              value={filters.user_id ?? ""}
              onChange={(e) => {
                setFilters((f) => ({ ...f, user_id: e.target.value || undefined }));
                setPage(0);
              }}
              placeholder="user_id (UUID)"
            />

            <Input
              type="date"
              className="h-8 w-36 text-xs"
              value={filters.from ?? ""}
              onChange={(e) => {
                setFilters((f) => ({ ...f, from: e.target.value || undefined }));
                setPage(0);
              }}
              placeholder="De"
            />
            <Input
              type="date"
              className="h-8 w-36 text-xs"
              value={filters.to ?? ""}
              onChange={(e) => {
                setFilters((f) => ({ ...f, to: e.target.value || undefined }));
                setPage(0);
              }}
              placeholder="Até"
            />
          </div>

          {error ? (
            <p className="text-sm text-destructive">{error instanceof Error ? error.message : "Erro ao carregar logs."}</p>
          ) : null}

          <div className="overflow-x-auto rounded-[14px] border border-nubank-border bg-white">
            <table className="w-full min-w-[800px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-nubank-border text-left font-medium uppercase tracking-wide text-nubank-text-secondary">
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Ação</th>
                  <th className="px-3 py-2">Tabela</th>
                  <th className="px-3 py-2">Utilizador</th>
                  <th className="px-3 py-2">Equipe</th>
                  <th className="px-3 py-2">Diff</th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-t border-nubank-border">
                        <td className="px-3 py-2" colSpan={6}>
                          <Skeleton className="h-7 w-full" />
                        </td>
                      </tr>
                    ))
                  : logs.map((r) => (
                      <tr key={r.id} className="border-t border-nubank-border align-top text-nubank-text">
                        <td className="whitespace-nowrap px-3 py-2 text-nubank-text-secondary">
                          {new Date(r.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" })}
                        </td>
                        <td className="px-3 py-2 font-medium">{r.acao}</td>
                        <td className="px-3 py-2">{r.tabela}</td>
                        <td className="px-3 py-2">
                          {r.user_name ?? (
                            <span className="font-mono text-[10px]">{r.user_id?.slice(0, 8) ?? "sistema"}</span>
                          )}
                          {r.user_role ? (
                            <span className="ml-1 text-[10px] text-nubank-text-secondary">({r.user_role})</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 font-mono text-[10px]">
                          {r.equipe_id?.slice(0, 8) ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          <DiffCell antes={r.antes} depois={r.depois} />
                        </td>
                      </tr>
                    ))}
                {!isLoading && logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground">
                      Nenhum registo encontrado.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-1">
              <Button type="button" variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <span className="text-xs text-muted-foreground">
                {page + 1} / {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
