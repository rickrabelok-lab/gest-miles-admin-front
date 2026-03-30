import { Card, CardContent } from "@/components/ui/card";
import type { GestorDreConsolidado } from "@/hooks/useGestor";
import { TrendingUp, Calendar } from "lucide-react";

type Props = { dre: GestorDreConsolidado };

const PeriodoCard = ({
  label,
  entradasTotal,
  economiaTotal,
  roiPercentual,
  lucroEstrategico,
}: {
  label: string;
  entradasTotal: number;
  economiaTotal: number;
  roiPercentual: number;
  lucroEstrategico: number;
}) => (
  <Card className="rounded-xl border-border/80">
    <CardContent className="p-3">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
        <Calendar className="h-3.5 w-3.5" />
        {label}
      </p>
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Entradas (R$ investido)</span>
          <span className="tabular-nums font-medium">
            {entradasTotal.toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
              maximumFractionDigits: 0,
            })}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Economia gerada (R$)</span>
          <span className="tabular-nums font-medium text-emerald-600 dark:text-emerald-400">
            {economiaTotal.toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
              maximumFractionDigits: 0,
            })}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">ROI global (%)</span>
          <span className="tabular-nums font-medium">
            {roiPercentual.toFixed(1)}%
          </span>
        </div>
        <div className="flex justify-between border-t border-border/50 pt-1.5">
          <span className="text-muted-foreground">Lucro estratégico acum.</span>
          <span className="tabular-nums font-semibold text-primary">
            {lucroEstrategico.toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
              maximumFractionDigits: 0,
            })}
          </span>
        </div>
      </div>
    </CardContent>
  </Card>
);

const GestorDre = ({ dre }: Props) => {
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <TrendingUp className="h-4 w-4" />
        Resumo financeiro consolidado (DRE das milhas)
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <PeriodoCard label="Últimos 30 dias" {...dre.ultimos30dias} />
        <PeriodoCard label="Últimos 90 dias" {...dre.ultimos90dias} />
        <PeriodoCard label="12 meses" {...dre.ultimos12meses} />
        <PeriodoCard label="Total histórico" {...dre.totalHistorico} />
      </div>
    </div>
  );
};

export default GestorDre;
