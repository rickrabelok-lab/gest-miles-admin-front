import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Clock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useGestor } from "@/hooks/useGestor";
import { useProgramasCliente } from "@/hooks/useProgramasCliente";
import { Card, CardContent } from "@/components/ui/card";
import type { GestorVencimentoItem } from "@/hooks/useGestor";

type VencimentoMeuItem = {
  programName: string;
  data: string;
  diasRestantes: number;
  quantidade: number;
};

const VencimentosPage = () => {
  const navigate = useNavigate();
  const { role } = useAuth();
  const isGestor = role === "gestor" || role === "admin";

  const { vencimentosTodosClientes } = useGestor(isGestor);
  const { data: meusProgramas } = useProgramasCliente(undefined);

  const vencimentosOrdenados = useMemo(
    () => [...(vencimentosTodosClientes ?? [])].slice(0, 200),
    [vencimentosTodosClientes],
  );

  const meusVencimentos = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const msDia = 1000 * 60 * 60 * 24;
    const items: VencimentoMeuItem[] = [];
    (meusProgramas ?? []).forEach((row) => {
      const state = row.state as { lotes?: Array<{ validadeLote?: string; quantidade?: number }>; movimentos?: Array<{ tipo?: string; validadeLote?: string; milhas?: number }> } | null;
      const lotes = (state?.lotes ?? [])
        .filter((l) => !!l.validadeLote && (l.quantidade ?? 0) > 0)
        .map((l) => ({ validadeLote: l.validadeLote!, quantidade: Number(l.quantidade ?? 0) }));
      const fallback = (state?.movimentos ?? [])
        .filter((m) => m.tipo === "entrada" && !!m.validadeLote && Number(m.milhas ?? 0) > 0)
        .map((m) => ({ validadeLote: m.validadeLote!, quantidade: Number(m.milhas ?? 0) }));
      const lista = lotes.length > 0 ? lotes : fallback;
      lista.forEach((lote) => {
        const validade = new Date(`${lote.validadeLote}T00:00:00`);
        if (Number.isNaN(validade.getTime())) return;
        const diasRestantes = Math.ceil((validade.getTime() - hoje.getTime()) / msDia);
        items.push({
          programName: row.program_name ?? row.program_id,
          data: validade.toLocaleDateString("pt-BR", { timeZone: "UTC" }),
          diasRestantes,
          quantidade: lote.quantidade,
        });
      });
    });
    return items.sort((a, b) => a.diasRestantes - b.diasRestantes).slice(0, 200);
  }, [meusProgramas]);

  const handleOpenClient = (clientId: string) => {
    navigate(`/?clientId=${encodeURIComponent(clientId)}`);
  };

  const titulo = isGestor ? "Próximos vencimentos (todos os clientes)" : "Próximos vencimentos";
  const listaGestor = vencimentosOrdenados.length > 0;
  const listaMeus = !isGestor && meusVencimentos.length > 0;
  const vazio = isGestor ? !listaGestor : meusVencimentos.length === 0;

  return (
    <div className="mx-auto min-h-screen max-w-md bg-background pb-24">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
          >
            <ArrowLeft size={20} strokeWidth={1.5} />
          </button>
          <h1 className="text-base font-semibold tracking-tight">Vencendo</h1>
          <div className="w-9" />
        </div>
      </header>

      <main className="p-4">
        <Card className="rounded-xl border-slate-200/80 bg-white/90 shadow-[0_4px_12px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card dark:shadow-none">
          <CardContent className="p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {titulo}
            </p>
            {vazio ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhum vencimento nos próximos dias na carteira.
              </p>
            ) : listaGestor ? (
              <div className="max-h-[70vh] space-y-1.5 overflow-y-auto">
                {vencimentosOrdenados.map((item: GestorVencimentoItem, idx: number) => (
                  <button
                    key={`${item.clienteId}-${item.programId}-${item.data}-${idx}`}
                    type="button"
                    onClick={() => handleOpenClient(item.clienteId)}
                    className="flex w-full flex-col gap-0.5 rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-2 text-left transition-colors hover:bg-sky-50/70 dark:border-border/80 dark:bg-muted/30 dark:hover:bg-muted/60"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{item.clienteNome}</span>
                      <span
                        className={
                          item.diasRestantes <= 30
                            ? "font-semibold text-red-600 dark:text-red-400"
                            : item.diasRestantes <= 60
                              ? "font-semibold text-amber-600 dark:text-amber-400"
                              : "text-muted-foreground"
                        }
                      >
                        {item.diasRestantes} dias
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{item.programName}</span>
                      <span>
                        {item.quantidade.toLocaleString("pt-BR")} pts · {item.data}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : listaMeus ? (
              <div className="max-h-[70vh] space-y-1.5 overflow-y-auto">
                {meusVencimentos.map((item, idx) => (
                  <div
                    key={`${item.programName}-${item.data}-${idx}`}
                    className="flex flex-col gap-0.5 rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-2 dark:border-border/80 dark:bg-muted/30"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{item.programName}</span>
                      <span
                        className={
                          item.diasRestantes <= 30
                            ? "font-semibold text-red-600 dark:text-red-400"
                            : item.diasRestantes <= 60
                              ? "font-semibold text-amber-600 dark:text-amber-400"
                              : "text-muted-foreground"
                        }
                      >
                        {item.diasRestantes} dias
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {item.quantidade.toLocaleString("pt-BR")} pts · {item.data}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default VencimentosPage;
