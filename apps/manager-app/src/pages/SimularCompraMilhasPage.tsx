import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Info, TrendingUp, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import DashboardHeader from "@/components/DashboardHeader";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useProgramasCliente } from "@/hooks/useProgramasCliente";
import { supabase } from "@/lib/supabase";

type RotaPremium = {
  id: number;
  origem: string;
  destino: string;
  programa: string;
  classe: string;
  milhas_necessarias: number;
  taxas_embarque: number;
  valor_tarifa_pagante: number;
};

type PrecoCompra = {
  programa: string;
  preco_milheiro: number;
  bonus_percentual: number;
};

const SimularCompraMilhasPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: programas = [] } = useProgramasCliente();

  const [rotas, setRotas] = useState<RotaPremium[]>([]);
  const [precos, setPrecos] = useState<PrecoCompra[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingSimulacao, setLoadingSimulacao] = useState(false);

  const [programa, setPrograma] = useState<string>("");
  const [origem, setOrigem] = useState<string>("");
  const [destino, setDestino] = useState<string>("");
  const [classe, setClasse] = useState<string>("");

  const [resultado, setResultado] = useState<
    | null
    | {
        rota: RotaPremium;
        preco: PrecoCompra | null;
        saldoDisponivel: number;
        custoMilheiroUsuario: number;
        milhasFaltantes: number;
        milhasCompra: number;
        custoCompra: number;
        saldoUtilizado: number;
        custoMilhasExistentes: number;
        custoTotal: number;
        economia: number;
        economiaPercentual: number;
        jaTemMilhas: boolean;
      }
  >(null);

  useEffect(() => {
    const loadMeta = async () => {
      try {
        const [{ data: rotasData, error: rotasErr }, { data: precosData, error: precosErr }] =
          await Promise.all([
            supabase
              .from("rotas_premium")
              .select(
                "id, origem, destino, programa, classe, milhas_necessarias, taxas_embarque, valor_tarifa_pagante",
              ),
            supabase
              .from("preco_compra_milhas")
              .select("programa, preco_milheiro, bonus_percentual, data_promocao")
              .order("data_promocao", { ascending: false }),
          ]);
        if (rotasErr) {
          console.warn("[SimularCompra] rotas_premium:", rotasErr.message);
        }
        if (precosErr) {
          console.warn("[SimularCompra] preco_compra_milhas:", precosErr.message);
        }
        setRotas(
          (rotasData ?? []).map((r) => ({
            id: Number(r.id),
            origem: String(r.origem ?? ""),
            destino: String(r.destino ?? ""),
            programa: String(r.programa ?? ""),
            classe: String(r.classe ?? ""),
            milhas_necessarias: Number(r.milhas_necessarias ?? 0),
            taxas_embarque: Number(r.taxas_embarque ?? 0),
            valor_tarifa_pagante: Number(r.valor_tarifa_pagante ?? 0),
          })),
        );
        // Mantém apenas o preço mais recente por programa
        const byProgram = new Map<string, PrecoCompra>();
        (precosData ?? []).forEach((p) => {
          const prog = String(p.programa ?? "");
          if (!prog) return;
          if (byProgram.has(prog)) return;
          byProgram.set(prog, {
            programa: prog,
            preco_milheiro: Number(p.preco_milheiro ?? 0),
            bonus_percentual: Number(p.bonus_percentual ?? 0),
          });
        });
        setPrecos(Array.from(byProgram.values()));
      } finally {
        setLoadingMeta(false);
      }
    };
    void loadMeta();
  }, []);

  const programasComSaldo = useMemo(
    () => programas.map((p) => p.program_name ?? p.program_id),
    [programas],
  );

  const programasList = useMemo(
    () => Array.from(new Set(rotas.map((r) => r.programa).filter(Boolean))),
    [rotas],
  );

  const rotasFiltradasPrograma = useMemo(
    () => (programa ? rotas.filter((r) => r.programa === programa) : rotas),
    [rotas, programa],
  );

  const origensDisponiveis = useMemo(
    () => Array.from(new Set(rotasFiltradasPrograma.map((r) => r.origem))),
    [rotasFiltradasPrograma],
  );

  const destinosDisponiveis = useMemo(
    () =>
      Array.from(
        new Set(
          rotasFiltradasPrograma
            .filter((r) => !origem || r.origem === origem)
            .map((r) => r.destino),
        ),
      ),
    [rotasFiltradasPrograma, origem],
  );

  const classesDisponiveis = useMemo(
    () =>
      Array.from(
        new Set(
          rotasFiltradasPrograma
            .filter((r) => (!origem || r.origem === origem) && (!destino || r.destino === destino))
            .map((r) => r.classe),
        ),
      ),
    [rotasFiltradasPrograma, origem, destino],
  );

  const handleSimular = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) {
      toast.error("Faça login para simular.");
      return;
    }
    const rota = rotas.find(
      (r) =>
        r.programa === programa &&
        r.origem === origem &&
        r.destino === destino &&
        r.classe === classe,
    );
    if (!rota) {
      toast.error("Selecione uma rota válida.");
      return;
    }

    const conta = programas.find((p) => p.program_name === programa || p.program_id === programa);
    const saldoDisponivel = Number(conta?.saldo ?? 0);
    const custoMilheiroUsuario = Number(conta?.custo_medio_milheiro ?? 0);

    const preco = precos.find((p) => p.programa === programa) ?? null;
    if (!preco) {
      toast.error("Nenhum preço de compra cadastrado para este programa.");
    }

    const milhasNecessarias = rota.milhas_necessarias;
    if (milhasNecessarias <= 0) {
      toast.error("Rota sem milhas necessárias configuradas.");
      return;
    }

    setLoadingSimulacao(true);
    try {
      if (saldoDisponivel >= milhasNecessarias) {
        const saldoUtilizado = milhasNecessarias;
        const custoMilhasExistentes =
          (saldoUtilizado / 1000) * (custoMilheiroUsuario > 0 ? custoMilheiroUsuario : 0);
        const custoTotal = custoMilhasExistentes + rota.taxas_embarque;
        const economia = rota.valor_tarifa_pagante - custoTotal;
        const economiaPercentual =
          rota.valor_tarifa_pagante > 0 ? (economia / rota.valor_tarifa_pagante) * 100 : 0;

        setResultado({
          rota,
          preco,
          saldoDisponivel,
          custoMilheiroUsuario,
          milhasFaltantes: 0,
          milhasCompra: 0,
          custoCompra: 0,
          saldoUtilizado,
          custoMilhasExistentes,
          custoTotal,
          economia,
          economiaPercentual,
          jaTemMilhas: true,
        });
        toast.success("Você já tem milhas suficientes para esta emissão.");
        return;
      }

      const milhasFaltantes = Math.max(0, milhasNecessarias - saldoDisponivel);
      const bonus = preco ? Number(preco.bonus_percentual ?? 0) / 100 : 0;
      const milhasCompra =
        bonus > -1 ? milhasFaltantes / (1 + bonus || 1) : milhasFaltantes; // proteção contra divisão por zero
      const precoMilheiro = preco ? Number(preco.preco_milheiro ?? 0) : 0;
      const custoCompra = (milhasCompra / 1000) * precoMilheiro;

      const saldoUtilizado = Math.min(saldoDisponivel, milhasNecessarias);
      const custoMilhasExistentes =
        (saldoUtilizado / 1000) * (custoMilheiroUsuario > 0 ? custoMilheiroUsuario : 0);

      const custoTotal = custoMilhasExistentes + custoCompra + rota.taxas_embarque;
      const economia = rota.valor_tarifa_pagante - custoTotal;
      const economiaPercentual =
        rota.valor_tarifa_pagante > 0 ? (economia / rota.valor_tarifa_pagante) * 100 : 0;

      setResultado({
        rota,
        preco,
        saldoDisponivel,
        custoMilheiroUsuario,
        milhasFaltantes,
        milhasCompra,
        custoCompra,
        saldoUtilizado,
        custoMilhasExistentes,
        custoTotal,
        economia,
        economiaPercentual,
        jaTemMilhas: false,
      });
    } finally {
      setLoadingSimulacao(false);
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-md bg-nubank-bg pb-28">
      <DashboardHeader />

      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
          >
            <ArrowLeft size={20} strokeWidth={1.5} />
          </button>
          <h1 className="text-base font-semibold tracking-tight">Simular Compra de Milhas</h1>
          <div className="w-9" />
        </div>
      </header>

      <main className="space-y-4 px-4 py-4">
        <Card className="rounded-[18px] border-border/80">
          <CardHeader className="pb-2">
            <p className="text-xs font-semibold text-foreground">
              Escolha a rota que deseja simular
            </p>
            <p className="text-[11px] text-muted-foreground">
              Usaremos seu saldo atual, o custo médio do milheiro e o preço de compra para calcular
              se vale a pena completar a emissão com milhas.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <form className="space-y-3" onSubmit={handleSimular}>
              <div className="space-y-1.5">
                <Label className="text-xs">Programa</Label>
                <Select
                  value={programa || undefined}
                  onValueChange={setPrograma}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder={loadingMeta ? "Carregando..." : "Selecione"} />
                  </SelectTrigger>
                  <SelectContent className="z-[100]">
                    {programasList.length === 0 ? (
                      <SelectItem value="__nenhuma_rota__" disabled className="text-muted-foreground">
                        Nenhuma rota cadastrada. Cadastre em rotas_premium no Supabase.
                      </SelectItem>
                    ) : (
                      programasList.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                          {programasComSaldo.includes(p) && " • saldo na conta"}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Origem</Label>
                  <Select value={origem} onValueChange={setOrigem} disabled={!programa}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {origensDisponiveis.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Destino</Label>
                  <Select value={destino} onValueChange={setDestino} disabled={!origem}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {destinosDisponiveis.map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Classe</Label>
                <Select value={classe} onValueChange={setClasse} disabled={!destino}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {classesDisponiveis.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                type="submit"
                className="mt-1 w-full rounded-[14px] text-sm font-semibold"
                disabled={loadingMeta || loadingSimulacao}
              >
                {loadingSimulacao ? "Calculando..." : "Simular emissão com compra de milhas"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {resultado && (
          <Card className="rounded-[18px] border-border/80">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-foreground">
                  Resultado da simulação
                </p>
                <div className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold">
                  {resultado.economia > 0 ? (
                    <>
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Vale a pena emitir com milhas</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-3.5 w-3.5 text-red-600" />
                      <span className="text-red-700">
                        Não vale a pena comprar milhas para essa emissão
                      </span>
                    </>
                  )}
                </div>
              </div>
              {resultado.jaTemMilhas && (
                <p className="mt-1 flex items-center gap-1 text-[11px] text-emerald-700">
                  <Info className="h-3 w-3" />
                  Você já tem milhas suficientes para esta emissão. Não é necessário comprar mais.
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-[14px] bg-muted/70 px-3 py-2 text-[11px]">
                <p className="font-semibold text-foreground">
                  {resultado.rota.origem} → {resultado.rota.destino}
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  {resultado.rota.programa} • {resultado.rota.classe}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-[11px]">
                <div className="space-y-1">
                  <p className="text-muted-foreground">Milhas necessárias</p>
                  <p className="font-semibold">
                    {resultado.rota.milhas_necessarias.toLocaleString("pt-BR")}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Milhas disponíveis</p>
                  <p className="font-semibold">
                    {resultado.saldoDisponivel.toLocaleString("pt-BR")}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Milhas a comprar</p>
                  <p className="font-semibold">
                    {resultado.milhasCompra.toLocaleString("pt-BR", {
                      maximumFractionDigits: 0,
                    })}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Preço do milheiro (promoção)</p>
                  <p className="font-semibold">
                    {resultado.preco
                      ? resultado.preco.preco_milheiro.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })
                      : "-"}
                    {resultado.preco && ` • bônus ${resultado.preco.bonus_percentual}%`}
                  </p>
                </div>
              </div>

              <div className="space-y-1 border-t border-border/60 pt-2 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Custo de compra das milhas</span>
                  <span className="font-semibold">
                    {resultado.custoCompra.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Custo das milhas existentes</span>
                  <span className="font-semibold">
                    {resultado.custoMilhasExistentes.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Taxas de embarque</span>
                  <span className="font-semibold">
                    {resultado.rota.taxas_embarque.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="font-semibold text-foreground">Custo total da emissão</span>
                  <span className="text-sm font-bold">
                    {resultado.custoTotal.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </span>
                </div>
              </div>

              <div className="space-y-1 border-t border-border/60 pt-2 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Valor da passagem pagante</span>
                  <span className="font-semibold">
                    {resultado.rota.valor_tarifa_pagante.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="font-semibold text-emerald-700">Economia estimada</span>
                  <span
                    className={`text-sm font-bold ${
                      resultado.economia >= 0 ? "text-emerald-700" : "text-red-700"
                    }`}
                  >
                    {resultado.economia.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Economia percentual</span>
                  <span
                    className={`font-semibold ${
                      resultado.economia >= 0 ? "text-emerald-700" : "text-red-700"
                    }`}
                  >
                    {resultado.economiaPercentual.toFixed(1)}%
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default SimularCompraMilhasPage;

