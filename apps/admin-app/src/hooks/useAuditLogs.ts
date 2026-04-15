import { useQuery } from "@tanstack/react-query";

import { useAdminAuth } from "@/context/AdminAuthContext";
import { apiFetch, hasApiUrl } from "@/lib/backendApi";
import {
  listAuditLogsPaginated,
  listDistinctEntidadesAfetadasAudit,
  type LogAcaoRow,
} from "@/lib/adminApi";

export interface AuditLogRow {
  id: string;
  user_id: string | null;
  user_name: string | null;
  user_role: string | null;
  acao: string;
  tabela: string;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  equipe_id: string | null;
  created_at: string;
}

interface AuditLogsResponse {
  logs: AuditLogRow[];
  total: number;
  limit: number;
  offset: number;
}

interface AuditLogsTablesResponse {
  tables: string[];
}

export interface AuditLogsFilters {
  tabela?: string;
  acao?: string;
  user_id?: string;
  from?: string;
  to?: string;
}

function mapLogAcaoToAuditRow(row: LogAcaoRow): AuditLogRow {
  const d = row.details;
  let antes: Record<string, unknown> | null = null;
  let depois: Record<string, unknown> | null = null;
  let equipe_id: string | null = null;
  if (d && typeof d === "object" && !Array.isArray(d)) {
    const o = d as Record<string, unknown>;
    if (o.antes && typeof o.antes === "object" && o.antes !== null) antes = o.antes as Record<string, unknown>;
    if (o.depois && typeof o.depois === "object" && o.depois !== null) depois = o.depois as Record<string, unknown>;
    if (typeof o.equipe_id === "string") equipe_id = o.equipe_id;
  }
  if (!antes && !depois && d && typeof d === "object") {
    depois = d as Record<string, unknown>;
  }
  return {
    id: row.id,
    user_id: row.user_id,
    user_name: null,
    user_role: null,
    acao: row.tipo_acao ?? "—",
    tabela: row.entidade_afetada ?? "—",
    antes,
    depois,
    equipe_id,
    created_at: row.created_at ?? new Date().toISOString(),
  };
}

export function useAuditLogs(
  filters: AuditLogsFilters = {},
  limit = 50,
  offset = 0,
) {
  const { session } = useAdminAuth();
  const token = session?.access_token ?? null;

  return useQuery({
    queryKey: ["audit-logs", filters, limit, offset, hasApiUrl() ? "api" : "supabase"],
    enabled: !!token,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (hasApiUrl()) {
        const params = new URLSearchParams();
        params.set("limit", String(limit));
        params.set("offset", String(offset));
        if (filters.tabela) params.set("tabela", filters.tabela);
        if (filters.acao) params.set("acao", filters.acao);
        if (filters.user_id) params.set("user_id", filters.user_id);
        if (filters.from) params.set("from", filters.from);
        if (filters.to) params.set("to", filters.to);

        return apiFetch<AuditLogsResponse>(`/api/audit-logs?${params.toString()}`, { token: token! });
      }

      const raw = await listAuditLogsPaginated({
        limit,
        offset,
        tabela: filters.tabela,
        acao: filters.acao,
        user_id: filters.user_id,
        from: filters.from,
        to: filters.to,
      });
      return {
        logs: raw.logs.map(mapLogAcaoToAuditRow),
        total: raw.total,
        limit,
        offset,
      } satisfies AuditLogsResponse;
    },
  });
}

export function useAuditLogsTables() {
  const { session } = useAdminAuth();
  const token = session?.access_token ?? null;

  return useQuery({
    queryKey: ["audit-logs-tables", hasApiUrl() ? "api" : "supabase"],
    enabled: !!token,
    staleTime: 120_000,
    queryFn: async () => {
      if (hasApiUrl()) {
        return apiFetch<AuditLogsTablesResponse>("/api/audit-logs/tables", {
          token: token!,
        });
      }
      const tables = await listDistinctEntidadesAfetadasAudit();
      return { tables };
    },
  });
}
