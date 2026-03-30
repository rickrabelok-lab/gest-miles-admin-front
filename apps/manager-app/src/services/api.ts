/**
 * Cliente da API do backend.
 * Use API_URL para apontar ao backend (ex: Lovable, produção).
 * Quando API_URL não está definido, o app usa Supabase diretamente.
 */

const API_URL = import.meta.env.VITE_API_URL ?? import.meta.env.API_URL ?? "";

export const hasApiUrl = () => !!API_URL;

export function getApiUrl(path: string): string {
  const base = API_URL.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, ...init } = options;
  const url = getApiUrl(path);
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error((errBody as { error?: string })?.error ?? res.statusText);
  }
  return res.json();
}
