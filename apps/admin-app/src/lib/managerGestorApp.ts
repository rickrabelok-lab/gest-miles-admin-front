/**
 * URL base do app Gestor Miles (Vite do `gest-miles-manager-front`), para deep links
 * desde o painel admin (ex.: abrir carteira do cliente como no manager).
 */
export function getManagerGestorAppBaseUrl(): string | null {
  const raw = (import.meta.env.VITE_MANAGER_APP_URL as string | undefined)?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

export function buildManagerGestorUrl(pathWithLeadingSlash: string): string | null {
  const base = getManagerGestorAppBaseUrl();
  if (!base) return null;
  const path = pathWithLeadingSlash.startsWith("/") ? pathWithLeadingSlash : `/${pathWithLeadingSlash}`;
  return `${base}${path}`;
}

export function openManagerGestorInNewTab(pathWithLeadingSlash: string): boolean {
  const url = buildManagerGestorUrl(pathWithLeadingSlash);
  if (!url) return false;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}
