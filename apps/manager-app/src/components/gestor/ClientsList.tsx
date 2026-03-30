import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { GestorClienteResumo } from "@/hooks/useGestor";

type Props = {
  clients: GestorClienteResumo[];
  onOpenClient: (clientId: string) => void;
};

const ClientsList = ({ clients, onOpenClient }: Props) => {
  const [search, setSearch] = useState("");
  const [riskOnly, setRiskOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"valor" | "milhas" | "nome">("valor");

  const filtered = useMemo(() => {
    const text = search.trim().toLowerCase();
    const base = clients
      .filter((client) => {
        if (!text) return true;
        const gestoresHay = client.gestoresResponsaveis.some((g) =>
          g.nome.toLowerCase().includes(text),
        );
        return client.nome.toLowerCase().includes(text) || gestoresHay;
      })
      .filter((client) => (riskOnly ? client.pontosVencendo90d > 0 : true));

    return [...base].sort((a, b) => {
      if (sortBy === "nome") return a.nome.localeCompare(b.nome);
      if (sortBy === "milhas") return b.milhas - a.milhas;
      return b.valorEstimado - a.valorEstimado;
    });
  }, [clients, riskOnly, search, sortBy]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar cliente ou gestor..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRiskOnly((prev) => !prev)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              riskOnly
                ? "bg-red-100 text-red-700"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {riskOnly ? "Somente com risco" : "Filtrar risco de expiração"}
          </button>
          <Select
            value={sortBy}
            onValueChange={(value) =>
              setSortBy(value as "valor" | "milhas" | "nome")
            }
          >
            <SelectTrigger className="h-8 w-[170px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="valor">Ordenar por valor</SelectItem>
              <SelectItem value="milhas">Ordenar por milhas</SelectItem>
              <SelectItem value="nome">Ordenar por nome</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        {filtered.map((client) => (
          <Card
            key={client.clienteId}
            className="cursor-pointer rounded-2xl hover:border-primary/40"
            onClick={() => onOpenClient(client.clienteId)}
          >
            <CardContent className="space-y-1 p-3 text-xs">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{client.nome}</p>
                <p className="text-muted-foreground">
                  {client.ultimaAtualizacao
                    ? new Date(client.ultimaAtualizacao).toLocaleDateString("pt-BR")
                    : "-"}
                </p>
              </div>
              {client.gestoresResponsaveis.length > 0 && (
                <p className="text-[10px] leading-snug text-muted-foreground">
                  <span className="font-medium text-foreground/80">Gestores: </span>
                  {client.gestoresResponsaveis.map((g) => g.nome).join(" · ")}
                </p>
              )}
              <div className="flex items-center justify-between">
                <p className="text-muted-foreground">Milhas</p>
                <p className="font-semibold">{client.milhas.toLocaleString("pt-BR")}</p>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-muted-foreground">Valor estimado</p>
                <p className="font-semibold">
                  {client.valorEstimado.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                    maximumFractionDigits: 0,
                  })}
                </p>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-muted-foreground">Pontos a vencer</p>
                <p
                  className={
                    client.pontosVencendo90d > 0 ? "font-semibold text-red-600" : "font-semibold"
                  }
                >
                  {client.pontosVencendo90d.toLocaleString("pt-BR")}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default ClientsList;
