import { apiFetch, hasApiUrl } from "./api";

export async function fetchGestorClientes(token: string): Promise<string[]> {
  if (!hasApiUrl()) {
    throw new Error("API_URL não configurado.");
  }
  return apiFetch("/api/gestor/clientes", { token });
}

export async function vincularCliente(
  clienteId: string,
  token: string
): Promise<{ ok: boolean }> {
  if (!hasApiUrl()) {
    throw new Error("API_URL não configurado.");
  }
  return apiFetch("/api/gestor/vincular", {
    method: "POST",
    body: JSON.stringify({ clienteId: clienteId.trim() }),
    token,
  });
}

export async function desvincularCliente(
  clienteId: string,
  token: string
): Promise<{ deleted: boolean }> {
  if (!hasApiUrl()) {
    throw new Error("API_URL não configurado.");
  }
  return apiFetch(`/api/gestor/desvincular/${encodeURIComponent(clienteId)}`, {
    method: "DELETE",
    token,
  });
}

export async function fetchGestorPerfis(
  ids: string[],
  token: string
): Promise<unknown[]> {
  if (!hasApiUrl() || ids.length === 0) return [];
  return apiFetch(`/api/gestor/perfis?ids=${ids.join(",")}`, { token });
}

export async function fetchGestorProgramas(
  ids: string[],
  token: string
): Promise<unknown[]> {
  if (!hasApiUrl() || ids.length === 0) return [];
  return apiFetch(`/api/gestor/programas?ids=${ids.join(",")}`, { token });
}

export async function fetchGestorDemandas(
  ids: string[],
  token: string
): Promise<unknown[]> {
  if (!hasApiUrl() || ids.length === 0) return [];
  return apiFetch(`/api/gestor/demandas?ids=${ids.join(",")}`, { token });
}
