import { Card, CardContent } from "@/components/ui/card";
import type { LogAcaoRow } from "@/hooks/useGestorLogs";
import { History } from "lucide-react";

type Props = { logs: LogAcaoRow[]; loading?: boolean };

const tipoLabel: Record<string, string> = {
  gestor_visualizou_cliente: "Visualizou cliente",
  atualizacao_manual_programa: "Atualização manual (programa)",
  reset_saldos: "Reset de saldos",
  emissao_registrada: "Emissão registrada",
};

const GestorHistorico = ({ logs, loading }: Props) => {
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <History className="h-4 w-4" />
        Histórico de ações do gestor
      </p>
      <Card className="rounded-xl border-border/80">
        <CardContent className="p-0">
          {loading ? (
            <p className="p-4 text-center text-sm text-muted-foreground">Carregando...</p>
          ) : logs.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Nenhuma ação registrada ainda.
            </p>
          ) : (
            <ul className="max-h-[50vh] overflow-y-auto divide-y divide-border/50">
              {logs.map((log) => (
                <li key={log.id} className="p-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="font-medium">
                      {tipoLabel[log.tipo_acao] ?? log.tipo_acao}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {new Date(log.created_at).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  {log.entidade_id && (
                    <p className="mt-0.5 text-muted-foreground">ID: {log.entidade_id}</p>
                  )}
                  {log.details && typeof log.details === "object" && Object.keys(log.details).length > 0 && (
                    <p className="mt-0.5 text-muted-foreground truncate">
                      {JSON.stringify(log.details)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default GestorHistorico;
