const API_URL = (import.meta.env.VITE_API_URL ?? "").trim();

/**
 * Em dev: pedidos a `/api/...` no mesmo host do Vite; o `vite.config` faz proxy para o Express.
 * Assim o browser não faz cross-origin (evita "Failed to fetch" por CORS).
 * Ativa com `VITE_API_USE_SAME_ORIGIN=1` em `.env.local`.
 */
const useSameOriginApi =
  import.meta.env.DEV &&
  (import.meta.env.VITE_API_USE_SAME_ORIGIN === "true" || import.meta.env.VITE_API_USE_SAME_ORIGIN === "1");

export const hasApiUrl = () => useSameOriginApi || !!API_URL;

export function getApiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (useSameOriginApi) return p;
  const base = API_URL.replace(/\/$/, "");
  if (!base) return p;
  return `${base}${p}`;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
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
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isFailedFetch = msg === "Failed to fetch" || msg.includes("NetworkError") || msg.includes("Load failed");
    const hint =
      import.meta.env.DEV && !useSameOriginApi && isFailedFetch
        ? " Em dev, tente VITE_API_USE_SAME_ORIGIN=1 no .env.local (proxy /api no Vite) ou active CORS no backend."
        : "";
    throw new Error(`Falha de rede ao contactar a API (${url}).${hint} (${msg})`);
  }
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const apiMsg =
      typeof errBody === "object" && errBody !== null && "error" in errBody
        ? String((errBody as { error?: unknown }).error ?? "").trim()
        : "";
    const base = apiMsg || res.statusText || `HTTP ${res.status}`;
    /** 502/503/504 vêm do proxy ou gateway quando o Express não responde ou a rota não existe. */
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new Error(
        `${base} (HTTP ${res.status}). O destino do proxy não devolveu uma resposta válida: confirme que o API Express está a correr, que ` +
          `VITE_API_PROXY_TARGET` +
          ` (ou VITE_API_URL) aponta para a porta certa e que existem rotas /api/stripe/admin/*.`,
      );
    }
    throw new Error(`${base} (HTTP ${res.status})`);
  }
  return res.json();
}
