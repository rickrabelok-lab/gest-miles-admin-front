import { useAppConfig } from "@gest-miles/shared";
import {
  Briefcase,
  Building2,
  CreditCard,
  LayoutDashboard,
  Lightbulb,
  Shield,
  Settings,
  Activity,
  LogOut,
  Plane,
  ScrollText,
  UserSquare2,
  Users,
} from "lucide-react";
import { useMemo } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { useAdminEquipe } from "@/context/AdminEquipeContext";
import { useAccessScope } from "@/hooks/useAccessScope";
import { canAccessAppConfig, canAccessSecurityDashboard } from "@/lib/accessScope";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/insights", label: "Insights", icon: Lightbulb, end: false },
  { to: "/seguranca", label: "Segurança", icon: Shield, end: false },
  { to: "/configuracoes", label: "Configurações", icon: Settings, end: false },
  { to: "/equipes", label: "Equipes", icon: Building2, end: false },
  { to: "/users", label: "Usuários", icon: Users, end: false },
  { to: "/clients", label: "Clientes", icon: UserSquare2, end: false },
  { to: "/viagens", label: "Viagens por Gestão", icon: Plane, end: false },
  { to: "/viagens-geral", label: "Viagens Geral", icon: Plane, end: false },
  { to: "/operacional", label: "Operacional", icon: Activity, end: false },
  { to: "/gestores", label: "Gestores", icon: Briefcase, end: false },
  { to: "/assinaturas", label: "Assinaturas", icon: CreditCard, end: false },
  { to: "/logs", label: "Logs", icon: ScrollText, end: false },
] as const;

const NONE = "__none__";

export default function AdminAppLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { signOut, perfilNome } = useAdminAuth();
  const {
    equipesGrupoGestaoRaiz,
    selectedEquipeId,
    setSelectedEquipeId,
    equipeSelectionLocked,
    loading: eqLoading,
    error: eqError,
    equipes,
  } = useAdminEquipe();
  const { scope } = useAccessScope();
  const { getString } = useAppConfig();
  const appNome = getString("sistema.app_nome", "Gest Miles");
  const logoUrl = getString("sistema.logo_url", "").trim();

  const navItems = useMemo(
    () =>
      NAV.filter((item) => {
        if (item.to === "/seguranca") return canAccessSecurityDashboard(scope);
        if (item.to === "/configuracoes") return canAccessAppConfig(scope);
        return true;
      }),
    [scope],
  );

  const equipeNomeLocked = equipeSelectionLocked
    ? equipes.find((e) => e.id === selectedEquipeId)?.nome ?? selectedEquipeId
    : null;

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="border-r border-sidebar-border">
        <SidebarHeader className="border-b border-sidebar-border">
          <div className="flex items-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:justify-center">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-8 w-8 shrink-0 rounded object-contain" />
            ) : null}
            <span className="font-display text-lg font-bold tracking-tight text-sidebar-foreground truncate" title={appNome}>
              {appNome}
            </span>
            <span className="text-xs font-medium text-muted-foreground group-data-[collapsible=icon]:hidden">Admin</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Menu</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => {
                  const active = item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                        <NavLink to={item.to}>
                          <Icon />
                          <span>{item.label}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarSeparator />
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => {
                  void signOut().then(() => navigate("/login", { replace: true }));
                }}
                tooltip="Sair"
              >
                <LogOut />
                <span>Sair</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="bg-[var(--fintech-bg)]">
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-4" />
          <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-3">
            {perfilNome ? (
              <span className="hidden truncate text-xs text-muted-foreground sm:inline max-w-[140px]" title={perfilNome}>
                {perfilNome}
              </span>
            ) : null}
            {eqError ? <span className="truncate text-xs text-destructive">{eqError}</span> : null}
            {equipeSelectionLocked ? (
              <span
                className="inline-flex h-9 max-w-[min(100%,320px)] items-center rounded-[14px] border border-nubank-border bg-muted/40 px-3 text-sm font-medium text-nubank-text"
                title="Âmbito fixo ao seu perfil"
              >
                Gestão: <span className="ml-1 truncate font-semibold">{equipeNomeLocked ?? "—"}</span>
              </span>
            ) : (
              <Select
                value={selectedEquipeId ?? NONE}
                onValueChange={(v) => setSelectedEquipeId(v === NONE ? null : v)}
                disabled={eqLoading || equipesGrupoGestaoRaiz.length === 0}
              >
                <SelectTrigger className="h-9 w-full max-w-[min(100%,280px)] rounded-[14px] border-nubank-border text-sm font-medium">
                  <SelectValue placeholder="Filtrar por equipe" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Escolher equipe —</SelectItem>
                  {equipesGrupoGestaoRaiz.map((eq) => (
                    <SelectItem key={eq.id} value={eq.id}>
                      {eq.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
