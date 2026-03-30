import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";

const DuvidasPage = () => {
  const navigate = useNavigate();

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
          <h1 className="text-base font-semibold tracking-tight">Dúvidas Frequentes</h1>
          <div className="w-9" />
        </div>
      </header>

      <main className="px-4 py-6">
        <Card className="rounded-xl border-border/80">
          <CardContent className="space-y-3 p-4 text-sm text-muted-foreground">
            <p>
              Em breve você verá aqui respostas rápidas sobre como usar a GestMiles, cadastrar
              clientes, acompanhar vencimentos e otimizar emissões.
            </p>
            <p>
              Enquanto isso, use o campo &quot;Fale Conosco&quot; para enviar qualquer dúvida ou sugestão.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default DuvidasPage;
