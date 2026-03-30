import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const FaleConoscoPage = () => {
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
          <h1 className="text-base font-semibold tracking-tight">Fale Conosco</h1>
          <div className="w-9" />
        </div>
      </header>

      <main className="px-4 py-6">
        <Card className="rounded-xl border-border/80">
          <CardContent className="space-y-4 p-4">
            <p className="text-sm text-muted-foreground">
              Envie dúvidas, feedbacks ou sugestões sobre a GestMiles.
            </p>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="assunto">
                Assunto
              </label>
              <Input id="assunto" placeholder="Ex: Sugestão de melhoria" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="mensagem">
                Mensagem
              </label>
              <Textarea
                id="mensagem"
                rows={4}
                placeholder="Conte como podemos ajudar ou o que você gostaria de ver na plataforma."
              />
            </div>
            <Button type="button" className="w-full">
              Enviar mensagem
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default FaleConoscoPage;
