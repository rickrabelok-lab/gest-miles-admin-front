import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";

export type CsatPendingRow = {
  gestor_id: string;
  equipe_id: string | null;
  mes_referencia: string;
};

function toQueryError(err: unknown, fallback: string): Error {
  if (err instanceof Error) return err;
  if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
    return new Error((err as { message: string }).message);
  }
  return new Error(fallback);
}

/**
 * Avaliações CSAT pendentes do mês corrente (BRT), por gestor vinculado.
 */
export function useCsatCliente(enabled: boolean, clienteId: string | undefined) {
  const pendingQuery = useQuery({
    queryKey: ["csat_pending", clienteId],
    enabled: enabled && !!clienteId,
    queryFn: async (): Promise<CsatPendingRow[]> => {
      const { data, error } = await supabase.rpc("csat_pending_avaliacoes");
      if (error) throw toQueryError(error, "Não foi possível carregar avaliações CSAT pendentes.");
      return (data ?? []) as CsatPendingRow[];
    },
  });

  const gestorIds = [...new Set((pendingQuery.data ?? []).map((r) => r.gestor_id))];

  const namesQuery = useQuery({
    queryKey: ["csat_pending_gestor_nomes", [...gestorIds].sort().join(",")],
    enabled: enabled && gestorIds.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from("perfis")
        .select("usuario_id, nome_completo")
        .in("usuario_id", gestorIds);
      if (error) throw toQueryError(error, "Não foi possível carregar nomes dos gestores.");
      const map: Record<string, string> = {};
      (data ?? []).forEach((row: { usuario_id: string; nome_completo: string | null }) => {
        map[row.usuario_id] = (row.nome_completo ?? "").trim() || "Gestor";
      });
      return map;
    },
  });

  return {
    pending: pendingQuery.data ?? [],
    gestorNomeById: namesQuery.data ?? {},
    isLoading: pendingQuery.isLoading || namesQuery.isLoading,
    error: pendingQuery.error ?? namesQuery.error,
    refetch: pendingQuery.refetch,
  };
}

export async function submitCsatAvaliacao(input: {
  clienteId: string;
  gestorId: string;
  equipeId: string | null;
  mesReferencia: string;
  nota: number;
  comentario: string | null;
}): Promise<void> {
  const { error } = await supabase.from("csat_avaliacoes").insert({
    cliente_id: input.clienteId,
    gestor_id: input.gestorId,
    equipe_id: input.equipeId,
    mes_referencia: input.mesReferencia,
    nota: input.nota,
    comentario: input.comentario,
  });
  if (error) {
    if (error.code === "23505") {
      throw new Error("Este mês já foi avaliado para este gestor.");
    }
    throw toQueryError(error, "Não foi possível enviar sua avaliação CSAT.");
  }
}
