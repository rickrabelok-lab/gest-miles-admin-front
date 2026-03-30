import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export type LogAcaoRow = {
  id: string;
  user_id: string;
  tipo_acao: string;
  entidade_afetada: string;
  entidade_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

/**
 * @param filterByGestorUserIds — Se definido, retorna logs desses usuários (ex.: gestores supervisionados pelo CS).
 * Caso contrário, apenas do usuário logado.
 */
export const useGestorLogs = (enabled = true, filterByGestorUserIds?: string[]) => {
  const { user } = useAuth();
  const sortedFilterKey =
    filterByGestorUserIds?.length && filterByGestorUserIds.length > 0
      ? [...filterByGestorUserIds].sort().join(",")
      : "";

  const query = useQuery({
    queryKey: ["gestor_logs_acoes", user?.id, sortedFilterKey || "self"],
    enabled:
      enabled &&
      !!user?.id &&
      (!sortedFilterKey || (filterByGestorUserIds?.length ?? 0) > 0),
    queryFn: async () => {
      let q = supabase
        .from("logs_acoes")
        .select("id, user_id, tipo_acao, entidade_afetada, entidade_id, details, created_at")
        .order("created_at", { ascending: false })
        .limit(200);

      if (sortedFilterKey && filterByGestorUserIds?.length) {
        q = q.in("user_id", filterByGestorUserIds);
      } else {
        q = q.eq("user_id", user!.id);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as LogAcaoRow[];
    },
  });

  return {
    logs: query.data ?? [],
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
};
