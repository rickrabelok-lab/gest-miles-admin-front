import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ConvideAmigosPage = () => {
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
          <h1 className="text-base font-semibold tracking-tight">Convide Amigos</h1>
          <div className="w-9" />
        </div>
      </header>

      <main className="px-4 py-6">
        <Card className="rounded-xl border-border/80">
          <CardContent className="space-y-4 p-4 text-sm text-muted-foreground">
            <p>
              Compartilhe a GestMiles com outros gestores e consultores que podem se beneficiar
              de uma gestão mais profissional de milhas.
            </p>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="email">
                E-mail do convidado
              </label>
              <Input id="email" placeholder="nome@empresa.com" />
            </div>
            <Button type="button" className="w-full">
              Gerar convite
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default ConvideAmigosPage;
