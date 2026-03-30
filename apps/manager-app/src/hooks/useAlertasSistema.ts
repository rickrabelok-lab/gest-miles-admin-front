import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";

export type AlertaSistemaTipo =
  | "NPS_LOW"
  | "CSAT_LOW"
  | "CSAT_DROP"
  | "GESTOR_SCORE_DROP"
  | "CLIENT_INACTIVITY"
  | "MILES_EXPIRING"
  | "DEMANDA_ATRASADA"
  | "MILES_CONCENTRATION";

export type AlertaSistemaNivel = "baixo" | "medio" | "alto" | "critico";

export type AlertaSistemaRow = {
  id: string;
  tipo_alerta: AlertaSistemaTipo;
  cliente_id: string | null;
  gestor_id: string | null;
  equipe_id: string | null;
  nivel: AlertaSistemaNivel;
  mensagem: string;
  status: "ativo" | "resolvido";
  data_criacao: string;
  data_resolucao: string | null;
  dedup_key: string;
};

export type AlertaSistemaEnriched = AlertaSistemaRow & {
  clienteNome: string;
  gestorNome: string;
};

function toQueryError(err: unknown, fallback: string): Error {
  if (err instanceof Error) return err;
  if (
    err &&
    typeof err === "object" &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string"
  ) {
    return new Error((err as { message: string }).message);
  }
  return new Error(fallback);
}

export const NIVEL_SORT: Record<AlertaSistemaNivel, number> = {
  critico: 0,
  alto: 1,
  medio: 2,
  baixo: 3,
};

export const TIPO_ALERTA_LABEL: Record<AlertaSistemaTipo, string> = {
  NPS_LOW: "NPS baixo",
  CSAT_LOW: "CSAT baixo",
  CSAT_DROP: "Queda CSAT",
  GESTOR_SCORE_DROP: "Queda score gestor",
  CLIENT_INACTIVITY: "Inatividade",
  MILES_EXPIRING: "Milhas a vencer",
  DEMANDA_ATRASADA: "Demanda atrasada",
  MILES_CONCENTRATION: "Concentração de milhas",
};

export function useAlertasSistemaAtivos(enabled: boolean) {
  return useQuery({
    queryKey: ["alertas_sistema", "ativos"],
    enabled,
    queryFn: async (): Promise<AlertaSistemaEnriched[]> => {
      const { data: rows, error } = await supabase
        .from("alertas_sistema")
        .select(
          "id, tipo_alerta, cliente_id, gestor_id, equipe_id, nivel, mensagem, status, data_criacao, data_resolucao, dedup_key",
        )
        .eq("status", "ativo")
        .order("data_criacao", { ascending: false });

      if (error) throw toQueryError(error, "Não foi possível carregar alertas.");

      const list = (rows ?? []) as AlertaSistemaRow[];
      const ids = [...new Set(list.flatMap((r) => [r.cliente_id, r.gestor_id].filter(Boolean) as string[]))];
      if (ids.length === 0) return [];

      const { data: perfis, error: pErr } = await supabase
        .from("perfis")
        .select("usuario_id, nome_completo")
        .in("usuario_id", ids);
      if (pErr) throw toQueryError(pErr, "Não foi possível carregar nomes.");

      const nomeById: Record<string, string> = {};
      (perfis ?? []).forEach((row: { usuario_id: string; nome_completo: string | null }) => {
        nomeById[row.usuario_id] = (row.nome_completo ?? "").trim() || "—";
      });

      const enriched: AlertaSistemaEnriched[] = list.map((r) => ({
        ...r,
        clienteNome: r.cliente_id ? (nomeById[r.cliente_id] ?? "—") : "—",
        gestorNome: r.gestor_id ? (nomeById[r.gestor_id] ?? "—") : "—",
      }));

      enriched.sort((a, b) => {
        const dn = NIVEL_SORT[a.nivel] - NIVEL_SORT[b.nivel];
        if (dn !== 0) return dn;
        return new Date(b.data_criacao).getTime() - new Date(a.data_criacao).getTime();
      });

      return enriched;
    },
  });
}

export function useAlertasSistemaSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("alertas_sistema_sync");
      if (error) throw toQueryError(error, "Falha ao sincronizar alertas.");
      const n = typeof data === "number" ? data : Number(data);
      return Number.isNaN(n) ? 0 : n;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["alertas_sistema"] });
    },
  });
}

export function useAlertaResolver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("alertas_sistema")
        .update({
          status: "resolvido",
          data_resolucao: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("status", "ativo");
      if (error) throw toQueryError(error, "Não foi possível resolver o alerta.");
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["alertas_sistema"] });
    },
  });
}
