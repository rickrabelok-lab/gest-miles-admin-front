import { useNavigate } from "react-router-dom";
import { Settings2, Sparkles } from "lucide-react";

import { useSmartAwardSuggestions } from "@/hooks/useSmartAwardSuggestions";
import { Button } from "@/components/ui/button";

type SmartRedemptionSuggestionsProps = {
  /** Cliente cujos saldos e preferências serão usados (null = usuário logado). */
  clientId?: string | null;
};

const SmartRedemptionSuggestions = ({ clientId }: SmartRedemptionSuggestionsProps) => {
  const navigate = useNavigate();
  const { suggestions, loading, error } = useSmartAwardSuggestions(clientId);

  return (
    <section className="space-y-4 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Sparkles className="h-4 w-4 text-[#8A05BE]" />
          Smart Redemption Suggestions
        </h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 rounded-full border-border text-xs font-medium"
          onClick={() => navigate("/preferencias-sugestoes")}
        >
          <Settings2 className="h-3.5 w-3.5" />
          Preferências
        </Button>
      </div>

      {loading && (
        <p className="text-xs text-muted-foreground">Buscando sugestões...</p>
      )}
      {error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error instanceof Error ? error.message : "Erro ao carregar sugestões."}
        </p>
      )}
      {!loading && !error && suggestions.length === 0 && (
        <div className="rounded-xl border border-border/80 bg-card p-4 text-center shadow-nubank">
          <p className="text-xs font-medium text-muted-foreground">
            Nenhuma sugestão no momento.
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Ajuste suas preferências ou confira se há rotas premium e saldo nos programas. Se as tabelas do Smart Award ainda não foram criadas, execute a migration no Supabase.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 rounded-full"
            onClick={() => navigate("/preferencias-sugestoes")}
          >
            Configurar preferências
          </Button>
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
        {suggestions.map((s) => (
          <div
            key={s.id}
            className="min-w-[280px] max-w-[320px] shrink-0 rounded-xl border border-border/80 bg-card p-4 shadow-nubank transition-all duration-300 ease-out hover:shadow-nubank-hover"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2">
              <span className="text-xs font-semibold text-foreground">
                {s.origem} → {s.destino}
              </span>
              <span className="rounded-full bg-[#8A05BE]/15 px-2 py-0.5 text-[10px] font-semibold text-[#8A05BE]">
                {s.programa}
              </span>
            </div>
            <div className="mt-2 space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Classe</span>
                <span className="font-medium">{s.classe}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Milhas necessárias</span>
                <span className="font-medium">{s.milhas_necessarias.toLocaleString("pt-BR")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Custo real da emissão</span>
                <span className="font-medium">
                  {s.custo_emissao.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valor da tarifa pagante</span>
                <span className="font-medium">
                  {s.valor_tarifa_pagante.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </span>
              </div>
              <div className="mt-2 flex justify-between border-t border-border/60 pt-2">
                <span className="font-semibold text-emerald-700">Economia estimada</span>
                <span className="font-bold text-emerald-700">
                  {s.economia.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Economia percentual</span>
                <span className="font-semibold text-emerald-700">
                  {s.economia_percentual.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default SmartRedemptionSuggestions;
