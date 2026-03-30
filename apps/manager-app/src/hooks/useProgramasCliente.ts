import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import {
  normalizePersistedProgramState,
  stripPersistedMetaForServer,
  type PersistedProgramState,
  type ProgramaClienteRow,
} from "@/lib/program-state";

type SaveProgramInput = {
  programId: string;
  programName: string;
  logo?: string | null;
  logoColor?: string | null;
  logoImageUrl?: string | null;
  clubeNome?: string | null;
  state: PersistedProgramState;
};

export const useProgramasCliente = (managerClientId?: string | null) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const clientId = managerClientId ?? user?.id ?? null;

  const query = useQuery({
    queryKey: ["programas_cliente", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("programas_cliente")
        .select("*")
        .eq("cliente_id", clientId!)
        .order("updated_at", { ascending: false });

      if (error) throw error;
      const rows = (data ?? []) as ProgramaClienteRow[];
      // Filtro de segurança: só retorna linhas do cliente solicitado (defesa em profundidade).
      return rows.filter((row) => row.cliente_id === clientId);
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (input: SaveProgramInput) => {
      if (!clientId) throw new Error("Usuário sem cliente selecionado.");
      const payload = {
        cliente_id: clientId,
        program_id: input.programId,
        program_name: input.programName,
        logo: input.logo ?? null,
        logo_color: input.logoColor ?? null,
        logo_image_url: input.logoImageUrl ?? null,
        clube_nome: input.clubeNome ?? null,
        saldo: input.state.saldo,
        custo_medio_milheiro: input.state.custoMedioMilheiro,
        custo_saldo: input.state.custoSaldo,
        state: stripPersistedMetaForServer(input.state),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("programas_cliente")
        .upsert(payload, { onConflict: "cliente_id,program_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["programas_cliente", clientId] });
    },
  });

  const byProgramId = useMemo(() => {
    const map = new Map<string, ProgramaClienteRow>();
    (query.data ?? []).forEach((row) => map.set(row.program_id, row));
    return map;
  }, [query.data]);

  const getProgramState = (programId: string): PersistedProgramState =>
    normalizePersistedProgramState(byProgramId.get(programId)?.state);

  return {
    ...query,
    clientId,
    byProgramId,
    getProgramState,
    saveProgramState: saveMutation.mutateAsync,
    saveProgramStatePending: saveMutation.isPending,
  };
};
