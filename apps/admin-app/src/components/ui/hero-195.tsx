import * as React from "react";
import { ArrowRight, Sparkles } from "lucide-react";

import { BorderBeam } from "@/components/ui/border-beam";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TracingBeam } from "@/components/ui/tracing-beam";
import { cn } from "@/lib/utils";

/** Unsplash — URLs estáveis para demo. */
const IMG_HERO =
  "https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&w=1200&q=80";
const IMG_BADGE =
  "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=400&q=80";

export type Hero195Props = {
  className?: string;
};

export function Hero195({ className }: Hero195Props) {
  const [email, setEmail] = React.useState("");

  return (
    <section className={cn("relative overflow-hidden bg-[var(--fintech-bg,hsl(var(--background)))] py-16 md:py-24", className)}>
      <div className="container px-4">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <TracingBeam className="max-w-xl">
            <div className="space-y-6 pr-2 md:pr-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-nubank-border bg-card/80 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
                <Sparkles className="size-3.5 text-primary" aria-hidden />
                Gest Miles — Admin
              </div>
              <h1 className="font-display text-4xl font-bold tracking-tight text-nubank-text md:text-5xl">
                Operações e equipas num só lugar
              </h1>
              <p className="text-lg text-nubank-text-secondary">
                Painel desktop-first: equipes, utilizadores, clientes e assinaturas alinhados ao design system Nubank do produto.
              </p>
              <Tabs defaultValue="equipes" className="w-full max-w-md">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="equipes">Por equipe</TabsTrigger>
                  <TabsTrigger value="global">Visão global</TabsTrigger>
                </TabsList>
                <TabsContent value="equipes" className="space-y-2 pt-4 text-sm text-muted-foreground">
                  <p>
                    Filtre por <strong className="text-foreground">equipe_id</strong> e mantenha CS e gestores no mesmo grupo
                    operacional.
                  </p>
                </TabsContent>
                <TabsContent value="global" className="space-y-2 pt-4 text-sm text-muted-foreground">
                  <p>
                    Gestão de estrutura completa e métricas globais quando precisar de contexto fora de uma única equipe.
                  </p>
                </TabsContent>
              </Tabs>
              <div className="space-y-2">
                <Label htmlFor="hero-195-email">Email para novidades</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="hero-195-email"
                    type="email"
                    placeholder="nome@empresa.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex-1 rounded-[14px] border-nubank-border"
                    autoComplete="email"
                  />
                  <Button type="button" className="shrink-0 gap-2 rounded-[14px]">
                    Começar <ArrowRight className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>
            </div>
          </TracingBeam>

          <div className="relative mx-auto w-full max-w-lg">
            <Card className="relative overflow-hidden rounded-2xl border-2 border-nubank-border p-0 shadow-nubank-card">
              <BorderBeam size={260} duration={14} borderWidth={2} colorFrom="#8A05BE" colorTo="#ffaa40" />
              <CardHeader className="absolute left-4 top-4 z-10 rounded-[12px] border border-nubank-border bg-card/95 p-3 shadow-sm backdrop-blur">
                <CardTitle className="text-base text-nubank-text">Resumo</CardTitle>
                <CardDescription className="text-xs">Cartão com Border Beam</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <img
                  src={IMG_HERO}
                  alt="Equipa a colaborar num escritório moderno"
                  className="aspect-[4/3] w-full object-cover"
                  width={1200}
                  height={900}
                  loading="lazy"
                  decoding="async"
                />
              </CardContent>
            </Card>
            <img
              src={IMG_BADGE}
              alt=""
              className="absolute -bottom-8 -right-4 hidden w-40 rounded-xl border border-nubank-border bg-card shadow-nubank md:block"
              width={320}
              height={240}
              loading="lazy"
              decoding="async"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
