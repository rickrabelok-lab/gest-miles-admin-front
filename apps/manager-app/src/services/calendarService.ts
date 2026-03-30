import { apiFetch, hasApiUrl } from "./api";

export type CalendarPricesParams = {
  originCode: string;
  destinationCode: string;
  mode: "money" | "points";
  month: string; // YYYY-MM
};

export async function fetchCalendarPrices(
  params: CalendarPricesParams
): Promise<Record<number, number>> {
  if (!hasApiUrl()) {
    throw new Error("API_URL não configurado. Use mock local.");
  }
  const qs = new URLSearchParams({
    origin: params.originCode,
    destination: params.destinationCode,
    mode: params.mode,
    month: params.month,
  });
  return apiFetch(`/api/calendar-prices?${qs}`);
}
