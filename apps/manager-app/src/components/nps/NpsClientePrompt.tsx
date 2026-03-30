import { useEffect, useRef, useState } from "react";

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
import { submitNpsAvaliacao, useNpsCliente } from "@/hooks/useNpsCliente";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/**
 * Modal de NPS para cliente_gestao quando existir convite pendente.
 * RLS e triggers no Supabase validam vínculo e equipe.
 */
export default function NpsClientePrompt() {
  const { user, role } = useAuth();
  const enabled = role === "cliente_gestao" && !!user?.id;
  const { convites, gestorNomeById, isLoading, refetch } = useNpsCliente(enabled, user?.id);

  const [open, setOpen] = useState(false);
  const [nota, setNota] = useState<number | null>(null);
  const [comentario, setComentario] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const dismissed = useRef<Set<string>>(new Set());

  const current = convites[0];

  useEffect(() => {
    if (!current) {
      setOpen(false);
      return;
    }
    if (dismissed.current.has(current.id)) return;
    setOpen(true);
    setNota(null);
    setComentario("");
  }, [current?.id]);

  const gestorNome = current ? gestorNomeById[current.gestor_id] ?? "seu gestor" : "";

  const handleLater = () => {
    if (current) dismissed.current.add(current.id);
    setOpen(false);
  };

  const handleSubmit = async () => {
    if (!user?.id || !current || nota === null) {
      toast.error("Selecione uma nota de 0 a 10.");
      return;
    }
    setSubmitting(true);
    try {
      await submitNpsAvaliacao({
        clienteId: user.id,
        gestorId: current.gestor_id,
        equipeId: current.equipe_id,
        nota,
        comentario: comentario.trim() || null,
      });
      toast.success("Obrigado pela sua avaliação.");
      dismissed.current.delete(current.id);
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleLater();
      }}
    >
      <DialogContent className="max-w-md gap-0 p-4 pt-10 sm:p-5 sm:pt-11">
        <DialogHeader className="space-y-1.5 pr-6 text-left">
          <DialogTitle className="text-base">Avaliação NPS</DialogTitle>
          <DialogDescription className="text-sm">
            De 0 a 10, o quanto você recomendaria {gestorNome ? `${gestorNome} ` : ""}como gestor da sua
            carteira?
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (
            <>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Nota (0 a 10)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: 11 }, (_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setNota(i)}
                      className={cn(
                        "h-9 min-w-9 rounded-lg border text-xs font-semibold transition-colors",
                        nota === i
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:bg-muted",
                      )}
                    >
                      {i}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="nps-comentario" className="text-xs font-medium">
                  Comentário (opcional)
                </Label>
                <Textarea
                  id="nps-comentario"
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  placeholder="Conte rapidamente o que influenciou sua nota…"
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
