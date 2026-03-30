import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { GestorClienteResumo } from "@/hooks/useGestor";
import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = { clients: GestorClienteResumo[] };

const GestorComparativo = ({ clients }: Props) => {
  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <BarChart3 className="h-4 w-4" />
        Comparativo de todos os clientes da carteira
      </p>

      {clients.length > 0 && (
        <Card className="rounded-xl border-border/80 overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="p-2 text-left font-semibold">Métrica</th>
                    {clients.map((c) => (
                      <th key={c.clienteId} className="min-w-[90px] shrink-0 p-2 text-right font-semibold">
                        {c.nome}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/50">
                    <td className="p-2 text-muted-foreground align-top">Gestores</td>
                    {clients.map((c) => (
                      <td
                        key={`${c.clienteId}-gestores`}
                        className="min-w-[90px] shrink-0 p-2 text-right text-[10px] leading-tight text-muted-foreground"
                      >
                        {c.gestoresResponsaveis.length === 0
                          ? "—"
                          : c.gestoresResponsaveis.map((g) => g.nome).join(", ")}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="p-2 text-muted-foreground">ROI médio</td>
                    {clients.map((c) => (
                      <td key={c.clienteId} className="min-w-[90px] shrink-0 p-2 text-right tabular-nums font-medium">
                        {c.roiMedio.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                          maximumFractionDigits: 0,
                        })}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="p-2 text-muted-foreground">Custo médio/milheiro (est.)</td>
                    {clients.map((c) => (
                      <td key={c.clienteId} className="min-w-[90px] shrink-0 p-2 text-right tabular-nums">
                        {c.milhas > 0
                          ? ((c.valorEstimado / c.milhas) * 1000).toLocaleString("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                              maximumFractionDigits: 0,
                            })
                          : "-"}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="p-2 text-muted-foreground">Economia total</td>
                    {clients.map((c) => (
                      <td key={c.clienteId} className="min-w-[90px] shrink-0 p-2 text-right tabular-nums font-medium text-emerald-600 dark:text-emerald-400">
                        {c.economiaTotal.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                          maximumFractionDigits: 0,
                        })}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="p-2 text-muted-foreground">Score estratégico</td>
                    {clients.map((c) => (
                      <td key={c.clienteId} className="min-w-[90px] shrink-0 p-2 text-right">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-semibold",
                            c.scoreEstrategico >= 70
                              ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                              : c.scoreEstrategico >= 40
                                ? "border-amber-500/30 text-amber-700 dark:text-amber-400"
                                : "border-red-500/30 text-red-700 dark:text-red-400",
                          )}
                        >
                          {c.scoreEstrategico}
                        </Badge>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {clients.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nenhum cliente na carteira para comparar.
        </p>
      )}
    </div>
  );
};

export default GestorComparativo;
