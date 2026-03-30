import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import { useCsGestores } from "@/hooks/useCsGestores";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import CsAlertasInteligentesSection from "@/components/gestor/CsAlertasInteligentesSection";
import { logAcao } from "@/lib/audit";

export default function CsAlertasInteligentesPage() {
  const navigate = useNavigate();
  const { role, user } = useAuth();
  const csEnabled = role === "cs" || role === "admin";
  const {
    data: csDash,
    isLoading,
    error,
  } = useCsGestores(csEnabled);
  const csFlat = csDash?.flat ?? [];

  const handleOpenClient = async (clientId: string) => {
    await logAcao({
      tipoAcao: "cs_visualizou_cliente",
      entidadeAfetada: "cliente",
      entidadeId: clientId,
      details: { origem: "pagina_alertas_inteligentes" },
    });
    navigate(`/?clientId=${encodeURIComponent(clientId)}`);
  };

  const handleOpenGestor = (gestorId: string) => {
    navigate(`/cs?focusGestor=${encodeURIComponent(gestorId)}`);
  };

  if (!csEnabled) {
    return (
      <div className="mx-auto min-h-screen max-w-md bg-nubank-bg px-4 pb-24 pt-6 dark:bg-background">
        <p className="text-sm text-muted-foreground">Acesso restrito a CS ou administrador.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md items-center justify-center bg-nubank-bg px-4 dark:bg-background">
        <p className="text-sm text-muted-foreground">Carregando equipe…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto min-h-screen max-w-md bg-nubank-bg px-4 pb-24 pt-6 dark:bg-background">
        <header className="mb-4 flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => navigate("/cs")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold">Alertas inteligentes</h1>
        </header>
        <Card>
          <CardContent className="py-8 text-center text-sm text-destructive">
            {error instanceof Error ? error.message : "Erro ao carregar equipe."}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (csFlat.length === 0) {
    return (
      <div className="mx-auto min-h-screen max-w-md bg-nubank-bg px-4 pb-24 pt-6 dark:bg-background">
        <header className="mb-4 flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => navigate("/cs")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold">Alertas inteligentes</h1>
        </header>
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum gestor atribuído ao seu usuário CS. Configure vínculos antes de usar alertas.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-md bg-nubank-bg p-4 pb-24 dark:bg-background">
      <header className="mb-4 flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => navigate("/cs")} aria-label="Voltar ao painel CS">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-semibold">Alertas inteligentes</h1>
      </header>

      <CsAlertasInteligentesSection
        enabled={!!user?.id}
        canSync={role === "cs" || role === "admin"}
        gestoresFlat={csFlat}
        onOpenClient={handleOpenClient}
        onOpenGestor={handleOpenGestor}
      />
    </div>
  );
}
