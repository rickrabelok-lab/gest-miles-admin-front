/**
 * Hierarquia (equipes, carteira gestores/CS) aplica-se à criação e atribuição de utilizadores — não ao login.
 * Login no painel: `admin`, `admin_master` ou `admin_geral` em perfis.role.
 */

export type AdminScopeKind = "global_admin" | "equipe_admin" | "admin_geral";

export type AdminScope = {
  kind: AdminScopeKind;
  equipeId: string | null;
};

/** Normaliza `perfis.role` para comparações (trim + minúsculas). */
export function normalizeAdminRole(role: string | null | undefined): string {
  return String(role ?? "")
    .trim()
    .toLowerCase();
}

/** Perfis com acesso ao painel administrativo (alinhado à BD). */
export function isAdminPanelRole(role: string | null | undefined): boolean {
  const r = normalizeAdminRole(role);
  return r === "admin" || r === "admin_master" || r === "admin_geral";
}

export function isAdminGeralRole(role: string | null | undefined): boolean {
  return normalizeAdminRole(role) === "admin_geral";
}

/** Admin master: acesso total ao painel (não usar comparação estrita com a string da BD). */
export function isAdminMasterRole(role: string | null | undefined): boolean {
  return normalizeAdminRole(role) === "admin_master";
}

export function computeAdminScope(role: string | null, equipeId: string | null): AdminScope | null {
  if (!isAdminPanelRole(role)) return null;
  const r = normalizeAdminRole(role);
  /** Admin master do painel: sempre âmbito global (RLS deve alinhar com `is_legacy_platform_admin` na BD). */
  if (r === "admin_master") return { kind: "global_admin", equipeId: null };
  /** Admin geral: painel com rotas limitadas (whitelist); não equivale a admin global da plataforma. */
  if (r === "admin_geral") return { kind: "admin_geral", equipeId: null };
  if (equipeId == null || equipeId === "") return { kind: "global_admin", equipeId: null };
  return { kind: "equipe_admin", equipeId };
}

/**
 * Rotas fora da whitelist (ex.: `/configuracoes`, `/planos`): apenas `admin_master` ou `admin` sem equipe
 * (`global_admin`). Deve ser o mesmo critério em `RequireAdmin` e na sidebar.
 */
export function hasFullPlatformRouteAccess(role: string | null | undefined, scope: AdminScope | null): boolean {
  if (!scope) return false;
  if (isAdminMasterRole(role)) return true;
  const r = normalizeAdminRole(role);
  return r === "admin" && scope.kind === "global_admin";
}

export function canManageEquipesGlobally(scope: AdminScope | null): boolean {
  return scope?.kind === "global_admin";
}

/** Ver listagem global e abrir ficha (`/equipes`, `/equipes/:id`) — inclui admin geral (edições reservadas ao admin global). */
export function canViewGlobalEquipesList(scope: AdminScope | null): boolean {
  return scope?.kind === "global_admin" || scope?.kind === "admin_geral";
}

export function canDeleteUsers(_scope: AdminScope | null): boolean {
  return true;
}

export function canSeeAuditLogs(scope: AdminScope | null): boolean {
  return (
    scope?.kind === "global_admin" || scope?.kind === "equipe_admin" || scope?.kind === "admin_geral"
  );
}

/** Histórico de login, sessões e bloqueios — apenas admin global. */
export function canAccessSecurityDashboard(scope: AdminScope | null): boolean {
  return scope?.kind === "global_admin";
}

/** Configuração global da app — apenas admin global edita no painel. */
export function canAccessAppConfig(scope: AdminScope | null): boolean {
  return scope?.kind === "global_admin";
}
