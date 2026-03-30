import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useProgramasCliente } from "@/hooks/useProgramasCliente";
import { usePreferenciasSugestoes } from "@/hooks/usePreferenciasSugestoes";
import { supabase } from "@/lib/supabase";
import { CLASSE_ROTA_VALUES } from "@/lib/smart-award-constants";

export type SmartAwardSuggestion = {
  id: string;
  origem: string;
  destino: string;
  programa: string;
  classe: string;
  milhas_necessarias: number;
  custo_emissao: number;
  valor_tarifa_pagante: number;
  economia: number;
  economia_percentual: number;
  regiao_destino: string;
};

function normalizeProgramKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function routeMatchesClasse(routeClasse: string, preferenciaClasse: string): boolean {
  if (preferenciaClasse === "Todas") return true;
  const allowed = CLASSE_ROTA_VALUES[preferenciaClasse];
  if (!allowed || allowed.length === 0) return true;
  const routeNorm = routeClasse.toLowerCase().trim();
  return allowed.some((c) => routeNorm.includes(c.toLowerCase()));
}

function routeMatchesDestino(regiaoDestino: string, destinos: string[]): boolean {
  if (destinos.includes("Todos")) return true;
  const regiao = regiaoDestino.trim();
  return destinos.some((d) => d === regiao || regiao.includes(d));
}

export const useSmartAwardSuggestions = (managerClientId?: string | null) => {
  const { user } = useAuth();
  const clientId = managerClientId ?? user?.id ?? null;
  const { data: programas = [] } = useProgramasCliente(managerClientId);
  const { preferencias } = usePreferenciasSugestoes(clientId);

  const contasByPrograma = useMemo(() => {
    const map = new Map<string, { saldo: number; custo_medio_milheiro: number }>();
    programas.forEach((row) => {
      const key = normalizeProgramKey(row.program_id);
      const keyName = normalizeProgramKey(row.program_name ?? "");
      const saldo = Number(row.saldo ?? 0);
      const custo = Number(row.custo_medio_milheiro ?? row.custo_medio_milheiro ?? 0);
      map.set(key, { saldo, custo_medio_milheiro: custo });
      if (keyName !== key) map.set(keyName, { saldo, custo_medio_milheiro: custo });
    });
    return map;
  }, [programas]);

  const programKey = useMemo(
    () => programas.map((p) => `${p.program_id}:${p.saldo}`).join("|"),
    [programas],
  );

  const query = useQuery({
    queryKey: ["smart_award_suggestions", clientId, preferencias, programKey],
    enabled: !!clientId,
    retry: false,
    queryFn: async (): Promise<SmartAwardSuggestion[]> => {
      try {
        const { data: rotas, error: rotasErr } = await supabase
          .from("rotas_premium")
          .select("id, origem, destino, programa, classe, milhas_necessarias, taxas_embarque, valor_tarifa_pagante, regiao_destino");
        if (rotasErr) {
          console.warn("[SmartAward] rotas_premium:", rotasErr.message);
          return [];
        }

        const destinos = preferencias?.preferencia_destino ?? ["Todos"];
        const classePref = preferencias?.preferencia_classe ?? "Todas";

        const results: SmartAwardSuggestion[] = [];

        (rotas ?? []).forEach((r) => {
          if (!routeMatchesDestino(String(r.regiao_destino ?? ""), destinos)) return;
          if (!routeMatchesClasse(String(r.classe ?? ""), classePref)) return;

          const programaKey = normalizeProgramKey(String(r.programa ?? ""));
          const conta = contasByPrograma.get(programaKey);
          if (!conta) return;

          const milhas = Number(r.milhas_necessarias ?? 0);
          const saldo = conta.saldo;
          if (saldo < milhas) return;

          const custoMilheiro = conta.custo_medio_milheiro;
          const taxas = Number(r.taxas_embarque ?? 0);
          const tarifaPagante = Number(r.valor_tarifa_pagante ?? 0);
          const custoMilhas = (milhas / 1000) * custoMilheiro;
          const custoEmissao = custoMilhas + taxas;
          const economia = tarifaPagante - custoEmissao;
          if (economia <= 0) return;
          const economiaPercentual = tarifaPagante > 0 ? (economia / tarifaPagante) * 100 : 0;

          results.push({
            id: `sug-${r.id}-${r.origem}-${r.destino}`,
            origem: String(r.origem ?? ""),
            destino: String(r.destino ?? ""),
            programa: String(r.programa ?? ""),
            classe: String(r.classe ?? ""),
            milhas_necessarias: milhas,
            custo_emissao: custoEmissao,
            valor_tarifa_pagante: tarifaPagante,
            economia,
            economia_percentual: economiaPercentual,
            regiao_destino: String(r.regiao_destino ?? ""),
          });
        });

        results.sort((a, b) => {
          if (b.economia !== a.economia) return b.economia - a.economia;
          return b.economia_percentual - a.economia_percentual;
        });

        return results;
      } catch (err) {
        console.warn("[SmartAward] Erro ao carregar sugestões:", err);
        return [];
      }
    },
  });

  return {
    suggestions: query.data ?? [],
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
};
