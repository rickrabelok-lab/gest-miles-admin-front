import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim());
}

function invalidateCsClienteQueries(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: ["cs_gestores_dashboard"] });
  void qc.invalidateQueries({ queryKey: ["cliente_gestores"] });
  void qc.invalidateQueries({ queryKey: ["cliente_gestores_perfis"] });
  void qc.invalidateQueries({ queryKey: ["gestor_co_gestores_por_cliente"] });
  void qc.invalidateQueries({ queryKey: ["gestor_programas_cliente"] });
  void qc.invalidateQueries({ queryKey: ["gestor_demandas_cliente"] });
}

/** CS vincula um usuário-cliente (UUID do Auth) a um gestor (vínculo direto cs_gestores / gestor único). */
export function useCsVincularCliente() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { clienteId: string; gestorId: string }) => {
      const cliente_id = input.clienteId.trim().toLowerCase();
      const gestor_id = input.gestorId.trim();
      if (!isUuid(cliente_id) || !isUuid(gestor_id)) {
        throw new Error("Use UUIDs válidos (cliente e gestor).");
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) throw new Error("Faça login novamente.");

      const { error } = await supabase.from("cliente_gestores").insert({
        cliente_id,
        gestor_id,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateCsClienteQueries(queryClient),
  });
}

/**
 * CS vincula o cliente a todos os gestores da equipe (`equipe_gestores`).
 * Cada gestor ganha uma linha em `cliente_gestores` (o cliente aparece na carteira de todos).
 */
export function useCsVincularClienteNaEquipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { clienteId: string; equipeId: string }) => {
      const cliente_id = input.clienteId.trim().toLowerCase();
      const equipe_id = input.equipeId.trim();
      if (!isUuid(cliente_id) || !isUuid(equipe_id)) {
        throw new Error("Use UUIDs válidos (cliente e equipe).");
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) throw new Error("Faça login novamente.");

      const { data: rows, error: egErr } = await supabase
        .from("equipe_gestores")
        .select("gestor_id")
        .eq("equipe_id", equipe_id);
      if (egErr) throw egErr;
      const gestorIds = [...new Set((rows ?? []).map((r) => r.gestor_id as string).filter(Boolean))];
      if (gestorIds.length === 0) {
        throw new Error("Esta equipe não tem gestores em equipe_gestores.");
      }

      let linked = 0;
      let skipped = 0;
      for (const gestor_id of gestorIds) {
        const { error } = await supabase.from("cliente_gestores").insert({ cliente_id, gestor_id });
        if (error) {
          if (error.code === "23505") {
            skipped += 1;
            continue;
          }
          throw error;
        }
        linked += 1;
      }
      return { linked, skipped, total: gestorIds.length };
    },
    onSuccess: () => invalidateCsClienteQueries(queryClient),
  });
}
