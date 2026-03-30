import { Card, CardContent } from "@/components/ui/card";
import { Users, Wallet, Coins, TrendingUp, AlertTriangle, BarChart3 } from "lucide-react";

export type GestorKpisProps = {
  kpis: {
    totalClientesAtivos: number;
    milhasSobGestao: number;
    valorEstrategicoTotal: number;
    milhasVencendo90d: number;
    roiMedio: number;
    economiaTotalGestao: number;
    clientesComVencendo90d: number;
  };
  onOpenExpiringClients?: () => void;
};

const GestorKpis = ({ kpis, onOpenExpiringClients }: GestorKpisProps) => {
  const cards = [
    {
      label: "Clientes ativos",
      value: kpis.totalClientesAtivos.toLocaleString("pt-BR"),
      icon: Users,
      className: "text-foreground",
    },
    {
      label: "Valor estratégico sob gestão",
      value: kpis.valorEstrategicoTotal.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 0,
        minimumFractionDigits: 0,
      }),
      icon: Wallet,
      className: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "Total de milhas",
      value: kpis.milhasSobGestao.toLocaleString("pt-BR"),
      icon: Coins,
      className: "text-foreground",
    },
    {
      label: "Economia total gerada",
      value: kpis.economiaTotalGestao.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 0,
        minimumFractionDigits: 0,
      }),
      icon: TrendingUp,
      className: "text-primary",
    },
    {
      label: "Economia média gerada",
      value: kpis.roiMedio.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 0,
        minimumFractionDigits: 0,
      }),
      icon: BarChart3,
      className: "text-muted-foreground",
    },
    {
      id: "expiring-clients",
      label: "Clientes com milhas vencendo <90d",
      value: String(kpis.clientesComVencendo90d),
      icon: AlertTriangle,
      className:
        kpis.clientesComVencendo90d > 0
          ? "text-amber-600 dark:text-amber-400"
          : "text-muted-foreground",
      onClick: onOpenExpiringClients,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3">
      {cards.map((card) => {
        const Icon = card.icon;
        const clickable = typeof card.onClick === "function";
        return (
          <Card
            key={card.label}
            className="overflow-hidden rounded-xl border-border/80 bg-card shadow-sm transition-shadow hover:shadow-md"
          >
            {clickable ? (
              <button
                type="button"
                onClick={card.onClick}
                className="w-full text-left transition-colors hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium leading-4 text-muted-foreground whitespace-normal break-words">
                        {card.label}
                      </p>
                      <p className={`mt-1 truncate text-base font-semibold tabular-nums ${card.className}`}>
                        {card.value}
                      </p>
                    </div>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/80">
                      <Icon className={`h-4 w-4 ${card.className}`} />
                    </div>
                  </div>
                </CardContent>
              </button>
            ) : (
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium leading-4 text-muted-foreground whitespace-normal break-words">
                      {card.label}
                    </p>
                    <p className={`mt-1 truncate text-base font-semibold tabular-nums ${card.className}`}>
                      {card.value}
                    </p>
                  </div>
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/80">
                    <Icon className={`h-4 w-4 ${card.className}`} />
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
};

export default GestorKpis;
