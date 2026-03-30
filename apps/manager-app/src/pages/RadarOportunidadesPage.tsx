import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

import DashboardHeader from "@/components/DashboardHeader";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";

export type OportunidadeVoo = {
  id: number;
  origem: string;
  destino: string;
  programa: string;
  classe: string;
  milhas: number;
  data_voo: string | null;
  valor_estimado: number;
  regiao_destino: string | null;
  data_detectada: string;
};

const PROGRAMAS = [
  "LATAM Pass",
  "Smiles",
  "TudoAzul",
  "Flying Blue",
  "Iberia Plus",
] as const;

const REGIOES = [
  "Brasil",
  "Estados Unidos",
  "Europa",
  "Oriente Médio",
  "Ásia",
  "América do Sul",
] as const;

const CLASSES = [
  { value: "todas", label: "Todas" },
  { value: "Executiva", label: "Executiva" },
  { value: "Econômica", label: "Econômica" },
  { value: "Primeira Classe", label: "Primeira Classe" },
] as const;

type SortOption = "value" | "miles" | "newest";

const RadarOportunidadesPage = () => {
  const navigate = useNavigate();
  const [list, setList] = useState<OportunidadeVoo[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterPrograma, setFilterPrograma] = useState<string>("");
  const [filterRegiao, setFilterRegiao] = useState<string>("");
  const [filterClasse, setFilterClasse] = useState<string>("todas");
  const [sort, setSort] = useState<SortOption>("newest");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("oportunidades_voo")
          .select("id, origem, destino, programa, classe, milhas, data_voo, valor_estimado, regiao_destino, data_detectada")
          .order("data_detectada", { ascending: false });
        if (cancelled) return;
        if (error) {
          console.warn("[Radar] oportunidades_voo:", error.message);
          setList([]);
          return;
        }
        setList(
          (data ?? []).map((row) => ({
            id: Number(row.id),
            origem: String(row.origem ?? ""),
            destino: String(row.destino ?? ""),
            programa: String(row.programa ?? ""),
            classe: String(row.classe ?? ""),
            milhas: Number(row.milhas ?? 0),
            data_voo: row.data_voo ? String(row.data_voo) : null,
            valor_estimado: Number(row.valor_estimado ?? 0),
            regiao_destino: row.regiao_destino ? String(row.regiao_destino) : null,
            data_detectada: String(row.data_detectada ?? ""),
          })),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    let result = [...list];
    if (filterPrograma) {
      result = result.filter((o) => o.programa === filterPrograma);
    }
    if (filterRegiao) {
      result = result.filter(
        (o) => (o.regiao_destino ?? "").toLowerCase() === filterRegiao.toLowerCase(),
      );
    }
    if (filterClasse && filterClasse !== "todas") {
      result = result.filter(
        (o) => (o.classe ?? "").toLowerCase() === filterClasse.toLowerCase(),
      );
    }
    if (sort === "value") {
      result.sort((a, b) => {
        const ratioA = a.milhas > 0 ? a.valor_estimado / a.milhas : 0;
        const ratioB = b.milhas > 0 ? b.valor_estimado / b.milhas : 0;
        return ratioB - ratioA;
      });
    } else if (sort === "miles") {
      result.sort((a, b) => a.milhas - b.milhas);
    } else {
      result.sort(
        (a, b) =>
          new Date(b.data_detectada).getTime() - new Date(a.data_detectada).getTime(),
      );
    }
    return result;
  }, [list, filterPrograma, filterRegiao, filterClasse, sort]);

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
  const formatMiles = (n: number) =>
    new Intl.NumberFormat("pt-BR").format(n) + " milhas";
  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

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
          <h1 className="text-base font-semibold tracking-tight">Radar de Oportunidades</h1>
          <div className="w-9" />
        </div>
      </header>

      <main className="space-y-4 px-4 py-4">
        {/* Future notifications – structure only */}
        <Card className="rounded-[18px] border-border/80 border-dashed bg-muted/30 shadow-none">
          <CardContent className="px-3.5 py-3">
            <p className="text-xs text-muted-foreground">
              Em breve: você poderá receber alertas quando surgirem novas oportunidades na sua
              região ou classe preferida.
            </p>
          </CardContent>
        </Card>

        {/* Filters */}
        <Card className="rounded-[18px] border-border/80 shadow-nubank transition-all duration-300 ease-out hover:shadow-nubank-hover hover:-translate-y-0.5">
          <CardContent className="space-y-3 px-3.5 pb-3.5 pt-3">
            <p className="text-xs font-semibold text-foreground">Filtros</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Programa</label>
                <Select value={filterPrograma || "todos"} onValueChange={(v) => setFilterPrograma(v === "todos" ? "" : v)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent className="z-[100]">
                    <SelectItem value="todos">Todos</SelectItem>
                    {PROGRAMAS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Região</label>
                <Select value={filterRegiao || "todas"} onValueChange={(v) => setFilterRegiao(v === "todas" ? "" : v)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent className="z-[100]">
                    <SelectItem value="todas">Todas</SelectItem>
                    {REGIOES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Classe</label>
                <Select value={filterClasse} onValueChange={setFilterClasse}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[100]">
                    {CLASSES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Ordenar</label>
                <Select
                  value={sort}
                  onValueChange={(v) => setSort(v as SortOption)}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[100]">
                    <SelectItem value="value">Melhor valor</SelectItem>
                    <SelectItem value="miles">Menor milhagem</SelectItem>
                    <SelectItem value="newest">Mais recentes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Feed */}
        <div className="space-y-3">
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p>
          ) : filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma oportunidade encontrada. Ajuste os filtros ou aguarde novas ofertas.
            </p>
          ) : (
            filtered.map((o) => (
              <Card
                key={o.id}
                className="rounded-[18px] border-border/80 shadow-nubank transition-all duration-300 ease-out hover:shadow-nubank-hover hover:-translate-y-0.5"
              >
                <CardContent className="space-y-2 px-3.5 pb-3.5 pt-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">
                      {o.origem} → {o.destino}
                    </p>
                    {o.regiao_destino && (
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {o.regiao_destino}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{o.programa}</span>
                    <span>{o.classe}</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2">
                    <span className="text-xs font-medium text-foreground">
                      {formatMiles(o.milhas)}
                    </span>
                    <span className="text-xs font-semibold text-[#8A05BE]">
                      {formatCurrency(o.valor_estimado)}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Voo: {formatDate(o.data_voo)}
                  </p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </main>
    </div>
  );
};

export default RadarOportunidadesPage;
