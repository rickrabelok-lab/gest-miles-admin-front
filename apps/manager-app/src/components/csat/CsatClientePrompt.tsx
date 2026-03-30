import { useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { submitCsatAvaliacao, useCsatCliente } from "@/hooks/useCsatCliente";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function pendingKey(gestorId: string, mesRef: string) {
  return `${gestorId}|${mesRef}`;
}

/**
 * Modal CSAT mensal (1–5 estrelas) para cliente_gestao.
 */
export default function CsatClientePrompt() {
  const { user, role } = useAuth();
  const enabled = role === "cliente_gestao" && !!user?.id;
  const { pending, gestorNomeById, isLoading, refetch } = useCsatCliente(enabled, user?.id);

  const [open, setOpen] = useState(false);
  const [nota, setNota] = useState<number | null>(null);
  const [comentario, setComentario] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const dismissed = useRef<Set<string>>(new Set());

  const current = pending[0];

  useEffect(() => {
    if (!current) {
      setOpen(false);
      return;
    }
    const k = pendingKey(current.gestor_id, current.mes_referencia);
    if (dismissed.current.has(k)) return;
    setOpen(true);
    setNota(null);
    setComentario("");
  }, [current?.gestor_id, current?.mes_referencia]);

  const gestorNome = current ? gestorNomeById[current.gestor_id] ?? "seu gestor" : "";

  const handleLater = () => {
    if (current) dismissed.current.add(pendingKey(current.gestor_id, current.mes_referencia));
    setOpen(false);
  };

  const handleSubmit = async () => {
    if (!user?.id || !current || nota === null) {
      toast.error("Selecione uma avaliação de 1 a 5 estrelas.");
      return;
    }
    setSubmitting(true);
    try {
      await submitCsatAvaliacao({
        clienteId: user.id,
        gestorId: current.gestor_id,
        equipeId: current.equipe_id,
        mesReferencia: current.mes_referencia.slice(0, 10),
        nota,
        comentario: comentario.trim() || null,
      });
      toast.success("Obrigado pelo seu feedback.");
      dismissed.current.delete(pendingKey(current.gestor_id, current.mes_referencia));
      setOpen(false);
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar avaliação.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!enabled) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleLater()}>
      <DialogContent className="max-w-md gap-0 p-4 pt-10 sm:p-5 sm:pt-11">
        <DialogHeader className="space-y-1.5 pr-6 text-left">
          <DialogTitle className="text-base">Satisfação mensal (CSAT)</DialogTitle>
          <DialogDescription className="text-sm">
            Como você avalia o acompanhamento de {gestorNome ? `${gestorNome} ` : ""}neste mês?
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (
            <>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Nota (1 a 5)</Label>
                <div className="flex justify-center gap-2 py-1">
                  {([1, 2, 3, 4, 5] as const).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setNota(n)}
                      className={cn(
                        "rounded-lg p-1 transition-colors",
                        nota === n ? "text-[#8A05BE]" : "text-muted-foreground hover:text-foreground",
                      )}
                      aria-label={`${n} estrelas`}
                    >
                      <Star
                        className="h-10 w-10"
                        strokeWidth={1.5}
                        fill={nota !== null && n <= nota ? "currentColor" : "none"}
                      />
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="csat-comentario" className="text-xs font-medium">
                  Comentário (opcional)
                </Label>
                <Textarea
                  id="csat-comentario"
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  placeholder="Algo que possamos melhorar?"
                  rows={3}
                  className="resize-none text-sm"
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter className="mt-6 flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={handleLater} disabled={submitting}>
            Depois
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={submitting || nota === null}>
            {submitting ? "Enviando…" : "Enviar avaliação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
