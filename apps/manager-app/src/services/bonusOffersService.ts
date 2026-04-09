import { apiFetch, hasApiUrl } from "./api";

export async function fetchBonusOffers(program?: string): Promise<unknown[]> {
  if (!hasApiUrl()) {
    return [];
  }
  const qs = program ? `?program=${encodeURIComponent(program)}` : "";
  return apiFetch(`/api/bonus-offers${qs}`);
}
