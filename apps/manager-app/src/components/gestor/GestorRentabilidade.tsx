import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { GestorClienteResumo } from "@/hooks/useGestor";
import { Trophy, TrendingUp, Target } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = { clients: GestorClienteResumo[] };

const GestorRentabilidade = ({ clients }: Props) => {
  const rankings = useMemo(() => {
    const byEconomia = [...clients].sort((a, b) => b.economiaTotal - a.economiaTotal);
    const byRoi = [...clients].sort((a, b) => b.roiMedio - a.roiMedio);
    const byValor = [...clients].sort((a, b) => b.valorEstimado - a.valorEstimado);
    const byMelhorMilheiro = [...clients].sort(
      (a, b) => (b.melhorMilheiro ?? 0) - (a.melhorMilheiro ?? 0),
    );
    const top5Rentaveis = byEconomia.slice(0, 5);
    const potencialMelhoria = [...clients]
      .filter((c) => c.milhas > 0)
      .sort((a, b) => {
        const scoreA = a.scoreEstrategico - (a.pontosVencendo90d / a.milhas) * 50;
        const scoreB = b.scoreEstrategico - (b.pontosVencendo90d / b.milhas) * 50;
        return scoreA - scoreB;
      })
      .slice(0, 5);
    return {
      byEconomia,
      byRoi,
      byValor,
      byMelhorMilheiro,
      top5Rentaveis,
      potencialMelhoria,
    };
  }, [clients]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="rounded-xl border-border/80">
          <CardContent className="p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Trophy className="h-4 w-4 text-amber-500" />
              Top 5 mais rentáveis (economia total)
            </p>
            <ul className="space-y-1.5">
              {rankings.top5Rentaveis.map((c, i) => (
                <li key={c.clienteId} className="flex justify-between text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="text-muted-foreground w-5">{i + 1}.</span>
                    {c.nome}
                  </span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {c.economiaTotal.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                      maximumFractionDigits: 0,
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-border/80">
          <CardContent className="p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Target className="h-4 w-4 text-primary" />
              Top 5 com potencial de melhoria
            </p>
            <ul className="space-y-1.5">
              {rankings.potencialMelhoria.map((c, i) => (
                <li key={c.clienteId} className="flex justify-between text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="text-muted-foreground w-5">{i + 1}.</span>
                    {c.nome}
                  </span>
                  <span
                    className={cn(
                      "tabular-nums font-medium",
                      c.pontosVencendo90d > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
                    )}
                  >
                    Score {c.scoreEstrategico}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-xl border-border/80">
        <CardContent className="p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            Ranking por ROI médio
          </p>
          <div className="max-h-48 space-y-1 overflow-y-auto text-xs">
            {rankings.byRoi.slice(0, 8).map((c, i) => (
              <div key={c.clienteId} className="flex justify-between">
                <span className="text-muted-foreground w-6">{i + 1}.</span>
                <span className="flex-1 truncate">{c.nome}</span>
                <span
                  className={cn(
                    "tabular-nums font-medium shrink-0",
                    c.roiMedio >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
                  )}
                >
                  {c.roiMedio.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                    maximumFractionDigits: 0,
                  })}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default GestorRentabilidade;
