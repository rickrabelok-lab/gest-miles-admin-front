import { apiFetch, hasApiUrl } from "./api";

export async function fetchProgramasCliente(
  clientId: string,
  token: string
): Promise<unknown[]> {
  if (!hasApiUrl()) {
    throw new Error("API_URL não configurado.");
  }
  return apiFetch(`/api/programas-cliente?clientId=${encodeURIComponent(clientId)}`, {
    token,
  });
}

export async function saveProgramaCliente(
  payload: Record<string, unknown>,
  token: string
): Promise<{ ok: boolean }> {
  if (!hasApiUrl()) {
    throw new Error("API_URL não configurado.");
  }
  return apiFetch("/api/programas-cliente", {
    method: "POST",
    body: JSON.stringify(payload),
    token,
  });
}
