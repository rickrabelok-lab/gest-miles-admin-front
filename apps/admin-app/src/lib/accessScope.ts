/**
 * Hierarquia (equipes, carteira gestores/CS) aplica-se à criação e atribuição de utilizadores — não ao login.
 * Login no painel: apenas `role === 'admin'`.
 */

export type AdminScopeKind = "global_admin" | "equipe_admin";

export type AdminScope = {
  kind: AdminScopeKind;
  equipeId: string | null;
};

export function computeAdminScope(role: string | null, equipeId: string | null): AdminScope | null {
  if (role !== "admin") return null;
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
