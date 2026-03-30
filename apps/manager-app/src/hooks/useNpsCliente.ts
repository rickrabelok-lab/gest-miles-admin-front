import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";

export type NpsConviteRow = {
  id: string;
  cliente_id: string;
  gestor_id: string;
  equipe_id: string | null;
  motivo: string;
  created_at: string;
  consumed_at: string | null;
  nps_avaliacao_id: string | null;
};

function toQueryError(err: unknown, fallback: string): Error {
  if (err instanceof Error) return err;
  if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
    return new Error((err as { message: string }).message);
  }
  return new Error(fallback);
}

/**
 * Convites pendentes de NPS para cliente_gestao.
 * Dispara RPC de seed (90 dias) antes de buscar convites abertos.
 */
export function useNpsCliente(enabled: boolean, clienteId: string | undefined) {
  const convitesQuery = useQuery({
    queryKey: ["nps_convites", clienteId],
    enabled: enabled && !!clienteId,
    queryFn: async (): Promise<NpsConviteRow[]> => {
      const { data: seedData, error: seedErr } = await supabase.rpc("nps_seed_convites_periodicos");
      if (seedErr) throw toQueryError(seedErr, "Não foi possível preparar convites de NPS.");

      void seedData;

      const { data, error } = await supabase
        .from("nps_convites")
        .select("id, cliente_id, gestor_id, equipe_id, motivo, created_at, consumed_at, nps_avaliacao_id")
        .eq("cliente_id", clienteId!)
        .is("consumed_at", null)
        .order("created_at", { ascending: true });

      if (error) throw toQueryError(error, "Não foi possível carregar convites de NPS.");
      return (data ?? []) as NpsConviteRow[];
    },
  });

  const gestorIds = [...new Set((convitesQuery.data ?? []).map((c) => c.gestor_id))];

  const namesQuery = useQuery({
    queryKey: ["nps_convites_gestor_nomes", [...gestorIds].sort().join(",")],
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
    convites: convitesQuery.data ?? [],
    gestorNomeById: namesQuery.data ?? {},
    isLoading: convitesQuery.isLoading || namesQuery.isLoading,
    error: convitesQuery.error ?? namesQuery.error,
    refetch: convitesQuery.refetch,
  };
}

export async function submitNpsAvaliacao(input: {
  clienteId: string;
  gestorId: string;
  equipeId: string | null;
  nota: number;
  comentario: string | null;
}): Promise<void> {
  const { error } = await supabase.from("nps_avaliacoes").insert({
    cliente_id: input.clienteId,
    gestor_id: input.gestorId,
    equipe_id: input.equipeId,
    nota: input.nota,
    comentario: input.comentario,
  });
  if (error) throw toQueryError(error, "Não foi possível enviar sua avaliação.");
}
