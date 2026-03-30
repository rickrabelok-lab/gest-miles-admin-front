import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { parseMovimentoDate, type Movimento } from "@/lib/program-state";

export const useMovimentosPrograma = (
  clientId?: string | null,
  monthsWindow = 12,
) => {
  return useQuery({
    queryKey: ["movimentos_programa", clientId, monthsWindow],
    enabled: !!clientId,
    queryFn: async () => {
      const limit = new Date();
      limit.setMonth(limit.getMonth() - monthsWindow);
      const limitIso = limit.toISOString().slice(0, 10);

      const { data, error } = await supabase
        .from("movimentos_programa")
        .select("id, data, tipo, descricao, milhas, economia_real, payload")
        .eq("cliente_id", clientId!)
        .gte("data", limitIso)
        .order("data", { ascending: false });

      if (error) throw error;

      const movimentos = (data ?? []).map((row) => {
        const payload = (row.payload ?? {}) as Record<string, unknown>;
        return {
          id: String(row.id),
          data: row.data,
          tipo: row.tipo,
          descricao: row.descricao ?? "",
          milhas: Number(row.milhas ?? 0),
          economiaReal:
            typeof row.economia_real === "number"
              ? row.economia_real
              : undefined,
          valorPago:
            typeof payload.valorPago === "number"
              ? payload.valorPago
              : undefined,
          taxas: typeof payload.taxas === "number" ? payload.taxas : undefined,
          tarifaPagante:
            typeof payload.tarifaPagante === "number"
              ? payload.tarifaPagante
              : undefined,
          custoMilheiroBase:
            typeof payload.custoMilheiroBase === "number"
              ? payload.custoMilheiroBase
              : undefined,
        } as Movimento;
      });

      return movimentos.sort((a, b) => {
        const da = parseMovimentoDate(a.data)?.getTime() ?? 0;
        const db = parseMovimentoDate(b.data)?.getTime() ?? 0;
        return db - da;
      });
    },
  });
};
