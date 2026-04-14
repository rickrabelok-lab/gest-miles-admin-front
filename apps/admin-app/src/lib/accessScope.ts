/**
 * Hierarquia (equipes, carteira gestores/CS) aplica-se à criação e atribuição de utilizadores — não ao login.
 * Login no painel: `admin` ou `admin_master` em perfis.role.
 */

export type AdminScopeKind = "global_admin" | "equipe_admin";

export type AdminScope = {
  kind: AdminScopeKind;
  equipeId: string | null;
};

/** Perfis com acesso ao painel administrativo (alinhado à BD: admin global ou admin master). */
export function isAdminPanelRole(role: string | null | undefined): boolean {
  const r = String(role ?? "")
    .trim()
    .toLowerCase();
  return r === "admin" || r === "admin_master";
}

export function computeAdminScope(role: string | null, equipeId: string | null): AdminScope | null {
  if (!isAdminPanelRole(role)) return null;
  const r = String(role ?? "")
    .trim()
    .toLowerCase();
  /** Admin master do painel: sempre âmbito global (RLS deve alinhar com `is_legacy_platform_admin` na BD). */
  if (r === "admin_master") return { kind: "global_admin", equipeId: null };
  if (equipeId == null || equipeId === "") return { kind: "global_admin", equipeId: null };
  return { kind: "equipe_admin", equipeId };
}

export function canManageEquipesGlobally(scope: AdminScope | null): boolean {
  return scope?.kind === "global_admin";
}

export function canDeleteUsers(_scope: AdminScope | null): boolean {
  return true;
}

export function canSeeAuditLogs(scope: AdminScope | null): boolean {
  return scope?.kind === "global_admin" || scope?.kind === "equipe_admin";
}

/** Histórico de login, sessões e bloqueios — apenas admin global. */
export function canAccessSecurityDashboard(scope: AdminScope | null): boolean {
  return scope?.kind === "global_admin";
}

/** Configuração global da app — apenas admin global edita no painel. */
export function canAccessAppConfig(scope: AdminScope | null): boolean {
  return scope?.kind === "global_admin";
}
