import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const CriarAlertaPage = () => {
  const navigate = useNavigate();
  const [dataAlvo, setDataAlvo] = useState("");

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
          <h1 className="text-base font-semibold tracking-tight">Adicionar Alerta</h1>
          <div className="w-9" />
        </div>
      </header>

      <main className="px-4 py-6">
        <Card className="rounded-xl border-border/80">
          <CardContent className="space-y-4 p-4">
            <p className="text-xs text-muted-foreground">
              Configure alertas para vencimentos, saldo mínimo ou oportunidades importantes.
            </p>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="titulo">
                Título do alerta
              </label>
              <Input id="titulo" placeholder="Ex: Pontos vencendo em 30 dias" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="tipo">
                Tipo de alerta
              </label>
              <Input id="tipo" placeholder="Ex: Vencimento, saldo, oportunidade..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="data">
                  Data alvo (opcional)
                </label>
                <DatePickerField
                  id="data"
                  value={dataAlvo}
                  onChange={setDataAlvo}
                  placeholder="Escolher data"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="programa">
                  Programa (opcional)
                </label>
                <Input id="programa" placeholder="Ex: Latam Pass" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="detalhes">
                Detalhes
              </label>
              <Textarea
                id="detalhes"
                rows={3}
                placeholder="Descreva quando e como você quer ser lembrado."
              />
            </div>
            <Button type="button" className="mt-1 w-full">
              Salvar alerta
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default CriarAlertaPage;
