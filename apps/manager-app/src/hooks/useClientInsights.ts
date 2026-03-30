import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";

export type InsightNivel = "baixo" | "medio" | "alto" | "critico";
export type InsightStatus = "ativo" | "resolvido";
export type InsightTipoInsight =
  | "CHURN_RISK"
  | "SATISFACTION_DROP"
  | "EMISSION_OPPORTUNITY"
  | "UPSELL_OPPORTUNITY"
  | "LOW_USAGE"
  | "HIGH_ENGAGEMENT";

export type ClientInsightRow = {
  id: string;
  cliente_id: string;
  gestor_id: string;
  equipe_id: string | null;
  tipo_insight: InsightTipoInsight;
  titulo: string;
  descricao: string;
  nivel: InsightNivel;
  status: InsightStatus;
  data_criacao: string;
};

export type ClientInsightEnriched = ClientInsightRow & {
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

export type ClientInsightsFilters = {
  status: "all" | InsightStatus;
};

export function useClientInsights(clienteId: string | null, enabled: boolean, filters: ClientInsightsFilters) {
  const queryKey = useMemo(
    () => ["insights_cliente", clienteId, filters.status],
    [clienteId, filters.status],
  );

  return useQuery({
    queryKey,
    enabled: enabled && !!clienteId,
    queryFn: async (): Promise<ClientInsightEnriched[]> => {
      if (!clienteId) return [];

      let q = supabase
        .from("insights_cliente")
        .select(
          "id, cliente_id, gestor_id, equipe_id, tipo_insight, titulo, descricao, nivel, status, data_criacao",
        )
        .eq("cliente_id", clienteId)
        .order("data_criacao", { ascending: false });

      if (filters.status !== "all") {
        q = q.eq("status", filters.status);
      }

      const { data: rows, error } = await q;
      if (error) throw toQueryError(error, "Não foi possível carregar insights do cliente.");

      const list = (rows ?? []) as ClientInsightRow[];
      const gestorIds = [...new Set(list.map((r) => r.gestor_id).filter(Boolean))];

      if (gestorIds.length === 0) {
        return list.map((r) => ({ ...r, gestorNome: "—" }));
      }

      const { data: perfis, error: pErr } = await supabase
        .from("perfis")
        .select("usuario_id, nome_completo")
        .in("usuario_id", gestorIds);
      if (pErr) throw toQueryError(pErr, "Não foi possível carregar nomes de gestores.");

      const nomeById: Record<string, string> = {};
      (perfis ?? []).forEach((p: { usuario_id: string; nome_completo: string | null }) => {
        nomeById[p.usuario_id] = (p.nome_completo ?? "").trim() || "—";
      });

      return list.map((r) => ({
        ...r,
        gestorNome: nomeById[r.gestor_id] ?? "—",
      }));
    },
  });
}

export function useResolveClientInsight() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { insightId: string }) => {
      const { error } = await supabase
        .from("insights_cliente")
        .update({ status: "resolvido" })
        .eq("id", input.insightId)
        .eq("status", "ativo");
      if (error) throw toQueryError(error, "Não foi possível marcar o insight como resolvido.");
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["insights_cliente"] });
    },
  });
}

export function useTriggerTaskFromInsight() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { insightId: string }) => {
      const { data, error } = await supabase.rpc("insights_cliente_trigger_task_from_insight", {
        p_insight_id: input.insightId,
      });

      // Alguns setups retornam void/null.
      if (error) throw toQueryError(error, "Não foi possível criar a tarefa a partir do insight.");
      return data;
    },
    onSuccess: async () => {
      // Não temos uma query única das tarefas aqui; ainda assim invalida.
      await qc.invalidateQueries({ queryKey: ["insights_cliente"] });
    },
  });
}

export function useClientInsightsStatusDefault() {
  const [filters, setFilters] = useState<ClientInsightsFilters>({ status: "ativo" });
  return { filters, setFilters };
}

export function useClientInsightsSyncForClient() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { clienteId: string }) => {
      const { error } = await supabase.rpc("insights_cliente_sync_for_cliente", {
        p_cliente_id: input.clienteId,
      });
      if (error) throw toQueryError(error, "Não foi possível sincronizar insights do cliente.");
    },
    onSuccess: async (_data, variables) => {
      // Invalida todas variações de status (ativo/resolvido/todos) para este cliente.
      await qc.invalidateQueries({ queryKey: ["insights_cliente", variables.clienteId] });
    },
  });
}

