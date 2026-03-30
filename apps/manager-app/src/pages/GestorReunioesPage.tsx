import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useMinhasReunioes } from "@/hooks/useMinhasReunioes";

const GestorReunioesPage = () => {
  const navigate = useNavigate();
  const { reunioes, isLoading } = useMinhasReunioes(true);

  return (
    <div className="mx-auto min-h-screen w-full max-w-md bg-nubank-bg p-4 pb-24 dark:bg-background">
      <header className="mb-4 flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => navigate("/gestor")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-semibold">Agenda de reuniões</h1>
      </header>

      <Card className="rounded-xl border-border/80 bg-white/95 shadow-nubank dark:border-border dark:bg-card">
        <CardHeader className="pb-2 pt-4">
          <p className="text-sm font-semibold text-foreground">Minhas reuniões</p>
          <p className="text-xs text-muted-foreground">
            Lista completa das próximas reuniões em que você foi marcado.
          </p>
        </CardHeader>
        <CardContent className="space-y-2 pb-4 pt-0">
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Carregando reuniões...</p>
          ) : reunioes.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma reunião agendada para você.</p>
          ) : (
            <div className="max-h-[70vh] space-y-2 overflow-y-auto">
              {reunioes.map((reuniao) => (
                <div key={reuniao.id} className="rounded-lg border border-border/70 bg-background/60 p-2">
                  <p className="text-xs font-semibold">{reuniao.titulo}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(reuniao.startsAt).toLocaleDateString("pt-BR")} às{" "}
                    {new Date(reuniao.startsAt).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {reuniao.equipeNome}
                    {reuniao.clienteNome ? ` · ${reuniao.clienteNome}` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default GestorReunioesPage;

