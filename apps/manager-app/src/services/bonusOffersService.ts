import { apiFetch, hasApiUrl } from "./api";

export async function fetchBonusOffers(program?: string): Promise<unknown[]> {
  if (!hasApiUrl()) {
    throw new Error("API_URL não configurado. Use mock local.");
  }
  const qs = program ? `?program=${encodeURIComponent(program)}` : "";
  return apiFetch(`/api/bonus-offers${qs}`);
}
