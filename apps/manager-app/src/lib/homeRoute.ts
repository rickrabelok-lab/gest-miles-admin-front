import type { AppRole } from "@/contexts/AuthContext";

/**
 * Rota "home" por perfil — evita CS cair em `/` (carteira pessoal / UX de cliente).
 * Nota: só UX; a API/RLS continua sendo a fonte da verdade.
 */
export function homePathForRole(role: AppRole | null): string {
  if (role === "cs") return "/cs";
  if (role === "gestor") return "/gestor";
  if (role === "cliente_gestao") return "/";
  return "/";
}
