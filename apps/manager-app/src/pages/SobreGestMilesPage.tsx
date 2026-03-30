import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";

const SobreGestMilesPage = () => {
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
          <h1 className="text-base font-semibold tracking-tight">Sobre a GestMiles</h1>
          <div className="w-9" />
        </div>
      </header>

      <main className="px-4 py-6">
        <Card className="rounded-xl border-border/80">
          <CardContent className="space-y-3 p-4 text-sm text-muted-foreground">
            <p>
              A GestMiles é uma plataforma focada em gestão estratégica de milhas e pontos,
              ajudando empresas e consultores a organizarem carteiras de clientes, priorizarem
              oportunidades e maximizarem a rentabilidade das emissões.
            </p>
            <p>
              O painel do gestor foi desenhado para dar uma visão clara de risco, vencimentos,
              economia gerada e ações prioritárias em poucos toques.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default SobreGestMilesPage;
