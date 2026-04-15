import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { GestMilesLogoMark } from "@/components/admin/GestMilesLogoMark";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { useAdminEquipe } from "@/context/AdminEquipeContext";
import { useAccessScope } from "@/hooks/useAccessScope";
import { canAccessAppConfig, canAccessSecurityDashboard } from "@/lib/accessScope";
import { countB2cClientesSemEquipe } from "@/lib/adminApi";
import { countBetaFlagsInStorage } from "@/services/adminFeatureFlagsStore";
import { loadSuporteState } from "@/services/adminSuporteStore";
import { cn } from "@/lib/utils";

const NONE = "__none__";

const ROUTE_TITLES: { prefix: string; title: string }[] = [
  { prefix: "/equipes/", title: "Equipe" },
  { prefix: "/contas/", title: "Conta do utilizador" },
  { prefix: "/dashboard", title: "Dashboard" },
  { prefix: "/insights", title: "Insights" },
  { prefix: "/equipes", title: "Equipes de Gestão" },
  { prefix: "/users", title: "Usuários" },
  { prefix: "/clients", title: "Usuários B2C" },
  { prefix: "/gestores", title: "Gestores" },
  { prefix: "/viagens-geral", title: "Viagens Geral" },
  { prefix: "/viagens", title: "Viagens por Gestão" },
  { prefix: "/operacional", title: "Operacional" },
  { prefix: "/seguranca", title: "Segurança" },
  { prefix: "/configuracoes", title: "Configurações" },
  { prefix: "/assinaturas", title: "Assinaturas & Receita" },
  { prefix: "/planos", title: "Planos & Preços" },
  { prefix: "/cupons", title: "Cupons & Promoções" },
  { prefix: "/relatorios", title: "Relatórios" },
  { prefix: "/monetizacao", title: "Monetização Stripe" },
  { prefix: "/feature-flags", title: "Feature Flags" },
  { prefix: "/comunicacoes", title: "Comunicações" },
  { prefix: "/suporte", title: "Suporte & Tickets" },
  { prefix: "/logs", title: "Logs" },
];

function breadcrumbTitle(pathname: string): string {
  for (const { prefix, title } of ROUTE_TITLES) {
    if (prefix.endsWith("/") && pathname.startsWith(prefix)) return title;
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return title;
  }
  return "Dashboard";
}

function initials(nome: string | null | undefined): string {
  const p = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return `${p[0]![0] ?? ""}${p[p.length - 1]![0] ?? ""}`.toUpperCase();
}

function NavIconDashboard({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  );
}

function NavIconChart({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <polyline points="2,12 5,7 8,9 11,4 14,6" />
      <line x1="2" y1="14" x2="14" y2="14" />
    </svg>
  );
}

function NavIconCalendar({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <rect x="2" y="3" width="12" height="11" rx="2" />
      <line x1="5" y1="1" x2="5" y2="5" />
      <line x1="11" y1="1" x2="11" y2="5" />
      <path d="M8 8v3M6.5 9.5H9.5" />
    </svg>
  );
}

function NavIconUsers({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <circle cx="6" cy="5" r="3" />
      <path d="M1 14c0-3 2-5 5-5" />
      <circle cx="11" cy="9.5" r="2.5" />
      <path d="M8.5 14c0-2 1.1-3 2.5-3s2.5 1 2.5 3" />
    </svg>
  );
}

function NavIconLock({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <rect x="2" y="4" width="12" height="9" rx="1.5" />
      <path d="M5 4V3a2 2 0 0 1 4 0v1" />
      <circle cx="8" cy="9" r="1.5" />
    </svg>
  );
}

function NavIconCard({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <line x1="2" y1="7" x2="14" y2="7" />
      <line x1="5.5" y1="11" x2="7" y2="11" />
    </svg>
  );
}

function NavIconTag({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <path d="M2 8V3a1 1 0 0 1 1-1h5l7 7-5 5-7-7z" />
      <circle cx="5.5" cy="5.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function NavIconCoupon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <path d="M2 8h12M2 8l3-5M2 8l3 5M14 8l-3-5M14 8l-3 5" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function NavIconReport({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <rect x="2" y="2" width="12" height="12" rx="2" />
      <polyline points="5,9 7,11 11,6" />
      <line x1="5" y1="5" x2="9" y2="5" />
    </svg>
  );
}

function NavIconSettings({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <circle cx="8" cy="8" r="2" />
      <path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.5 3.5l1 1M11.5 11.5l1 1M11.5 3.5l-1 1M4.5 11.5l-1 1" />
    </svg>
  );
}

function NavIconShield({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <path d="M8 2L3 4.5v4C3 11.5 5.5 14 8 15c2.5-1 5-3.5 5-6.5v-4L8 2Z" />
    </svg>
  );
}

