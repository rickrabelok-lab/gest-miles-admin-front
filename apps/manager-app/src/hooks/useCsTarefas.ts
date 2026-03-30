import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";

export type PrioridadeTarefa = "baixa" | "media" | "alta" | "critica";
export type StatusTarefa = "pendente" | "em_andamento" | "concluida";

export type TipoTarefa =
  | "FOLLOW_UP_CLIENTE"
  | "ANALISE_ATENDIMENTO"
  | "ANALISE_GESTOR"
  | "REATIVACAO_CLIENTE"
  | "COBRANCA_GESTOR";

export type TarefaCsRow = {
  id: string;
  alerta_id: string;

  tipo_tarefa: TipoTarefa;
  cliente_id: string | null;
  gestor_id: string | null;
  equipe_id: string | null;

  prioridade: PrioridadeTarefa;
  titulo: string;
  descricao: string;
  status: StatusTarefa;

  responsavel_id: string | null;
  data_criacao: string;
  data_vencimento: string;
};

export type TarefaCsEnriched = TarefaCsRow & {
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

export const PRIORIDADE_SORT: Record<PrioridadeTarefa, number> = {
  critica: 0,
  alta: 1,
  media: 2,
  baixa: 3,
};

export function useCsTarefas(enabled: boolean) {
  return useQuery({
    queryKey: ["tarefas_cs"],
    enabled,
    queryFn: async (): Promise<TarefaCsEnriched[]> => {
      const { data: rows, error } = await supabase
        .from("tarefas_cs")
        .select(
          "id, alerta_id, tipo_tarefa, cliente_id, gestor_id, equipe_id, prioridade, titulo, descricao, status, responsavel_id, data_criacao, data_vencimento",
        )
        .order("data_criacao", { ascending: false });

      if (error) throw toQueryError(error, "Não foi possível carregar as tarefas do CS.");

      const list = (rows ?? []) as TarefaCsRow[];
      const ids = [...new Set(list.flatMap((r) => [r.cliente_id, r.gestor_id].filter(Boolean) as string[]))];
      if (ids.length === 0) return list.map((r) => ({ ...r, clienteNome: "—", gestorNome: "—" }));

      const { data: perfis, error: pErr } = await supabase
        .from("perfis")
        .select("usuario_id, nome_completo")
        .in("usuario_id", ids);
      if (pErr) throw toQueryError(pErr, "Não foi possível carregar nomes dos clientes/gestores.");

      const nomeById: Record<string, string> = {};
      (perfis ?? []).forEach((row: { usuario_id: string; nome_completo: string | null }) => {
        nomeById[row.usuario_id] = (row.nome_completo ?? "").trim() || "—";
      });

      const enriched: TarefaCsEnriched[] = list.map((r) => ({
        ...r,
        clienteNome: r.cliente_id ? nomeById[r.cliente_id] ?? "—" : "—",
        gestorNome: r.gestor_id ? nomeById[r.gestor_id] ?? "—" : "—",
      }));

      enriched.sort((a, b) => {
        const dp = PRIORIDADE_SORT[a.prioridade] - PRIORIDADE_SORT[b.prioridade];
        if (dp !== 0) return dp;
        return new Date(b.data_criacao).getTime() - new Date(a.data_criacao).getTime();
      });

      return enriched;
    },
  });
}

export function useCsTarefasSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("tarefas_cs_sync_from_alertas");
      if (error) throw toQueryError(error, "Falha ao sincronizar tarefas.");
      const n = typeof data === "number" ? data : Number(data);
      return Number.isNaN(n) ? 0 : n;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["tarefas_cs"] });
    },
  });
}

export function useCsTarefasUpdateStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { tarefaId: string; nextStatus: StatusTarefa }): Promise<void> => {
      const { error } = await supabase
        .from("tarefas_cs")
        .update({ status: input.nextStatus })
        .eq("id", input.tarefaId);
      if (error) throw toQueryError(error, "Não foi possível atualizar o status da tarefa.");
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["tarefas_cs"] });
    },
  });
}

