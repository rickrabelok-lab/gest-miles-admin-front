import { useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { usePreferenciasSugestoes } from "@/hooks/usePreferenciasSugestoes";
import {
  DESTINO_OPCOES,
  CLASSE_OPCOES,
  type ClassePreferencia,
  type DestinoPreferencia,
} from "@/lib/smart-award-constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

const PreferenciasSugestoesPage = () => {
  const navigate = useNavigate();
  const { preferencias, loading, save, saving, refetch } = usePreferenciasSugestoes();
  const [destinos, setDestinos] = useState<DestinoPreferencia[]>(preferencias.preferencia_destino);
  const [classe, setClasse] = useState<ClassePreferencia>(preferencias.preferencia_classe);

  useEffect(() => {
    setDestinos(preferencias.preferencia_destino);
    setClasse(preferencias.preferencia_classe);
  }, [preferencias.preferencia_destino, preferencias.preferencia_classe]);

  const handleDestinoToggle = (opcao: DestinoPreferencia) => {
    if (opcao === "Todos") {
      setDestinos(["Todos"]);
      return;
    }
    setDestinos((prev) => {
      const semTodos = prev.filter((d) => d !== "Todos");
      const has = semTodos.includes(opcao);
      if (has) {
        const next = semTodos.filter((d) => d !== opcao);
        return next.length === 0 ? ["Todos"] : next;
      }
      return [...semTodos, opcao];
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await save({ preferencia_destino: destinos, preferencia_classe: classe });
      toast.success("Preferências salvas.");
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-md bg-nubank-bg pb-24">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
          >
            <ArrowLeft size={20} strokeWidth={1.5} />
          </button>
          <h1 className="text-base font-semibold tracking-tight">
            Preferências de Sugestões Inteligentes
          </h1>
          <div className="w-9" />
        </div>
      </header>

      <main className="px-4 py-6">
        {loading && (
          <p className="text-sm text-muted-foreground">Carregando preferências...</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="rounded-xl border-border/80 shadow-nubank">
            <CardHeader className="pb-2">
              <h2 className="text-sm font-semibold text-foreground">
                Quais destinos você deseja receber sugestões?
              </h2>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {DESTINO_OPCOES.map((opcao) => (
                <label
                  key={opcao}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/60 bg-card/50 px-3 py-2.5 transition-colors hover:bg-muted/40"
                >
                  <Checkbox
                    checked={destinos.includes(opcao)}
                    onCheckedChange={() => handleDestinoToggle(opcao)}
                  />
                  <span className="text-sm font-medium">{opcao}</span>
                </label>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-xl border-border/80 shadow-nubank">
            <CardHeader className="pb-2">
              <h2 className="text-sm font-semibold text-foreground">
                Classe de cabine preferida
              </h2>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {CLASSE_OPCOES.map((opcao) => (
                <label
                  key={opcao}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/60 bg-card/50 px-3 py-2.5 transition-colors hover:bg-muted/40"
                >
                  <input
                    type="radio"
                    name="classe"
                    value={opcao}
                    checked={classe === opcao}
                    onChange={() => setClasse(opcao)}
                    className="h-4 w-4 border-border text-[#8A05BE] focus:ring-[#8A05BE]"
                  />
                  <span className="text-sm font-medium">{opcao}</span>
                </label>
              ))}
            </CardContent>
          </Card>

          <Button
            type="submit"
            className="w-full rounded-xl font-semibold"
            disabled={saving}
          >
            {saving ? "Salvando…" : "Salvar preferências"}
          </Button>
        </form>
      </main>
    </div>
  );
};

export default PreferenciasSugestoesPage;
