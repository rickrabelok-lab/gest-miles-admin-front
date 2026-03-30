import { useMemo, useState } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { GestorClienteResumo, RiscoCarteira } from "@/hooks/useGestor";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

type SortKey =
  | "nome"
  | "gestores"
  | "milhas"
  | "valorEstimado"
  | "roiMedio"
  | "melhorMilheiro"
  | "pontosVencendo90d"
  | "ultimaMovimentacao"
  | "scoreEstrategico";

type FilterPreset = "todos" | "roiNegativo" | "milhasVencendo" | "altaRentabilidade" | "inativos";

type Props = {
  clients: GestorClienteResumo[];
  onOpenClient: (clientId: string) => void;
};

const scoreColor = (score: number) => {
  if (score >= 70) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
  if (score >= 40) return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";
  return "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30";
};

const riscoLabel: Record<RiscoCarteira, string> = {
  baixo: "Baixo",
  medio: "Médio",
  alto: "Alto",
};
const riscoDot: Record<RiscoCarteira, string> = {
  baixo: "bg-emerald-500",
  medio: "bg-amber-500",
  alto: "bg-red-500",
};

const GestorClientsTable = ({ clients, onOpenClient }: Props) => {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("scoreEstrategico");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filter, setFilter] = useState<FilterPreset>("todos");

  const filteredAndSorted = useMemo(() => {
    const gestoresHaystack = (c: GestorClienteResumo) =>
      c.gestoresResponsaveis.map((g) => g.nome.toLowerCase()).join(" ");
    const text = search.trim().toLowerCase();
    let list = clients.filter((c) => {
      if (!text) return true;
      return (
        c.nome.toLowerCase().includes(text) || gestoresHaystack(c).includes(text)
      );
    });

    if (filter === "roiNegativo") list = list.filter((c) => c.roiMedio < 0);
    if (filter === "milhasVencendo") list = list.filter((c) => c.pontosVencendo90d > 0);
    if (filter === "altaRentabilidade")
      list = list.filter((c) => c.economiaTotal > 0 && c.roiMedio > 0);
    if (filter === "inativos")
      list = list.filter((c) => !c.ultimaMovimentacao && c.milhas === 0);

    return [...list].sort((a, b) => {
      let diff = 0;
      switch (sortKey) {
        case "nome":
          diff = a.nome.localeCompare(b.nome);
          break;
        case "gestores":
          diff = gestoresHaystack(a).localeCompare(gestoresHaystack(b));
          break;
        case "milhas":
          diff = a.milhas - b.milhas;
          break;
        case "valorEstimado":
          diff = a.valorEstimado - b.valorEstimado;
          break;
        case "roiMedio":
          diff = a.roiMedio - b.roiMedio;
          break;
        case "melhorMilheiro":
          diff = (a.melhorMilheiro ?? 0) - (b.melhorMilheiro ?? 0);
          break;
        case "pontosVencendo90d":
          diff = a.pontosVencendo90d - b.pontosVencendo90d;
          break;
        case "ultimaMovimentacao":
          diff = (a.ultimaMovimentacao ?? "").localeCompare(b.ultimaMovimentacao ?? "");
          break;
        case "scoreEstrategico":
          diff = a.scoreEstrategico - b.scoreEstrategico;
          break;
        default:
          diff = 0;
      }
      return sortDir === "asc" ? diff : -diff;
    });
  }, [clients, search, sortKey, sortDir, filter]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(
        key === "nome" || key === "gestores" || key === "ultimaMovimentacao"
          ? "asc"
          : "desc",
      );
    }
  };

  const SortIcon = ({ column }: { column: SortKey }) =>
    sortKey === column ? (
      sortDir === "asc" ? (
        <ArrowUp className="ml-1 h-3.5 w-3.5 opacity-70" />
      ) : (
        <ArrowDown className="ml-1 h-3.5 w-3.5 opacity-70" />
      )
    ) : (
      <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-40" />
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[140px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar por cliente ou gestor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as FilterPreset)}>
          <SelectTrigger className="h-9 w-[180px] text-xs">
            <SelectValue placeholder="Filtro" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="roiNegativo">ROI negativo</SelectItem>
            <SelectItem value="milhasVencendo">Milhas a vencer</SelectItem>
            <SelectItem value="altaRentabilidade">Alta rentabilidade</SelectItem>
            <SelectItem value="inativos">Inativos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="rounded-xl border-border/80 overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[55vh] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur supports-[backdrop-filter]:bg-muted/80">
                <tr className="border-b border-border">
                  <th className="text-left p-2 font-semibold">
                    <button
                      type="button"
                      className="flex items-center hover:text-foreground"
                      onClick={() => toggleSort("nome")}
                    >
                      Cliente
                      <SortIcon column="nome" />
                    </button>
                  </th>
                  <th className="text-left p-2 font-semibold min-w-[100px] max-w-[140px]">
                    <button
                      type="button"
                      className="flex items-center hover:text-foreground"
                      onClick={() => toggleSort("gestores")}
                    >
                      Gestores
                      <SortIcon column="gestores" />
                    </button>
                  </th>
                  <th className="text-right p-2 font-semibold">
                    <button
                      type="button"
                      className="flex items-center justify-end w-full hover:text-foreground"
                      onClick={() => toggleSort("milhas")}
                    >
                      Saldo
                      <SortIcon column="milhas" />
                    </button>
                  </th>
                  <th className="text-right p-2 font-semibold">
                    <button
                      type="button"
                      className="flex items-center justify-end w-full hover:text-foreground"
                      onClick={() => toggleSort("valorEstimado")}
                    >
                      Valor est.
                      <SortIcon column="valorEstimado" />
                    </button>
                  </th>
                  <th className="text-right p-2 font-semibold">
                    <button
                      type="button"
                      className="flex items-center justify-end w-full hover:text-foreground"
                      onClick={() => toggleSort("roiMedio")}
                    >
                      ROI
                      <SortIcon column="roiMedio" />
                    </button>
                  </th>
                  <th className="text-right p-2 font-semibold">
                    <button
                      type="button"
                      className="flex items-center justify-end w-full hover:text-foreground"
                      onClick={() => toggleSort("melhorMilheiro")}
                    >
                      Melhor/mil
                      <SortIcon column="melhorMilheiro" />
                    </button>
                  </th>
                  <th className="text-right p-2 font-semibold">
                    <button
                      type="button"
                      className="flex items-center justify-end w-full hover:text-foreground"
                      onClick={() => toggleSort("pontosVencendo90d")}
                    >
                      Venc. 90d
                      <SortIcon column="pontosVencendo90d" />
                    </button>
                  </th>
                  <th className="text-right p-2 font-semibold">
                    <button
                      type="button"
                      className="flex items-center justify-end w-full hover:text-foreground"
                      onClick={() => toggleSort("ultimaMovimentacao")}
                    >
                      Últ. mov.
                      <SortIcon column="ultimaMovimentacao" />
                    </button>
                  </th>
                  <th className="text-center p-2 font-semibold">
                    <button
                      type="button"
                      className="flex items-center justify-center w-full hover:text-foreground"
                      onClick={() => toggleSort("scoreEstrategico")}
                    >
                      Score
                      <SortIcon column="scoreEstrategico" />
                    </button>
                  </th>
                  <th className="w-8 p-2" />
                </tr>
              </thead>
              <tbody>
                {filteredAndSorted.map((c) => (
                  <tr
                    key={c.clienteId}
                    className="border-b border-border/50 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => onOpenClient(c.clienteId)}
                  >
                    <td className="p-2">
                      <div className="flex items-center gap-1.5">
                        <span className={cn("h-2 w-2 rounded-full shrink-0", riscoDot[c.riscoCarteira])} />
                        <span className="font-medium truncate max-w-[120px]">{c.nome}</span>
                      </div>
                    </td>
                    <td className="p-2 align-top">
                      <div className="flex max-w-[132px] flex-wrap gap-1">
                        {c.gestoresResponsaveis.length === 0 ? (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        ) : (
                          c.gestoresResponsaveis.map((g) => (
                            <Badge
                              key={g.id}
                              variant="secondary"
                              className="max-w-full truncate px-1.5 py-0 text-[9px] font-normal"
                              title={g.nome}
                            >
                              {g.nome}
                            </Badge>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="p-2 text-right tabular-nums">{c.milhas.toLocaleString("pt-BR")}</td>
                    <td className="p-2 text-right tabular-nums">
                      {c.valorEstimado.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                        maximumFractionDigits: 0,
                      })}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {c.roiMedio.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                        maximumFractionDigits: 0,
                      })}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {c.melhorMilheiro != null
                        ? c.melhorMilheiro.toLocaleString("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                            maximumFractionDigits: 0,
                          })
                        : "-"}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      <span className={c.pontosVencendo90d > 0 ? "text-amber-600 dark:text-amber-400 font-medium" : ""}>
                        {c.pontosVencendo90d.toLocaleString("pt-BR")}
                      </span>
                    </td>
                    <td className="p-2 text-right tabular-nums text-muted-foreground">
                      {c.ultimaMovimentacao
                        ? new Date(c.ultimaMovimentacao).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                          })
                        : "-"}
                    </td>
                    <td className="p-2 text-center">
                      <Badge variant="outline" className={cn("text-[10px] font-semibold border", scoreColor(c.scoreEstrategico))}>
                        {c.scoreEstrategico}
                      </Badge>
                    </td>
                    <td className="p-2 text-muted-foreground text-[10px]">{riscoLabel[c.riscoCarteira]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredAndSorted.length === 0 && (
            <p className="p-4 text-center text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default GestorClientsTable;
