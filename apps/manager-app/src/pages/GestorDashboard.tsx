import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, BarChart3, Bell, ClipboardList, Clock, Pencil, Shield, Moon, Star, Sun, Trophy, Users } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useGestor } from "@/hooks/useGestor";
import { useGestorLogs } from "@/hooks/useGestorLogs";
import { useCsGestores, type CsGestorItem } from "@/hooks/useCsGestores";
import { useCsEquipesNomes } from "@/hooks/useCsEquipesNomes";
import GestorKpis from "@/components/gestor/GestorKpis";
import GestorClientsTable from "@/components/gestor/GestorClientsTable";
import GestorAlertas from "@/components/gestor/GestorAlertas";
import GestorRentabilidade from "@/components/gestor/GestorRentabilidade";
import GestorDre from "@/components/gestor/GestorDre";
import GestorComparativo from "@/components/gestor/GestorComparativo";
import GestorHistorico from "@/components/gestor/GestorHistorico";
import GestorExport from "@/components/gestor/GestorExport";
import CsVincularClienteCard from "@/components/gestor/CsVincularClienteCard";
import CsNpsCarteiraSection from "@/components/nps/CsNpsCarteiraSection";
import CsCsatSection from "@/components/csat/CsCsatSection";
import CsGestorPerformanceSection from "@/components/gestor/CsGestorPerformanceSection";
import CsAlertasInteligentesSection from "@/components/gestor/CsAlertasInteligentesSection";
import NotificationsDropdown from "@/components/notifications/NotificationsDropdown";
import { logAcao } from "@/lib/audit";
import type { RiscoCarteira } from "@/hooks/useGestor";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useMinhasReunioes } from "@/hooks/useMinhasReunioes";

const DARK_STORAGE_KEY = "mile-manager:theme";

/**
 * Nome da empresa de gestão no banner do /cs (texto público no bundle).
 * Padrão: Gestão João Carvalho. Sobrescreva com `VITE_GESTAO_NOME_EMPRESA` no `.env`.
 */
const gestaoNomeEmpresaBanner =
  (import.meta.env.VITE_GESTAO_NOME_EMPRESA as string | undefined)?.trim() || "Gestão João Carvalho";
const GESTOR_TABS = [
  "clientes",
  "vencendo",
  "alertas",
  "demandas",
  "rentabilidade",
  "dre",
  "comparativo",
  "historico",
  "nps",
  "csat",
  "performance",
  "exportar",
] as const;

type GestorTab = (typeof GESTOR_TABS)[number];
type DemandFilter = "todos" | "pendente" | "em_andamento" | "concluida";

export type GestorDashboardVariant = "gestor" | "cs";

type GestorDashboardProps = {
  /** `gestor` = painel do próprio gestor; `cs` = supervisão da equipe (vários gestores). */
  variant?: GestorDashboardVariant;
};

type CsGestorCollapsibleRowProps = {
  g: CsGestorItem;
  onOpenClient: (clientId: string) => void | Promise<void>;
  onEditNome: (gestor: CsGestorItem) => void;
};