function NavIconGear({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2" />
    </svg>
  );
}

function NavIconFile({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <rect x="2" y="2" width="12" height="12" rx="2" />
      <line x1="5" y1="6" x2="11" y2="6" />
      <line x1="5" y1="9" x2="9" y2="9" />
    </svg>
  );
}

function NavIconFlags({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <rect x="2" y="3" width="5" height="5" rx="1" />
      <rect x="9" y="3" width="5" height="5" rx="1" />
      <rect x="2" y="10" width="5" height="3" rx="1" />
      <rect x="9" y="10" width="5" height="3" rx="1" />
    </svg>
  );
}

function NavIconChat({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <path d="M14 2H2v8h3l1 3 1-3h7V2Z" />
      <line x1="5" y1="6" x2="11" y2="6" />
      <line x1="5" y1="9" x2="8" y2="9" />
    </svg>
  );
}

function NavIconSupport({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <path d="M13 2H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h3l2 2 2-2h3a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1Z" />
      <line x1="5" y1="6" x2="11" y2="6" />
      <line x1="5" y1="9" x2="8" y2="9" />
    </svg>
  );
}

type NavEntry = {
  to: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
  badge?: { text: string; kind: "default" | "warn" | "ok" };
};

const NAV_GROUPS: { label: string; items: NavEntry[] }[] = [
  {
    label: "Visão Geral",
    items: [
      { to: "/dashboard", label: "Dashboard", Icon: NavIconDashboard, end: true },
      { to: "/insights", label: "Insights", Icon: NavIconChart, badge: { text: "Novo", kind: "ok" } },
    ],
  },
  {
    label: "Usuários",
    items: [
      { to: "/equipes", label: "Equipes de Gestão", Icon: NavIconCalendar, badge: { text: "1", kind: "default" } },
      { to: "/clients", label: "Usuários GestMiles", Icon: NavIconUsers, badge: { text: "0", kind: "default" } },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { to: "/assinaturas", label: "Assinaturas", Icon: NavIconLock, badge: { text: "8", kind: "warn" } },
      { to: "/planos", label: "Planos & Preços", Icon: NavIconTag },
      { to: "/cupons", label: "Cupons & Promoções", Icon: NavIconCoupon },
      { to: "/relatorios", label: "Relatórios", Icon: NavIconReport },
      { to: "/monetizacao", label: "Monetização Stripe", Icon: NavIconCard },
    ],
  },
  {
    label: "Produto",
    items: [
      { to: "/feature-flags", label: "Feature Flags", Icon: NavIconFlags, badge: { text: "0 beta", kind: "warn" } },
      { to: "/comunicacoes", label: "Comunicações", Icon: NavIconChat },
      { to: "/suporte", label: "Suporte & Tickets", Icon: NavIconSupport, badge: { text: "0", kind: "warn" } },
    ],
  },
  {
    label: "Sistema",
    items: [
      { to: "/operacional", label: "Operacional", Icon: NavIconSettings },
      { to: "/seguranca", label: "Segurança", Icon: NavIconShield },
      { to: "/configuracoes", label: "Configurações", Icon: NavIconGear },
      { to: "/logs", label: "Logs", Icon: NavIconFile, badge: { text: "3", kind: "warn" } },
    ],
  },
];

