import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export type MinhaReuniaoItem = {
  id: string;
  titulo: string;
  startsAt: string;
  equipeNome: string;
  clienteNome: string | null;
};

export function useMinhasReunioes(enabled = true) {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["minhas_reunioes", user?.id],
    enabled: enabled && !!user?.id,
    queryFn: async (): Promise<MinhaReuniaoItem[]> => {
      if (!user?.id) return [];

      const nowIso = new Date().toISOString();

      const { data: participacoes, error: partErr } = await supabase
        .from("reunioes_onboarding_participantes")
        .select("reuniao_id")
        .eq("usuario_id", user.id);
      if (partErr) throw partErr;

      const reuniaoIds = [...new Set((participacoes ?? []).map((p) => p.reuniao_id as string).filter(Boolean))];
      if (reuniaoIds.length === 0) return [];

      const { data: reunioes, error: reunioesErr } = await supabase
        .from("reunioes_onboarding")
        .select("id, titulo, starts_at, equipe_id, cliente_id")
        .in("id", reuniaoIds)
        .gte("starts_at", nowIso)
        .order("starts_at", { ascending: true })
        .limit(50);
      if (reunioesErr) throw reunioesErr;

      const equipeIds = [...new Set((reunioes ?? []).map((r) => r.equipe_id as string).filter(Boolean))];
      const clienteIds = [...new Set((reunioes ?? []).map((r) => r.cliente_id as string).filter(Boolean))];

      const { data: equipesRows, error: equipesErr } = equipeIds.length === 0
        ? { data: [], error: null }
        : await supabase
          .from("equipes")
          .select("id, nome")
          .in("id", equipeIds);
      if (equipesErr) throw equipesErr;

      const { data: clientesRows, error: clientesErr } = clienteIds.length === 0
        ? { data: [], error: null }
        : await supabase
          .from("perfis")
          .select("usuario_id, nome_completo")
          .in("usuario_id", clienteIds);
      if (clientesErr) throw clientesErr;

      const equipeNomeById = new Map<string, string>();
      (equipesRows ?? []).forEach((e) => {
        equipeNomeById.set(e.id as string, ((e.nome as string) ?? "").trim() || "Equipe");
      });

      const clienteNomeById = new Map<string, string>();
      (clientesRows ?? []).forEach((c) => {
        clienteNomeById.set(c.usuario_id as string, ((c.nome_completo as string) ?? "").trim() || "Cliente");
      });

      return (reunioes ?? []).map((r) => ({
        id: r.id as string,
        titulo: (r.titulo as string) ?? "Reunião",
        startsAt: r.starts_at as string,
        equipeNome: equipeNomeById.get(r.equipe_id as string) ?? "Equipe",
        clienteNome: r.cliente_id ? (clienteNomeById.get(r.cliente_id as string) ?? "Cliente") : null,
      }));
    },
  });

  const reunioes = useMemo(() => query.data ?? [], [query.data]);
  return { ...query, reunioes };
}

