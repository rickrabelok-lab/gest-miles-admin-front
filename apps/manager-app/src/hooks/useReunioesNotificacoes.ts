import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export type ReuniaoNotificacaoResumo = {
  total: number;
  horarios: string[];
};

export function useReunioesNotificacoes(enabled = true) {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["reunioes_notificacoes_dia", user?.id],
    enabled: enabled && !!user?.id,
    queryFn: async (): Promise<ReuniaoNotificacaoResumo> => {
      if (!user?.id) return { total: 0, horarios: [] };

      const now = new Date();
      const inicio = new Date(now);
      inicio.setHours(0, 0, 0, 0);
      const fim = new Date(now);
      fim.setHours(23, 59, 59, 999);

      const { data: participacoes, error: partErr } = await supabase
        .from("reunioes_onboarding_participantes")
        .select("reuniao_id")
        .eq("usuario_id", user.id);
      if (partErr) throw partErr;

      const reuniaoIds = [...new Set((participacoes ?? []).map((p) => p.reuniao_id as string).filter(Boolean))];
      if (reuniaoIds.length === 0) return { total: 0, horarios: [] };

      const { data: reunioes, error: reunioesErr } = await supabase
        .from("reunioes_onboarding")
        .select("id, starts_at")
        .in("id", reuniaoIds)
        .gte("starts_at", inicio.toISOString())
        .lte("starts_at", fim.toISOString())
        .order("starts_at", { ascending: true });
      if (reunioesErr) throw reunioesErr;

      const horarios = (reunioes ?? []).map((r) =>
        new Date(r.starts_at as string).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );

      return { total: horarios.length, horarios };
    },
  });

  const resumo = useMemo(() => query.data ?? { total: 0, horarios: [] }, [query.data]);
  return { ...query, resumo };
}
