import { useEffect, useMemo, useState } from "react";
import { getBestPriceByDestinationForAllModes } from "@/lib/pricing";
import type { BestPriceByDestination } from "@/lib/pricing";

type UseDestinationBestPricesParams = {
  destinations: string[];
  origins: string[];
};

type BestPricesByDestination = Record<
  string,
  {
    miles: BestPriceByDestination | null;
    money: BestPriceByDestination | null;
  }
>;

export const useDestinationBestPrices = ({
  destinations,
  origins,
}: UseDestinationBestPricesParams) => {
  const [loading, setLoading] = useState(true);
  const [pricesByDestination, setPricesByDestination] = useState<BestPricesByDestination>(
    {},
  );

  const destinationKey = useMemo(
    () =>
      [...new Set(destinations.map((item) => item.trim().toUpperCase()).filter(Boolean))].join(
        "|",
      ),
    [destinations],
  );
  const originKey = useMemo(
    () => [...new Set(origins.map((item) => item.trim().toUpperCase()).filter(Boolean))].join("|"),
    [origins],
  );

  const normalizedDestinations = useMemo(
    () => (destinationKey ? destinationKey.split("|") : []),
    [destinationKey],
  );
  const normalizedOrigins = useMemo(
    () => (originKey ? originKey.split("|") : []),
    [originKey],
  );

  useEffect(() => {
    if (normalizedDestinations.length === 0 || normalizedOrigins.length === 0) {
      setLoading(false);
      setPricesByDestination({});
      return;
    }

    let cancelled = false;
    setLoading(true);

    const load = async () => {
      try {
        const result = await getBestPriceByDestinationForAllModes(
          normalizedDestinations,
          normalizedOrigins,
        );
        if (cancelled) return;

        const next: BestPricesByDestination = {};
        normalizedDestinations.forEach((destination) => {
          next[destination] = { miles: null, money: null };
        });

        result.miles.forEach((item) => {
          if (!next[item.destination]) next[item.destination] = { miles: null, money: null };
          next[item.destination].miles = item;
        });

        result.money.forEach((item) => {
          if (!next[item.destination]) next[item.destination] = { miles: null, money: null };
          next[item.destination].money = item;
        });

        setPricesByDestination(next);
      } catch {
        if (!cancelled) {
          setPricesByDestination({});
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [destinationKey, originKey]);

  return {
    loading,
    pricesByDestination,
  };
};
