import { useEffect, useMemo, useState } from "react";
import type { SearchMode } from "@/contexts/SearchFlightsContext";
import { monthKey } from "@/lib/price-calendar";
import { getPriceCalendarProvider } from "@/lib/price-calendar-provider";

const monthCache = new Map<string, Map<number, number>>();

type UsePriceCalendarDataParams = {
  originCode?: string;
  destinationCode?: string;
  mode: SearchMode;
  month: Date;
};

export const usePriceCalendarData = ({
  originCode,
  destinationCode,
  mode,
  month,
}: UsePriceCalendarDataParams) => {
  const [loading, setLoading] = useState(true);
  const [pricesByDay, setPricesByDay] = useState<Map<number, number>>(new Map());

  const key = useMemo(() => {
    if (!originCode || !destinationCode) return null;
    return `${originCode}-${destinationCode}-${mode}-${monthKey(month)}`;
  }, [originCode, destinationCode, mode, month]);

  useEffect(() => {
    if (!key || !originCode || !destinationCode) {
      setLoading(false);
      setPricesByDay(new Map());
      return;
    }

    const cached = monthCache.get(key);
    if (cached) {
      setPricesByDay(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    let cancelled = false;

    const load = async () => {
      try {
        const provider = getPriceCalendarProvider();
        const generated = await provider.getMonthPrices({
          originCode,
          destinationCode,
          mode,
          month,
        });
        if (cancelled) return;
        monthCache.set(key, generated);
        setPricesByDay(generated);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [key, originCode, destinationCode, mode, month]);

  return { loading, pricesByDay };
};