const CsGestorCollapsibleRow = ({ g, onOpenClient, onEditNome }: CsGestorCollapsibleRowProps) => (
  <div id={`cs-gestor-${g.gestorId}`} className="scroll-mt-28">
    <Collapsible>
    <Card className="rounded-lg border-border/60 bg-muted/20">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm"
        >
          <span className="truncate font-medium">{g.gestorNome}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {g.clientes.length} {g.clientes.length === 1 ? "cliente" : "clientes"}
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t border-border/60 px-3 pb-3 pt-2">
          <div className="mb-2 flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-[#8A05BE]"
              onClick={(e) => {
                e.stopPropagation();
                onEditNome(g);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar nome
            </Button>
          </div>
          <ul className="max-h-36 space-y-1 overflow-y-auto text-xs">
            {g.clientes.length === 0 ? (
              <li className="text-muted-foreground">Nenhum cliente vinculado.</li>
            ) : (
              g.clientes.map((c) => (
                <li
                  key={c.clienteId}
                  className="flex justify-between gap-2 rounded-md bg-background/80 px-2 py-1"
                >
                  <span className="truncate">{c.clienteNome}</span>
                  <button
                    type="button"
                    className="shrink-0 text-[#8A05BE] underline-offset-2 hover:underline"
                    onClick={() => void onOpenClient(c.clienteId)}
                  >
                    Abrir
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      </CollapsibleContent>
    </Card>
    </Collapsible>
  </div>
);

const GestorDashboard = ({ variant = "gestor" }: GestorDashboardProps) => {
  const navigate = useNavigate();
  const { role, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const requestedStatus = searchParams.get("status");
  const initialTab: GestorTab = GESTOR_TABS.includes(requestedTab as GestorTab)
    ? (requestedTab as GestorTab)
    : "clientes";
  const [activeTab, setActiveTab] = useState<GestorTab>(initialTab);
  const [darkMode, setDarkMode] = useState(false);
  const [updatingDemandId, setUpdatingDemandId] = useState<number | null>(null);
  const initialDemandFilter: DemandFilter =
    requestedStatus === "pendente" ||
    requestedStatus === "em_andamento" ||
    requestedStatus === "concluida"
      ? requestedStatus
      : "todos";
  const [demandStatusFilter, setDemandStatusFilter] = useState<DemandFilter>(initialDemandFilter);
  const [editingGestor, setEditingGestor] = useState<{ id: string; nome: string } | null>(null);
  const [savingGestorNome, setSavingGestorNome] = useState(false);
  const [scrollToGestorId, setScrollToGestorId] = useState<string | null>(null);

  const csQueryEnabled =
    variant === "cs" && (role === "cs" || role === "admin");
  const {
    data: csDash,
    isLoading: csTeamLoading,
    error: csTeamError,
    invalidate: invalidateCsTeam,
  } = useCsGestores(csQueryEnabled);

  const csFlat = csDash?.flat ?? [];
  const csGrupos = csDash?.grupos ?? [];
  const csDiretos = csDash?.gestoresSomenteDireto ?? [];

  const {
    data: csEquipesNomes = [],
    isLoading: csEquipesNomesLoading,
  } = useCsEquipesNomes(csQueryEnabled);

  const supervisedGestorIds = useMemo(
    () => (variant === "cs" ? csFlat.map((g) => g.gestorId) : []),
    [variant, csFlat],
  );

  const npsTabEnabled =
    variant === "cs"
      ? (role === "cs" || role === "admin") && supervisedGestorIds.length > 0
      : role === "gestor" || role === "admin";

  const gestorDataEnabled =
    variant === "gestor"
      ? role === "gestor" || role === "admin"
      : (role === "cs" || role === "admin") &&
        !csTeamLoading &&
        supervisedGestorIds.length > 0;

  const gestorOptions = useMemo(
    () =>
      variant === "cs" && supervisedGestorIds.length > 0
        ? { supervisedGestorIds }
        : {},
    [variant, supervisedGestorIds],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(DARK_STORAGE_KEY);
    const prefer = stored === "dark";
    setDarkMode(prefer);
  }, []);

  const toggleDark = () => {
    const isDark = !darkMode;
    setDarkMode(isDark);
    window.localStorage.setItem(DARK_STORAGE_KEY, isDark ? "dark" : "light");
  };
  const {
    loading,
    error,
    resumoClientes,
    kpis,
    vencimentosTodosClientes,
    demandasGestor,
    dreConsolidado,
  } = useGestor(gestorDataEnabled, [], gestorOptions);
  const { logs, loading: logsLoading } = useGestorLogs(
    gestorDataEnabled,
    variant === "cs" && supervisedGestorIds.length > 0
      ? supervisedGestorIds
      : undefined,
  );
  const { reunioes: minhasReunioes, isLoading: minhasReunioesLoading } =
    useMinhasReunioes(variant === "gestor");

  const handleSaveGestorNome = async () => {
    if (!editingGestor?.id) return;
    setSavingGestorNome(true);
    try {
      const { error: err } = await supabase
        .from("perfis")
        .update({ nome_completo: editingGestor.nome.trim() || null })
        .eq("usuario_id", editingGestor.id);
      if (err) throw err;
      toast.success("Dados do gestor atualizados.");
      setEditingGestor(null);
      await invalidateCsTeam();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSavingGestorNome(false);
    }
  };

  const [demandasLocal, setDemandasLocal] = useState(demandasGestor);

  useEffect(() => {
    setDemandasLocal(demandasGestor);
  }, [demandasGestor]);

  useEffect(() => {
    if (requestedTab && GESTOR_TABS.includes(requestedTab as GestorTab)) {
      setActiveTab(requestedTab as GestorTab);
    }
  }, [requestedTab]);

  useEffect(() => {
    if (requestedStatus === "pendente" || requestedStatus === "em_andamento" || requestedStatus === "concluida") {
      setDemandStatusFilter(requestedStatus);
      return;
    }
    setDemandStatusFilter("todos");
  }, [requestedStatus]);

  useEffect(() => {
    if (!scrollToGestorId) return;
    const timer = window.setTimeout(() => {
      document.getElementById(`cs-gestor-${scrollToGestorId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      setScrollToGestorId(null);
    }, 160);
    return () => window.clearTimeout(timer);
  }, [scrollToGestorId]);


  const demandasFiltradas = useMemo(() => {
    if (demandStatusFilter === "todos") return demandasLocal;
    return demandasLocal.filter((d) => d.status === demandStatusFilter);
  }, [demandasLocal, demandStatusFilter]);

  const handleOpenClient = async (clientId: string) => {
    await logAcao({
      tipoAcao:
        variant === "cs" ? "cs_visualizou_cliente" : "gestor_visualizou_cliente",
      entidadeAfetada: "cliente",
      entidadeId: clientId,
      details: {
        origem: variant === "cs" ? "painel_cs" : "painel_gestor",
      },
    });
    navigate(`/?clientId=${encodeURIComponent(clientId)}`);
  };

  const vencimentosOrdenados = useMemo(
    () => [...vencimentosTodosClientes].slice(0, 100),
    [vencimentosTodosClientes],
  );

  const riscoGlobal = useMemo((): RiscoCarteira => {
    const clientesComVencimento90d = new Set(
      vencimentosTodosClientes
        .filter((item) => item.quantidade > 0 && item.diasRestantes >= 0 && item.diasRestantes <= 90)
        .map((item) => item.clienteId),
    );
    if (clientesComVencimento90d.size > 0) return "alto";

    const clientesComVencimento150d = new Set(
      vencimentosTodosClientes
        .filter((item) => item.quantidade > 0 && item.diasRestantes >= 0 && item.diasRestantes <= 150)
        .map((item) => item.clienteId),
    );
    if (clientesComVencimento150d.size > 0) return "medio";

    return "baixo";
  }, [vencimentosTodosClientes]);

  const alertasCount = useMemo(() => {
    let n = 0;
    resumoClientes.forEach((c) => {
      if (c.pontosVencendo90d > 0) n++;
      if (c.roiMedio < 0) n++;
      if (c.concentracaoMaxima > 60) n++;
    });
    return n;
  }, [resumoClientes]);

  const handleUpdateDemandStatus = async (
    demandId: number,
    nextStatus: "pendente" | "em_andamento" | "concluida",
  ) => {
    setUpdatingDemandId(demandId);
    try {
      const { error: updateError } = await supabase
        .from("demandas_cliente")
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq("id", demandId);
      if (updateError) throw updateError;

      setDemandasLocal((prev) =>
        prev.map((d) => (d.id === demandId ? { ...d, status: nextStatus } : d)),
      );
      toast.success("Status da demanda atualizado.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível atualizar o status.",
      );
    } finally {
      setUpdatingDemandId(null);
    }
  };

  if (variant === "cs" && csTeamLoading) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center bg-nubank-bg text-sm text-muted-foreground">
        Carregando equipe e dados consolidados...
      </div>
    );
  }

  if (variant === "cs" && csTeamError) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center bg-nubank-bg px-4 text-center text-sm text-destructive">
        {csTeamError instanceof Error ? csTeamError.message : "Erro ao carregar equipe CS."}
      </div>
    );
  }

  if (
    variant === "cs" &&
    !csTeamLoading &&
    supervisedGestorIds.length === 0
  ) {
    return (
      <div className="mx-auto min-h-screen max-w-md bg-nubank-bg px-4 pb-24 pt-6">
        <header className="mb-4 flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => navigate(variant === "cs" ? "/cs" : "/")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold">Painel CS</h1>
        </header>
        <Card className="rounded-xl border-border/80">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum gestor atribuído ao seu usuário CS. Peça ao administrador para vincular gestores em{" "}
            <code className="rounded bg-muted px-1">cs_gestores</code>.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center bg-background text-sm text-muted-foreground">
        {variant === "cs"
          ? "Carregando dados consolidados da equipe..."
          : "Carregando painel do gestor..."}
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center bg-background text-sm text-destructive">
        {variant === "cs"
          ? "Falha ao carregar dados da supervisão. Verifique as policies RLS (CS) no Supabase."
          : "Falha ao carregar dados do gestor."}
      </div>
    );
  }

  return (
    <div className={cn(darkMode && "dark")}>
      <div className="mx-auto min-h-screen w-full max-w-md bg-nubank-bg p-4 pb-24 dark:bg-background">
      <header className="mb-4 rounded-2xl gradient-primary p-4 text-primary-foreground shadow-[0_4px_16px_-2px_rgba(138,5,190,0.25)] dark:shadow-none">
        {variant !== "cs" && (
          <div className="mb-2 flex items-center justify-start">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 w-7 border-white/30 bg-white/15 p-0 text-white hover:bg-white/25 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
              onClick={() => navigate("/")}
              aria-label="Voltar ao dashboard"
              title="Voltar ao dashboard"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </div>
        )}
        <h1 className="text-xl font-bold tracking-tight text-white">
          {variant === "cs"
            ? "Supervisão CS — carteira da equipe"
            : "Centro estratégico de operação"}
        </h1>
        <p className="mt-1 text-xs text-white/85">
          {variant === "cs"
            ? "KPIs e demandas consolidados dos gestores sob sua supervisão · mesmas ferramentas do painel gestor"
            : "Ferramenta de priorização de clientes · Inteligência financeira B2B"}
        </p>
        {variant === "cs" && csEquipesNomes.length > 0 && (
          <p className="mt-2 rounded-lg bg-white/10 px-2.5 py-1.5 text-[11px] leading-snug text-white/95">
            <span className="font-semibold text-white">{gestaoNomeEmpresaBanner}</span>
          </p>
        )}
        {variant === "cs" &&
          csEquipesNomes.length === 0 &&
          !csTeamLoading &&
          !csEquipesNomesLoading && (
          <p className="mt-2 text-[10px] text-white/70">
            Equipe não nomeada: acesso via vínculos diretos em{" "}
            <code className="rounded bg-white/10 px-1">cs_gestores</code> (sem linha em{" "}
            <code className="rounded bg-white/10 px-1">equipe_cs</code>).
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
              riscoGlobal === "baixo" &&
                "bg-emerald-400/25 text-white",
              riscoGlobal === "medio" &&
                "bg-amber-400/25 text-white",
              riscoGlobal === "alto" && "bg-red-400/25 text-white",
            )}
          >
            <Shield className="h-3.5 w-3.5" />
            Risco:{" "}
            {riscoGlobal === "baixo" ? "Baixo" : riscoGlobal === "medio" ? "Médio" : "Alto"}
          </span>
          <NotificationsDropdown />
          <button
            type="button"
            onClick={toggleDark}
            className="rounded-lg p-2 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
            title={darkMode ? "Modo claro" : "Modo escuro"}
          >
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {variant === "cs" && (role === "cs" || role === "admin") && csFlat.length > 0 && (
        <section className="mb-4">
          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              className="w-full gap-2 border-2 border-amber-500/60 bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md hover:from-amber-600 hover:to-amber-700 dark:border-amber-500/50 text-xs"
              onClick={() => navigate("/cs/alertas")}
            >
              <Bell className="h-4 w-4 shrink-0" />
              Alertas inteligentes
            </Button>
            <Button
              type="button"
              className="w-full gap-2 border-2 border-slate-400/60 bg-gradient-to-r from-slate-600 to-slate-700 text-white shadow-md hover:from-slate-700 hover:to-slate-800 dark:border-slate-500/50 text-xs"
              onClick={() => navigate("/cs/tarefas")}
            >
              <ClipboardList className="h-4 w-4 shrink-0" />
              Tarefas do CS
            </Button>
          </div>
        </section>
      )}

      {variant === "cs" && csFlat.length > 0 && (
        <CsVincularClienteCard grupos={csGrupos} gestoresSomenteDireto={csDiretos} />
      )}

      {variant === "cs" && csGrupos.length > 0 && (
        <section className="mb-4">
          <Button type="button" className="w-full" onClick={() => navigate("/cs/agendar-reuniao")}>
            Agendar Reunião
          </Button>
        </section>
      )}

      {variant === "cs" && csFlat.length > 0 && (
        <section className="mb-4">
          <Card className="rounded-xl border-border/80 bg-white/95 shadow-nubank dark:border-border dark:bg-card">
            <CardHeader className="pb-2 pt-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Users className="h-4 w-4 text-[#8A05BE]" />
                Gestores da sua equipe
              </p>
              <p className="text-xs text-muted-foreground">
                {csFlat.length} gestor(es)
                {csGrupos.length > 0 ? ` · ${csGrupos.length} grupo(s) nomeado(s)` : ""}
                {csDiretos.length > 0 ? ` · ${csDiretos.length} vínculo(s) direto(s)` : ""} ·{" "}
                {kpis.totalClientesAtivos} cliente(s) na carteira consolidada
              </p>
            </CardHeader>
            <CardContent className="space-y-4 pb-4 pt-0">
              {csGrupos.map((grupo) => (
                <div key={grupo.equipeId} className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {grupo.nome}
                  </p>
                  <div className="space-y-2">
                    {grupo.gestores.map((g) => (
                      <CsGestorCollapsibleRow
                        key={g.gestorId}
                        g={g}
                        onOpenClient={handleOpenClient}
                        onEditNome={(row) => setEditingGestor({ id: row.gestorId, nome: row.gestorNome })}
                      />
                    ))}
                  </div>
                </div>
              ))}
              {csDiretos.length > 0 && (
                <div className="space-y-2 border-t border-border/60 pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Vínculos diretos ao CS (fora de equipe nomeada)
                  </p>
                  <div className="space-y-2">
                    {csDiretos.map((g) => (
                      <CsGestorCollapsibleRow
                        key={g.gestorId}
                        g={g}
                        onOpenClient={handleOpenClient}
                        onEditNome={(row) => setEditingGestor({ id: row.gestorId, nome: row.gestorNome })}
                      />
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      <section className="mb-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {variant === "cs" ? "KPIs da equipe (consolidado)" : "KPIs consolidados"}
        </p>
        <GestorKpis
          kpis={kpis}
          onOpenExpiringClients={() => {
            setActiveTab("vencendo");
          }}
        />
      </section>

      {variant === "gestor" && (role === "gestor" || role === "admin") && (
        <CsAlertasInteligentesSection
          enabled={!!user?.id}
          canSync={false}
          gestoresFlat={[]}
          onOpenClient={handleOpenClient}
          onOpenGestor={(_id) => {
            void _id;
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}

      {variant === "gestor" && (
        <section className="mb-4">
          <Card className="rounded-xl border-border/80 bg-white/95 shadow-nubank dark:border-border dark:bg-card">
            <CardHeader className="pb-2 pt-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">Minhas reuniões</p>
                  <p className="text-xs text-muted-foreground">
                    Próximas reuniões em que você está como participante.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => navigate("/gestor/reunioes")}
                >
                  Ir para agenda
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 pb-4 pt-0">
              {minhasReunioesLoading ? (
                <p className="text-xs text-muted-foreground">Carregando reuniões...</p>
              ) : minhasReunioes.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma reunião agendada para você.</p>
              ) : (
                <div className="max-h-44 space-y-2 overflow-y-auto">
                  {minhasReunioes.map((reuniao) => (
                    <div
                      key={reuniao.id}
                      className="rounded-lg border border-border/70 bg-background/60 p-2"
                    >
                      <p className="text-xs font-semibold">{reuniao.titulo}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(reuniao.startsAt).toLocaleDateString("pt-BR")} às{" "}
                        {new Date(reuniao.startsAt).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        })}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {reuniao.equipeNome}
                        {reuniao.clienteNome ? ` · ${reuniao.clienteNome}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as GestorTab)}
        className="gestor-tabs mt-4 space-y-3"
      >
        <div className="relative z-10 w-full select-none touch-manipulation">
        <TabsList className="flex h-auto w-full flex-wrap gap-1.5 rounded-xl border border-nubank-border bg-white/95 p-1.5 shadow-nubank dark:border-border dark:bg-muted/30 dark:shadow-none">
          <TabsTrigger value="demandas" className="shrink-0 rounded-lg px-2.5 text-xs data-[state=active]:!shadow-[0_2px_10px_-2px_rgba(138,5,190,0.4)] data-[state=active]:gradient-primary data-[state=active]:!border-transparent data-[state=active]:text-primary-foreground focus-visible:!ring-primary/50">
            Demandas
          </TabsTrigger>
          <TabsTrigger value="clientes" className="shrink-0 rounded-lg px-2.5 text-xs data-[state=active]:!shadow-[0_2px_10px_-2px_rgba(138,5,190,0.4)] data-[state=active]:gradient-primary data-[state=active]:!border-transparent data-[state=active]:text-primary-foreground focus-visible:!ring-primary/50">
            Clientes
          </TabsTrigger>
          <TabsTrigger value="vencendo" className="shrink-0 rounded-lg px-2.5 text-xs data-[state=active]:!shadow-[0_2px_10px_-2px_rgba(138,5,190,0.4)] data-[state=active]:gradient-primary data-[state=active]:!border-transparent data-[state=active]:text-primary-foreground focus-visible:!ring-primary/50">
            Vencendo
          </TabsTrigger>
          <TabsTrigger value="alertas" className="shrink-0 rounded-lg px-2.5 text-xs data-[state=active]:!shadow-[0_2px_10px_-2px_rgba(138,5,190,0.4)] data-[state=active]:gradient-primary data-[state=active]:!border-transparent data-[state=active]:text-primary-foreground focus-visible:!ring-primary/50">
            Alertas
          </TabsTrigger>
          <TabsTrigger value="rentabilidade" className="shrink-0 rounded-lg px-2.5 text-xs data-[state=active]:!shadow-[0_2px_10px_-2px_rgba(138,5,190,0.4)] data-[state=active]:gradient-primary data-[state=active]:!border-transparent data-[state=active]:text-primary-foreground focus-visible:!ring-primary/50">
            Rentab.
          </TabsTrigger>
          <TabsTrigger value="dre" className="shrink-0 rounded-lg px-2.5 text-xs data-[state=active]:!shadow-[0_2px_10px_-2px_rgba(138,5,190,0.4)] data-[state=active]:gradient-primary data-[state=active]:!border-transparent data-[state=active]:text-primary-foreground focus-visible:!ring-primary/50">
            DRE
          </TabsTrigger>
          <TabsTrigger value="comparativo" className="shrink-0 rounded-lg px-2.5 text-xs data-[state=active]:!shadow-[0_2px_10px_-2px_rgba(138,5,190,0.4)] data-[state=active]:gradient-primary data-[state=active]:!border-transparent data-[state=active]:text-primary-foreground focus-visible:!ring-primary/50">
            Comparar
          </TabsTrigger>
          <TabsTrigger value="historico" className="shrink-0 rounded-lg px-2.5 text-xs data-[state=active]:!shadow-[0_2px_10px_-2px_rgba(138,5,190,0.4)] data-[state=active]:gradient-primary data-[state=active]:!border-transparent data-[state=active]:text-primary-foreground focus-visible:!ring-primary/50">
            Histórico
          </TabsTrigger>
          <TabsTrigger value="nps" className="shrink-0 rounded-lg px-2.5 text-xs data-[state=active]:!shadow-[0_2px_10px_-2px_rgba(138,5,190,0.4)] data-[state=active]:gradient-primary data-[state=active]:!border-transparent data-[state=active]:text-primary-foreground focus-visible:!ring-primary/50">
            <span className="inline-flex items-center gap-1">
              <BarChart3 className="h-3 w-3" />
              NPS
            </span>
          </TabsTrigger>
          <TabsTrigger value="csat" className="shrink-0 rounded-lg px-2.5 text-xs data-[state=active]:!shadow-[0_2px_10px_-2px_rgba(138,5,190,0.4)] data-[state=active]:gradient-primary data-[state=active]:!border-transparent data-[state=active]:text-primary-foreground focus-visible:!ring-primary/50">
            <span className="inline-flex items-center gap-1">
              <Star className="h-3 w-3" />
              CSAT
            </span>
          </TabsTrigger>
          <TabsTrigger value="performance" className="shrink-0 rounded-lg px-2.5 text-xs data-[state=active]:!shadow-[0_2px_10px_-2px_rgba(138,5,190,0.4)] data-[state=active]:gradient-primary data-[state=active]:!border-transparent data-[state=active]:text-primary-foreground focus-visible:!ring-primary/50">
            <span className="inline-flex items-center gap-1">
              <Trophy className="h-3 w-3" />
              Performance
            </span>
          </TabsTrigger>
          <TabsTrigger value="exportar" className="shrink-0 rounded-lg px-2.5 text-xs data-[state=active]:!shadow-[0_2px_10px_-2px_rgba(138,5,190,0.4)] data-[state=active]:gradient-primary data-[state=active]:!border-transparent data-[state=active]:text-primary-foreground focus-visible:!ring-primary/50">
            Exportar
          </TabsTrigger>
        </TabsList>
        </div>

        <TabsContent value="clientes" className="mt-3">
          <GestorClientsTable clients={resumoClientes} onOpenClient={handleOpenClient} />
        </TabsContent>

        <TabsContent value="vencendo" className="mt-3 space-y-3">
          <Card className="rounded-xl border-slate-200/80 bg-white/90 shadow-[0_4px_12px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card dark:shadow-none">
            <CardContent className="p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                Próximos vencimentos (todos os clientes)
              </p>
              {vencimentosOrdenados.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhum vencimento nos próximos 90 dias na carteira.
                </p>
              ) : (
                <div className="max-h-[55vh] space-y-1.5 overflow-y-auto">
                  {vencimentosOrdenados.map((item, idx) => (
                    <button
                      key={`${item.clienteId}-${item.programId}-${item.data}-${idx}`}
                      type="button"
                      onClick={() => handleOpenClient(item.clienteId)}
                      className="flex w-full flex-col gap-0.5 rounded-lg border border-nubank-border bg-white px-3 py-2 text-left transition-colors hover:bg-primary/5 dark:border-border/80 dark:bg-muted/30 dark:hover:bg-muted/60"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">{item.clienteNome}</span>
                        <span
                          className={
                            item.diasRestantes <= 30
                              ? "font-semibold text-red-600 dark:text-red-400"
                              : item.diasRestantes <= 60
                                ? "font-semibold text-amber-600 dark:text-amber-400"
                                : "text-muted-foreground"
                          }
                        >
                          {item.diasRestantes} dias
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{item.programName}</span>
                        <span>
                          {item.quantidade.toLocaleString("pt-BR")} pts · {item.data}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alertas" className="mt-3">
          <GestorAlertas clients={resumoClientes} onOpenClient={handleOpenClient} />
        </TabsContent>

        <TabsContent value="demandas" className="mt-3">
          <Card className="rounded-xl border-slate-200/80 bg-white/90 shadow-[0_4px_12px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card dark:shadow-none">
            <CardContent className="p-3">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">
                Demandas solicitadas pelos clientes
              </p>
              <div className="mb-2 flex items-center gap-1 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setDemandStatusFilter("todos")}
                  className={`rounded-full px-2 py-1 text-[10px] font-medium ${
                    demandStatusFilter === "todos"
                      ? "bg-primary text-primary-foreground"
                      : "bg-slate-100 text-slate-600 dark:bg-muted dark:text-muted-foreground"
                  }`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setDemandStatusFilter("pendente")}
                  className={`rounded-full px-2 py-1 text-[10px] font-medium ${
                    demandStatusFilter === "pendente"
                      ? "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                      : "bg-slate-100 text-slate-600 dark:bg-muted dark:text-muted-foreground"
                  }`}
                >
                  Pendentes
                </button>
                <button
                  type="button"
                  onClick={() => setDemandStatusFilter("em_andamento")}
                  className={`rounded-full px-2 py-1 text-[10px] font-medium ${
                    demandStatusFilter === "em_andamento"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                      : "bg-slate-100 text-slate-600 dark:bg-muted dark:text-muted-foreground"
                  }`}
                >
                  Em andamento
                </button>
                <button
                  type="button"
                  onClick={() => setDemandStatusFilter("concluida")}
                  className={`rounded-full px-2 py-1 text-[10px] font-medium ${
                    demandStatusFilter === "concluida"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : "bg-slate-100 text-slate-600 dark:bg-muted dark:text-muted-foreground"
                  }`}
                >
                  Concluídas
                </button>
              </div>
              {demandasFiltradas.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhuma demanda neste filtro.
                </p>
              ) : (
                <div className="max-h-[55vh] space-y-1.5 overflow-y-auto">
                  {demandasFiltradas.map((d) => {
                    const origem = String(d.payload.origem ?? "-");
                    const destino = String(d.payload.destino ?? "-");
                    const passageiros = Number(d.payload.passageiros ?? 0);
                    const dataIda = String(d.payload.dataIda ?? "");
                    const dataVolta = String(d.payload.dataVolta ?? "");
                    const diasViagemRaw = d.payload.diasViagem;
                    const diasViagem =
                      typeof diasViagemRaw === "number" && Number.isFinite(diasViagemRaw)
                        ? diasViagemRaw
                        : null;
                    const detalhes = String(d.payload.detalhes ?? "");
                    const statusLabel =
                      d.status === "concluida"
                        ? "Concluída"
                        : d.status === "em_andamento"
                          ? "Em andamento"
                          : "Pendente";
                    return (
                      <button
                        key={`demanda-${d.id}`}
                        type="button"
                        onClick={() => handleOpenClient(d.clienteId)}
                        className="flex w-full flex-col rounded-lg border border-nubank-border bg-white px-3 py-2 text-left transition-colors hover:bg-primary/5 dark:border-border/70 dark:bg-muted/20 dark:hover:bg-muted/50"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold">{d.clienteNome}</span>
                          <span className="text-muted-foreground">
                            {new Date(d.createdAt).toLocaleDateString("pt-BR")}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Tipo: {d.tipo === "emissao" ? "Emissão" : "Outros"} · Status:{" "}
                          <span
                            className={
                              d.status === "concluida"
                                ? "text-emerald-600 dark:text-emerald-400"
                                : d.status === "em_andamento"
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-slate-500"
                            }
                          >
                            {statusLabel}
                          </span>
                        </p>
                        {d.tipo === "emissao" ? (
                          <>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {origem} → {destino} · {passageiros} passageiro(s)
                            </p>
                            {(dataIda || dataVolta || diasViagem !== null) && (
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                {dataIda && dataVolta
                                  ? `${new Date(`${dataIda}T00:00:00`).toLocaleDateString("pt-BR")} - ${new Date(`${dataVolta}T00:00:00`).toLocaleDateString("pt-BR")}`
                                  : dataIda
                                    ? `Ida: ${new Date(`${dataIda}T00:00:00`).toLocaleDateString("pt-BR")}`
                                    : `Volta: ${new Date(`${dataVolta}T00:00:00`).toLocaleDateString("pt-BR")}`}
                                {diasViagem !== null
                                  ? ` · ${diasViagem} ${diasViagem === 1 ? "dia" : "dias"}`
                                  : ""}
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {detalhes || "Sem detalhes"}
                          </p>
                        )}
                        <div
                          className="mt-2 flex items-center gap-1"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <button
                            type="button"
                            className={`rounded-full px-2 py-1 text-[10px] font-medium ${
                              d.status === "pendente"
                                ? "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                                : "bg-slate-100 text-slate-600 dark:bg-muted dark:text-muted-foreground"
                            }`}
                            disabled={updatingDemandId === d.id}
                            onClick={() =>
                              void handleUpdateDemandStatus(d.id, "pendente")
                            }
                          >
                            Pendente
                          </button>
                          <button
                            type="button"
                            className={`rounded-full px-2 py-1 text-[10px] font-medium ${
                              d.status === "em_andamento"
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                                : "bg-slate-100 text-slate-600 dark:bg-muted dark:text-muted-foreground"
                            }`}
                            disabled={updatingDemandId === d.id}
                            onClick={() =>
                              void handleUpdateDemandStatus(d.id, "em_andamento")
                            }
                          >
                            Em andamento
                          </button>
                          <button
                            type="button"
                            className={`rounded-full px-2 py-1 text-[10px] font-medium ${
                              d.status === "concluida"
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                                : "bg-slate-100 text-slate-600 dark:bg-muted dark:text-muted-foreground"
                            }`}
                            disabled={updatingDemandId === d.id}
                            onClick={() =>
                              void handleUpdateDemandStatus(d.id, "concluida")
                            }
                          >
                            Concluída
                          </button>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rentabilidade" className="mt-3">
          <GestorRentabilidade clients={resumoClientes} />
        </TabsContent>

        <TabsContent value="dre" className="mt-3">
          <GestorDre dre={dreConsolidado} />
        </TabsContent>

        <TabsContent value="comparativo" className="mt-3">
          <GestorComparativo clients={resumoClientes} />
        </TabsContent>

        <TabsContent value="historico" className="mt-3">
          <GestorHistorico logs={logs} loading={logsLoading} />
        </TabsContent>

        <TabsContent value="nps" className="mt-3">
          <CsNpsCarteiraSection
            restrictToGestorIds={variant === "cs" ? supervisedGestorIds : null}
            enabled={npsTabEnabled && (variant === "cs" || !!user?.id)}
            gestoresFlat={variant === "cs" ? csFlat : []}
            onOpenClient={handleOpenClient}
          />
        </TabsContent>

        <TabsContent value="csat" className="mt-3">
          <CsCsatSection
            restrictToGestorIds={variant === "cs" ? supervisedGestorIds : null}
            enabled={npsTabEnabled && (variant === "cs" || !!user?.id)}
            gestoresFlat={variant === "cs" ? csFlat : []}
            onOpenClient={handleOpenClient}
          />
        </TabsContent>

        <TabsContent value="performance" className="mt-3">
          <CsGestorPerformanceSection
            restrictToGestorIds={variant === "cs" ? supervisedGestorIds : null}
            enabled={npsTabEnabled && (variant === "cs" || !!user?.id)}
            gestoresFlat={variant === "cs" ? csFlat : []}
            canRefresh={variant === "cs" && (role === "cs" || role === "admin")}
          />
        </TabsContent>

        <TabsContent value="exportar" className="mt-3">
          <GestorExport
            clients={resumoClientes}
            vencimentos={vencimentosOrdenados}
            alertasCount={alertasCount}
            kpis={{
              totalClientesAtivos: kpis.totalClientesAtivos,
              valorEstrategicoTotal: kpis.valorEstrategicoTotal,
              economiaTotalGestao: kpis.economiaTotalGestao,
            }}
          />
        </TabsContent>
      </Tabs>
      </div>

      <Dialog open={!!editingGestor} onOpenChange={(open) => !open && setEditingGestor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar gestor</DialogTitle>
          </DialogHeader>
          {editingGestor && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="cs-gestor-nome">Nome completo</Label>
                <Input
                  id="cs-gestor-nome"
                  value={editingGestor.nome}
                  onChange={(e) =>
                    setEditingGestor((prev) => prev && { ...prev, nome: e.target.value })
                  }
                  placeholder="Nome do gestor"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditingGestor(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void handleSaveGestorNome()}
              disabled={savingGestorNome || !editingGestor?.nome?.trim()}
            >
              {savingGestorNome ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GestorDashboard;
