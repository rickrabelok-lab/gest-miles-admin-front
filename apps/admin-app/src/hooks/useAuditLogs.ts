import { useQuery } from "@tanstack/react-query";
import { apiFetch, hasApiUrl } from "@/lib/backendApi";
import { useAdminAuth } from "@/context/AdminAuthContext";

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

export function useAuditLogs(
  filters: AuditLogsFilters = {},
  limit = 50,
  offset = 0,
) {
  const { session } = useAdminAuth();
  const token = session?.access_token ?? null;

  return useQuery({
    queryKey: ["audit-logs", filters, limit, offset],
    enabled: !!token && hasApiUrl(),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      if (filters.tabela) params.set("tabela", filters.tabela);
      if (filters.acao) params.set("acao", filters.acao);
      if (filters.user_id) params.set("user_id", filters.user_id);
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);

      return apiFetch<AuditLogsResponse>(
        `/api/audit-logs?${params.toString()}`,
        { token: token! },
      );
    },
  });
}

export function useAuditLogsTables() {
  const { session } = useAdminAuth();
  const token = session?.access_token ?? null;

  return useQuery({
    queryKey: ["audit-logs-tables"],
    enabled: !!token && hasApiUrl(),
    staleTime: 120_000,
    queryFn: async () => {
      return apiFetch<AuditLogsTablesResponse>("/api/audit-logs/tables", {
        token: token!,
      });
    },
  });
}
