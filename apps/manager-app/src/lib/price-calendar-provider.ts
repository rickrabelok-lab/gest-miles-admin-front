import type { SearchMode } from "@/contexts/SearchFlightsContext";
import { monthKey, generateEstimatedMonthPrices } from "@/lib/price-calendar";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { hasApiUrl } from "@/services/api";
import { fetchCalendarPrices } from "@/services/calendarService";

export type PriceCalendarQuery = {
  originCode: string;
  destinationCode: string;
  mode: SearchMode;
  month: Date;
};

export type PriceCalendarProvider = {
  getMonthPrices: (query: PriceCalendarQuery) => Promise<Map<number, number>>;
};

function recordToMap(rec: Record<number, number>): Map<number, number> {
  const m = new Map<number, number>();
  for (const [k, v] of Object.entries(rec)) {
    const day = Number(k);
    const num = Number(v);
    if (Number.isFinite(day) && Number.isFinite(num)) m.set(day, num);
  }
  return m;
}

class DefaultPriceCalendarProvider implements PriceCalendarProvider {
  async getMonthPrices(query: PriceCalendarQuery): Promise<Map<number, number>> {
    const mode = query.mode === "points" ? "points" : "money";
    const monthStr = monthKey(query.month);

    if (hasApiUrl()) {
      const rec = await fetchCalendarPrices({
        originCode: query.originCode,
        destinationCode: query.destinationCode,
        mode,
        month: monthStr,
      });
      if (rec && Object.keys(rec).length > 0) {
        return recordToMap(rec);
      }
    }

    if (isSupabaseConfigured) {
      const { data } = await supabase
        .from("calendar_prices")
        .select("prices")
        .eq("origin_code", query.originCode)
        .eq("destination_code", query.destinationCode)
        .eq("mode", mode)
        .eq("year_month", monthStr)
        .maybeSingle();

      const prices = data?.prices as Record<string, number> | undefined;
      if (prices && typeof prices === "object" && !Array.isArray(prices)) {
        const m = new Map<number, number>();
        for (const [k, v] of Object.entries(prices)) {
          const day = Number(k);
          const num = Number(v);
          if (Number.isFinite(day) && Number.isFinite(num)) m.set(day, num);
        }
        if (m.size > 0) return m;
      }
    }

    return generateEstimatedMonthPrices({
      originCode: query.originCode,
      destinationCode: query.destinationCode,
      mode: query.mode,
      month: query.month,
    });
  }
}

let activeProvider: PriceCalendarProvider = new DefaultPriceCalendarProvider();

export const setPriceCalendarProvider = (provider: PriceCalendarProvider) => {
  activeProvider = provider;
};

export const getPriceCalendarProvider = () => activeProvider;
