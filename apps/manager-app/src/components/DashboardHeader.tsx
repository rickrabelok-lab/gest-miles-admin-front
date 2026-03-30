import {
  User,
  Menu,
  X,
  Zap,
  LogIn,
  LogOut,
  Copy,
  Check,
  FileEdit,
  Bell,
  Users,
  Info,
  UserPlus,
  HelpCircle,
  MessageCircle,
  Calculator,
  Radio,
} from "lucide-react";
import GestMilesLogo from "@/components/GestMilesLogo";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { useCsGestores } from "@/hooks/useCsGestores";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import NotificationsDropdown from "@/components/notifications/NotificationsDropdown";

const getInitials = (email: string | undefined) => {
  if (!email) return "?";
  const part = email.split("@")[0] ?? "";
  const letters = part.replace(/[^a-z]/gi, "").slice(0, 2);
  return (letters || "?").toUpperCase();
};

const DashboardHeader = () => {
  const [bannerVisible, setBannerVisible] = useState(true);
  const [idCopied, setIdCopied] = useState(false);
  const [managedClientIds, setManagedClientIds] = useState<string[]>([]);
  const [managedClientNames, setManagedClientNames] = useState<Record<string, string>>({});
  const [demandSummary, setDemandSummary] = useState({
    openCount: 0,
    pendingCount: 0,
    inProgressCount: 0,
    lastClientName: null as string | null,
  });
  const navigate = useNavigate();
  const { user, role, signOut } = useAuth();
  const isGestorView = role === "gestor" || role === "admin";
  const { data: csDashboard } = useCsGestores(role === "cs");
  const csTeam = csDashboard?.flat ?? [];
  const showDemandOpenBanner = isGestorView || role === "cs";

  useEffect(() => {
    if (role === "cs") {
      const ids = new Set<string>();
      csTeam.forEach((g) => {
        g.clientes.forEach((c) => {
          if (c.clienteId) ids.add(c.clienteId);
        });
      });
      const idList = Array.from(ids);
      setManagedClientIds(idList);
      if (idList.length === 0) {
        setManagedClientNames({});
        return;
      }
      let cancelled = false;
      void (async () => {
        const { data: perfisData } = await supabase
          .from("perfis")
          .select("usuario_id, nome_completo")
          .in("usuario_id", idList);
        if (cancelled) return;
        const names: Record<string, string> = {};
        (perfisData ?? []).forEach((row) => {
          names[row.usuario_id as string] = (row.nome_completo as string) || "Cliente";
        });
        setManagedClientNames(names);
      })();
      return () => {
        cancelled = true;
      };
    }

    if (!isGestorView || !user?.id) {
      setManagedClientIds([]);
      setManagedClientNames({});
      setDemandSummary({
        openCount: 0,
        pendingCount: 0,
        inProgressCount: 0,
        lastClientName: null,
      });
      return;
    }

    let cancelled = false;
    const loadManagedClients = async () => {
      const { data, error } = await supabase
        .from("cliente_gestores")
        .select("cliente_id")
        .eq("gestor_id", user.id);
      if (error || cancelled) return;
      const ids = (data ?? []).map((row) => row.cliente_id as string).filter(Boolean);
      setManagedClientIds(ids);
      if (ids.length === 0) {
        setManagedClientNames({});
        return;
      }
      const { data: perfisData } = await supabase
        .from("perfis")
        .select("usuario_id, nome_completo")
        .in("usuario_id", ids);
      if (cancelled) return;
      const names: Record<string, string> = {};
      (perfisData ?? []).forEach((row) => {
        names[row.usuario_id as string] = (row.nome_completo as string) || "Cliente";
      });
      setManagedClientNames(names);
    };

    void loadManagedClients();
    return () => {
      cancelled = true;
    };
  }, [isGestorView, user?.id, role, csTeam]);

  useEffect(() => {
    if (!showDemandOpenBanner || managedClientIds.length === 0) {
      setDemandSummary({
        openCount: 0,
        pendingCount: 0,
        inProgressCount: 0,
        lastClientName: null,
      });
      return;
    }

    const managedIds = new Set(managedClientIds);
    let active = true;

    const loadDemandSummary = async () => {
      const { data, error } = await supabase
        .from("demandas_cliente")
        .select("cliente_id,status,created_at")
        .in("cliente_id", managedClientIds)
        .in("status", ["pendente", "em_andamento"])
        .order("created_at", { ascending: false });

      if (!active || error) return;

      const rows = (data ?? []) as Array<{
        cliente_id?: string;
        status?: string;
      }>;
      const pendingCount = rows.filter((row) => row.status === "pendente").length;
      const inProgressCount = rows.filter((row) => row.status === "em_andamento").length;
      const lastClientId = rows[0]?.cliente_id ? String(rows[0].cliente_id) : null;
      const lastClientName = lastClientId
        ? managedClientNames[lastClientId] ?? "Cliente"
        : null;

      setDemandSummary({
        openCount: rows.length,
        pendingCount,
        inProgressCount,
        lastClientName,
      });
    };

    void loadDemandSummary();

    const channel = supabase
      .channel(`header-demandas-open-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "demandas_cliente" },
        (payload) => {
          const row = (payload.new ?? payload.old) as { cliente_id?: string } | null;
          const clienteId = String(row?.cliente_id ?? "");
          if (!clienteId || !managedIds.has(clienteId)) return;
          setBannerVisible(true);
          void loadDemandSummary();
        },
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [showDemandOpenBanner, managedClientIds, managedClientNames]);

  const copyAccountId = () => {
    if (!user?.id) return;
    navigator.clipboard.writeText(user.id).then(() => {
      setIdCopied(true);
      toast.success("ID da conta copiado. Envie ao gestor para solicitar acesso.");
      setTimeout(() => setIdCopied(false), 2000);
    }).catch(() => toast.error("Não foi possível copiar."));
  };

  const handleLogout = async () => {
    try {
      await signOut();
      navigate("/");
    } catch {
      navigate("/");
    }
  };

  return (
    <div className="gradient-primary text-header-foreground">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 pt-3.5 pb-3.5">
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 rounded-[16px] bg-white/15 px-3 py-2 text-sm font-medium backdrop-blur-sm transition-all duration-200 hover:bg-white/25"
              >
                <User size={16} />
                <span>{user ? getInitials(user.email) : "?"}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-44">
              {user ? (
                <>
                  <DropdownMenuItem disabled className="text-muted-foreground">
                    <span className="truncate">{user.email}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/perfil")}>
                    Meu perfil
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Sair
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem onClick={() => navigate("/auth")}>
                    <LogIn className="mr-2 h-4 w-4" />
                    Entrar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/auth")}>
                    Criar conta
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <NotificationsDropdown />
        </div>
        <div className="flex flex-1 justify-center">
          <div className="flex items-center gap-2">
            <GestMilesLogo size={26} variant="light" className="shrink-0" />
            <h1 className="font-display text-xl font-bold tracking-tight">Gest Miles</h1>
          </div>
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <button
              type="button"
              className="rounded-[16px] p-2 transition-all duration-200 hover:bg-white/20"
              aria-label="Abrir menu"
            >
              <Menu size={22} />
            </button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className="flex h-full w-3/4 flex-col overflow-hidden p-0 sm:max-w-xs [&>button]:right-4 [&>button]:top-4 [&>button]:text-white [&>button]:hover:bg-white/20 [&>button]:hover:text-white"
          >
            {/* Header estilo Oktoplus – faixa roxa Gest Miles */}
            <div className="flex shrink-0 items-center justify-between bg-[#8A05BE] px-4 py-4 pr-12">
              <div className="flex items-center gap-2">
                <GestMilesLogo size={24} variant="light" className="shrink-0" />
                <span className="font-display text-lg font-bold tracking-tight text-white">
                  Gest Miles
                </span>
              </div>
            </div>

            {/* Área de conteúdo – fundo claro, seções com títulos roxos e itens com ícone */}
            <div className="flex flex-1 flex-col overflow-y-auto bg-white px-4 py-5 dark:bg-gray-50">
              {user ? (
                <>
                  <section className="mb-5">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#8A05BE]">
                      Conta
                    </p>
                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-gray-200 dark:bg-gray-100/80">
                      <p className="text-[11px] font-medium text-gray-500 dark:text-gray-600">
                        ID da sua conta
                      </p>
                      <SheetClose asChild>
                        <button
                          type="button"
                          onClick={copyAccountId}
                          className="mt-1 flex w-full items-center justify-between gap-2 text-left text-xs font-mono text-gray-900 dark:text-gray-900"
                        >
                          <span className="truncate" title={user.id}>
                            {user.id}
                          </span>
                          {idCopied ? (
                            <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                          ) : (
                            <Copy className="h-4 w-4 shrink-0 text-[#8A05BE]" />
                          )}
                        </button>
                      </SheetClose>
                    </div>
                  </section>

                  <section className="mb-5">
                    <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[#8A05BE]">
                      Ações rápidas
                    </p>
                    <div className="space-y-0.5">
                      <SheetClose asChild>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 rounded-lg px-1 py-3 text-left text-sm font-medium text-gray-800 transition-colors hover:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200/80"
                          onClick={() => navigate("/registrar-emissao")}
                        >
                          <FileEdit className="h-5 w-5 shrink-0 text-[#8A05BE]" />
                          <span>Registrar Emissão</span>
                        </button>
                      </SheetClose>
                      <SheetClose asChild>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 rounded-lg px-1 py-3 text-left text-sm text-gray-800 transition-colors hover:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200/80"
                          onClick={() => navigate("/alertas/novo")}
                        >
                          <Bell className="h-5 w-5 shrink-0 text-[#8A05BE]" />
                          <span>Adicionar Alerta</span>
                        </button>
                      </SheetClose>
                      {(role === "gestor" || role === "admin") && (
                        <SheetClose asChild>
                          <button
                            type="button"
                            className="flex w-full items-center gap-3 rounded-lg px-1 py-3 text-left text-sm text-gray-800 transition-colors hover:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200/80"
                            onClick={() => navigate("/clientes")}
                          >
                            <Users className="h-5 w-5 shrink-0 text-[#8A05BE]" />
                            <span>Clientes</span>
                          </button>
                        </SheetClose>
                      )}
                      {(role === "cs" || role === "admin") && (
                        <SheetClose asChild>
                          <button
                            type="button"
                            className="flex w-full items-center gap-3 rounded-lg px-1 py-3 text-left text-sm text-gray-800 transition-colors hover:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200/80"
                            onClick={() => navigate("/cs")}
                          >
                            <Users className="h-5 w-5 shrink-0 text-[#8A05BE]" />
                            <span>Painel CS</span>
                          </button>
                        </SheetClose>
                      )}
                      <SheetClose asChild>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 rounded-lg px-1 py-3 text-left text-sm text-gray-800 transition-colors hover:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200/80"
                          onClick={() => navigate("/simular-compra-milhas")}
                        >
                          <Calculator className="h-5 w-5 shrink-0 text-[#8A05BE]" />
                          <span>Simular Compra de Milhas</span>
                        </button>
                      </SheetClose>
                      <SheetClose asChild>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 rounded-lg px-1 py-3 text-left text-sm text-gray-800 transition-colors hover:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200/80"
                          onClick={() => navigate("/radar-oportunidades")}
                        >
                          <Radio className="h-5 w-5 shrink-0 text-[#8A05BE]" />
                          <span>Radar de Oportunidades</span>
                        </button>
                      </SheetClose>
                    </div>
                  </section>

                  <section className="mb-5">
                    <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[#8A05BE]">
                      Saiba mais
                    </p>
                    <div className="space-y-0.5">
                      <SheetClose asChild>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 rounded-lg px-1 py-3 text-left text-sm text-gray-800 transition-colors hover:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200/80"
                          onClick={() => navigate("/sobre")}
                        >
                          <Info className="h-5 w-5 shrink-0 text-[#8A05BE]" />
                          <span>Sobre a GestMiles</span>
                        </button>
                      </SheetClose>
                      <SheetClose asChild>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 rounded-lg px-1 py-3 text-left text-sm text-gray-800 transition-colors hover:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200/80"
                          onClick={() => navigate("/convide-amigos")}
                        >
                          <UserPlus className="h-5 w-5 shrink-0 text-[#8A05BE]" />
                          <span>Convide Amigos</span>
                        </button>
                      </SheetClose>
                      <SheetClose asChild>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 rounded-lg px-1 py-3 text-left text-sm text-gray-800 transition-colors hover:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200/80"
                          onClick={() => navigate("/duvidas")}
                        >
                          <HelpCircle className="h-5 w-5 shrink-0 text-[#8A05BE]" />
                          <span>Dúvidas</span>
                        </button>
                      </SheetClose>
                      <SheetClose asChild>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 rounded-lg px-1 py-3 text-left text-sm text-gray-800 transition-colors hover:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200/80"
                          onClick={() => navigate("/fale-conosco")}
                        >
                          <MessageCircle className="h-5 w-5 shrink-0 text-[#8A05BE]" />
                          <span>Fale Conosco</span>
                        </button>
                      </SheetClose>
                    </div>
                  </section>

                  <div className="mt-auto border-t border-gray-200 pt-4 dark:border-gray-200">
                    <SheetClose asChild>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 rounded-lg px-1 py-3 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-500 dark:hover:bg-red-950/30"
                        onClick={handleLogout}
                      >
                        <LogOut className="h-5 w-5 shrink-0" />
                        <span>Sair</span>
                      </button>
                    </SheetClose>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 flex-col justify-center">
                  <p className="mb-4 text-sm text-gray-600 dark:text-gray-600">
                    Entre ou crie uma conta para acessar todos os recursos da GestMiles.
                  </p>
                  <SheetClose asChild>
                    <button
                      type="button"
                      className="w-full rounded-xl bg-[#8A05BE] px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-95"
                      onClick={() => navigate("/auth")}
                    >
                      Entrar ou criar conta
                    </button>
                  </SheetClose>
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Promo banner */}
      {bannerVisible && (
        <div className="mx-4 mb-2.5 flex items-center gap-2 rounded-[14px] border border-white/20 bg-white/95 px-3 py-2 shadow-[0_2px_12px_rgba(0,0,0,0.06)] backdrop-blur-sm">
          <Zap size={18} className="shrink-0 text-warning" />
          {showDemandOpenBanner ? (
            <button
              type="button"
              onClick={() =>
                navigate(
                  role === "cs"
                    ? "/cs?tab=demandas&status=pendente"
                    : "/gestor?tab=demandas&status=pendente",
                )
              }
              className="flex-1 text-left text-sm text-nubank-text hover:opacity-90"
            >
              <span className="font-semibold text-warning">Demandas abertas:</span>{" "}
              {demandSummary.openCount}{" "}
              {demandSummary.openCount === 1 ? "demanda" : "demandas"}{" "}
              {demandSummary.openCount > 0
                ? `(pendentes: ${demandSummary.pendingCount} • em andamento: ${demandSummary.inProgressCount})`
                : "no momento."}{" "}
              {demandSummary.lastClientName ? `Última de ${demandSummary.lastClientName}.` : ""}
            </button>
          ) : (
            <p className="flex-1 text-sm text-nubank-text">
              Bônus de até <span className="font-bold text-warning">133%</span> na transferência.
              Confira
            </p>
          )}
          <button onClick={() => setBannerVisible(false)} className="shrink-0 rounded-full p-1 text-nubank-text-secondary opacity-70 hover:bg-black/5 hover:opacity-100" aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
};

export default DashboardHeader;
