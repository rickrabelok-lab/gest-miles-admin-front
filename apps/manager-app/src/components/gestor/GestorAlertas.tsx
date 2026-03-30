import { useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { GestorClienteResumo } from "@/hooks/useGestor";
import { cn } from "@/lib/utils";

const ALERTAS_RESOLVIDOS_KEY = "mile-manager:gestor-alertas-resolvidos";

type AlertaTipo =
  | "milhas_a_vencer"
  | "emissao_abaixo_custo"
  | "roi_negativo"
  | "concentracao";

type AlertaItem = {
  id: string;
  tipo: AlertaTipo;
  clienteId: string;
  clienteNome: string;
  gestoresLabel?: string;
  titulo: string;
  descricao: string;
  severidade: "alta" | "media" | "baixa";
};

type Props = {
  clients: GestorClienteResumo[];
  onOpenClient: (clientId: string) => void;
};

const getResolvidos = (): Set<string> => {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(ALERTAS_RESOLVIDOS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
};

const setResolvido = (id: string, resolved: boolean) => {
  if (typeof window === "undefined") return;
  const set = getResolvidos();
  if (resolved) set.add(id);
  else set.delete(id);
  window.localStorage.setItem(ALERTAS_RESOLVIDOS_KEY, JSON.stringify([...set]));
};

const GestorAlertas = ({ clients, onOpenClient }: Props) => {
  const [resolvidos, setResolvidosState] = useState<Set<string>>(getResolvidos);

  const alertas = useMemo<AlertaItem[]>(() => {
    const out: AlertaItem[] = [];
    clients.forEach((c) => {
      const gestoresLabel =
        c.gestoresResponsaveis.length > 0
          ? c.gestoresResponsaveis.map((g) => g.nome).join(" · ")
          : undefined;
      if (c.pontosVencendo90d > 0) {
        out.push({
          id: `vencer-${c.clienteId}`,
          tipo: "milhas_a_vencer",
          clienteId: c.clienteId,
          clienteNome: c.nome,
          gestoresLabel,
          titulo: "Milhas a vencer",
          descricao: `${c.pontosVencendo90d.toLocaleString("pt-BR")} pts vencem em 90 dias`,
          severidade: c.pontosVencendo90d / (c.milhas || 1) > 0.2 ? "alta" : "media",
        });
      }
      if (c.roiMedio < 0) {
        out.push({
          id: `roi-${c.clienteId}`,
          tipo: "roi_negativo",
          clienteId: c.clienteId,
          clienteNome: c.nome,
          gestoresLabel,
          titulo: "ROI negativo",
          descricao: "Média de economia das emissões está negativa",
          severidade: "alta",
        });
      }
      if (c.concentracaoMaxima > 60) {
        out.push({
          id: `conc-${c.clienteId}`,
          tipo: "concentracao",
          clienteId: c.clienteId,
          clienteNome: c.nome,
          gestoresLabel,
          titulo: "Concentração alta",
          descricao: `${c.concentracaoMaxima.toFixed(0)}% em um único programa`,
          severidade: c.concentracaoMaxima > 80 ? "alta" : "media",
        });
      }
    });
    return out;
  }, [clients]);

  const naoResolvidos = useMemo(
    () => alertas.filter((a) => !resolvidos.has(a.id)),
    [alertas, resolvidos],
  );

  const marcarResolvido = (id: string) => {
    setResolvido(id, true);
    setResolvidosState(getResolvidos());
  };

  const severidadeClass = {
    alta: "border-red-500/40 bg-red-500/5 dark:bg-red-500/10",
    media: "border-amber-500/40 bg-amber-500/5 dark:bg-amber-500/10",
    baixa: "border-slate-300/40 dark:border-slate-600/40 bg-muted/50",
  };

  return (
    <div className="space-y-3">
      <Card className="rounded-xl border-border/80">
        <CardContent className="p-3">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <AlertTriangle className="h-4 w-4" />
            Alertas centralizados ({naoResolvidos.length})
          </p>
          {naoResolvidos.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum alerta pendente.
            </p>
          ) : (
            <ul className="space-y-2">
              {naoResolvidos.map((a) => (
                <li
                  key={a.id}
                  className={cn(
                    "rounded-lg border p-3 transition-colors",
                    severidadeClass[a.severidade],
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm">{a.clienteNome}</p>
                      {a.gestoresLabel && (
                        <p className="text-[10px] text-muted-foreground">
                          Gestores: {a.gestoresLabel}
                        </p>
                      )}
                      <p className="text-xs font-medium text-muted-foreground">{a.titulo}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{a.descricao}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          marcarResolvido(a.id);
                        }}
                        title="Marcar como resolvido"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Abrir cliente"
                        onClick={() => onOpenClient(a.clienteId)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default GestorAlertas;