export default function AdminAppLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { signOut, perfilNome, role, user } = useAdminAuth();
  const [b2cClienteBadge, setB2cClienteBadge] = useState<number | "loading" | "error">("loading");
  const [ffBetaCount, setFfBetaCount] = useState(() => countBetaFlagsInStorage());
  const [supportOpenCount, setSupportOpenCount] = useState(() =>
    loadSuporteState().tickets.filter((ticket) => ticket.status === "aberto").length,
  );
  const {
    equipesGrupoGestaoRaiz,
    selectedEquipeId,
    setSelectedEquipeId,
    equipeSelectionLocked,
    loading: eqLoading,
    error: eqError,
    equipes,
    equipeNomeEdicaoDraft,
  } = useAdminEquipe();
  const { scope } = useAccessScope();

  useEffect(() => {
    if (!user?.id) {
      setB2cClienteBadge("loading");
      return;
    }
    let cancelled = false;
    const run = () => {
      setB2cClienteBadge("loading");
      void countB2cClientesSemEquipe()
        .then((n) => {
          if (!cancelled) setB2cClienteBadge(n);
        })
        .catch(() => {
          if (!cancelled) setB2cClienteBadge("error");
        });
    };
    run();
    const onListaB2cAtualizada = () => run();
    window.addEventListener("gm:admin-b2c-clientes-updated", onListaB2cAtualizada);
    return () => {
      cancelled = true;
      window.removeEventListener("gm:admin-b2c-clientes-updated", onListaB2cAtualizada);
    };
  }, [user?.id, pathname]);

  useEffect(() => {
    const fn = () => setFfBetaCount(countBetaFlagsInStorage());
    window.addEventListener("gm-feature-flags-changed", fn);
    return () => window.removeEventListener("gm-feature-flags-changed", fn);
  }, []);

  useEffect(() => {
    const refresh = () => setSupportOpenCount(loadSuporteState().tickets.filter((ticket) => ticket.status === "aberto").length);
    window.addEventListener("gm-admin-suporte-updated", refresh);
    return () => window.removeEventListener("gm-admin-suporte-updated", refresh);
  }, []);

  const equipeDetalheId = useMemo(() => pathname.match(/^\/equipes\/([^/]+)$/)?.[1] ?? null, [pathname]);

  const pageTitle = useMemo(() => {
    if (equipeDetalheId) {
      if (equipeNomeEdicaoDraft?.equipeId === equipeDetalheId) {
        const n = equipeNomeEdicaoDraft.nome.trim();
        if (n) return n;
      }
      return equipes.find((e) => e.id === equipeDetalheId)?.nome ?? "Equipe";
    }
    return breadcrumbTitle(pathname);
  }, [pathname, equipeDetalheId, equipeNomeEdicaoDraft, equipes]);

  const nomeEquipeSelecionadaExibicao = useMemo(() => {
    if (!selectedEquipeId) return null;
    if (equipeNomeEdicaoDraft?.equipeId === selectedEquipeId) {
      const n = equipeNomeEdicaoDraft.nome.trim();
      if (n) return n;
    }
    return equipes.find((e) => e.id === selectedEquipeId)?.nome ?? selectedEquipeId;
  }, [selectedEquipeId, equipeNomeEdicaoDraft, equipes]);

  const roleLabel = role === "admin_master" || scope?.kind === "global_admin" ? "Admin Master" : "Admin";

  const filteredGroups = useMemo(() => {
    return NAV_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((item) => {
        if (item.to === "/seguranca") return canAccessSecurityDashboard(scope);
        if (item.to === "/configuracoes") return canAccessAppConfig(scope);
        return true;
      }),
    })).filter((g) => g.items.length > 0);
  }, [scope]);

  const equipeNomeLocked = equipeSelectionLocked
    ? nomeEquipeSelecionadaExibicao ?? selectedEquipeId
    : null;

  const teamSelect = equipeSelectionLocked ? (
    <div className="topbar-team-select max-w-[min(100%,280px)] cursor-default">
      <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#B56CFF]" style={{ width: 7, height: 7 }} aria-hidden />
      <span className="min-w-0 truncate text-[12.5px] font-semibold">{equipeNomeLocked ?? "—"}</span>
      <svg width="11" height="7" viewBox="0 0 11 7" fill="none" stroke="#9B9B9B" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
        <path d="M1 1L5.5 6 10 1" />
      </svg>
    </div>
  ) : (
    <Select
      value={selectedEquipeId ?? NONE}
      onValueChange={(v) => setSelectedEquipeId(v === NONE ? null : v)}
      disabled={eqLoading || equipesGrupoGestaoRaiz.length === 0}
    >
      <SelectTrigger
        className={cn(
          "topbar-team-select max-w-[min(100%,280px)] !h-9 border-[1.5px] shadow-none focus:ring-0 focus:ring-offset-0",
          "[&>svg:last-child]:hidden",
        )}
      >
        <div className="h-[7px] w-[7px] shrink-0 rounded-full bg-[#B56CFF]" aria-hidden />
        {selectedEquipeId && selectedEquipeId !== NONE && nomeEquipeSelecionadaExibicao ? (
          <span className="min-w-0 flex-1 truncate text-left text-[12.5px] font-semibold">{nomeEquipeSelecionadaExibicao}</span>
        ) : (
          <SelectValue placeholder="Equipe" />
        )}
        <svg width="11" height="7" viewBox="0 0 11 7" fill="none" stroke="#9B9B9B" strokeWidth="1.4" strokeLinecap="round" className="ml-auto shrink-0" aria-hidden>
          <path d="M1 1L5.5 6 10 1" />
        </svg>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Todas as equipes</SelectItem>
        {equipesGrupoGestaoRaiz.map((eq) => (
          <SelectItem key={eq.id} value={eq.id}>
            {eq.nome}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const sidebarTeamSelect = equipeSelectionLocked ? (
    <div className="sb-team-selector mx-3 mt-3 w-[calc(100%-24px)] cursor-default">
      <span className="sb-team-dot" />
      <span className="sb-team-name">{equipeNomeLocked ?? "—"}</span>
      <svg className="sb-team-chevron" width="12" height="8" viewBox="0 0 12 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
        <path d="M1 1.5L6 6.5L11 1.5" />
      </svg>
    </div>
  ) : (
    <Select
      value={selectedEquipeId ?? NONE}
      onValueChange={(v) => setSelectedEquipeId(v === NONE ? null : v)}
      disabled={eqLoading || equipesGrupoGestaoRaiz.length === 0}
    >
      <SelectTrigger
        className={cn(
          "sb-team-selector mx-3 mt-3 w-[calc(100%-24px)] !h-auto min-h-0 py-[10px] shadow-none focus:ring-0 [&>svg:last-child]:hidden",
        )}
      >
        <span className="sb-team-dot" />
        <span className="sb-team-name min-w-0 flex-1 truncate text-left">
          {selectedEquipeId && selectedEquipeId !== NONE && nomeEquipeSelecionadaExibicao ? (
            nomeEquipeSelecionadaExibicao
          ) : (
            <SelectValue placeholder="Todas as equipes" />
          )}
        </span>
        <svg className="sb-team-chevron h-2 w-3 shrink-0" width="12" height="8" viewBox="0 0 12 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
          <path d="M1 1.5L6 6.5L11 1.5" />
        </svg>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Todas as equipes</SelectItem>
        {equipesGrupoGestaoRaiz.map((eq) => (
          <SelectItem key={eq.id} value={eq.id}>
            {eq.nome}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="admin-master-html">
      <aside className="sidebar">
        <div className="sb-logo">
          <GestMilesLogoMark className="sb-logo-icon" />
          <div className="sb-logo-text">
            <div className="sb-logo-brand">
              Gest<span>Miles</span>
            </div>
            <div className="sb-admin-badge">⚡ Admin Master</div>
          </div>
        </div>

        {sidebarTeamSelect}

        <nav className="sb-nav" aria-label="Principal">
          {filteredGroups.map((group) => (
            <div key={group.label} className="sb-group">
              <div className="sb-group-label">{group.label}</div>
              {group.items.map((item) => {
                const Icon = item.Icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => cn("sb-item", isActive && "active")}
                  >
                    <Icon className="sb-icon" />
                    {item.label}
                    {item.badge ? (
                      <span
                        className={cn(
                          "sb-badge",
                          item.badge.kind === "warn" && "warn",
                          item.badge.kind === "ok" && "ok",
                        )}
                      >
                        {item.to === "/equipes"
                          ? String(equipesGrupoGestaoRaiz.length)
                          : item.to === "/clients"
                          ? b2cClienteBadge === "loading"
                            ? "…"
                            : b2cClienteBadge === "error"
                              ? "—"
                              : String(b2cClienteBadge)
                          : item.to === "/feature-flags"
                            ? `${ffBetaCount} beta`
                          : item.to === "/suporte"
                            ? String(supportOpenCount)
                            : item.badge.text}
                      </span>
                    ) : null}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sb-bottom">
          <div className="sb-user">
            <div className="sb-avatar">{initials(perfilNome)}</div>
            <div>
              <div className="sb-user-name">{perfilNome ?? "—"}</div>
              <div className="sb-user-role">{roleLabel}</div>
            </div>
          </div>
          <button
            type="button"
            className="sb-signout"
            onClick={() => {
              void signOut().then(() => navigate("/login", { replace: true }));
            }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
              <path d="M5 2H2.5A1.5 1.5 0 0 0 1 3.5v6A1.5 1.5 0 0 0 2.5 11H5" />
              <polyline points="9,9 12,6.5 9,4" />
              <line x1="12" y1="6.5" x2="5" y2="6.5" />
            </svg>
            Sair da conta
          </button>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div className="topbar-breadcrumb">
            <span>Admin</span>
            <svg
              className="h-3 w-3 shrink-0 text-[#9B9B9B]"
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              aria-hidden
            >
              <polyline points="4,2 8,6 4,10" />
            </svg>
            <span className="current">{pageTitle}</span>
          </div>
          <div className="topbar-right">
            {eqError ? <span className="max-w-[120px] truncate text-xs text-red-600">{eqError}</span> : null}
            {teamSelect}
            <div className="topbar-notif" role="presentation" aria-hidden>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M8 1.5a5 5 0 0 1 5 5v2.5l1.5 2H1.5L3 9V6.5a5 5 0 0 1 5-5Z" />
                <path d="M6.5 13.5a1.5 1.5 0 0 0 3 0" />
              </svg>
              <div className="notif-dot" />
            </div>
            <div className="topbar-user-pill">
              <div className="topbar-av">{initials(perfilNome)}</div>
              <span className="topbar-uname">{perfilNome ?? "—"}</span>
            </div>
          </div>
        </div>

        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
