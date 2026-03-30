import { useCallback, useEffect, useState } from "react";
import { getActiveBonusOffers } from "@/lib/bonus-offers/service";
import type { BonusOffer, LoyaltyProgram } from "@/lib/bonus-offers/types";

export const useBonusOffers = (program?: LoyaltyProgram) => {
  const [offers, setOffers] = useState<BonusOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await getActiveBonusOffers(program);
      setOffers(result);
    } catch {
      setError("Não foi possível carregar as ofertas no momento.");
      setOffers([]);
    } finally {
      setLoading(false);
    }
  }, [program]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    getActiveBonusOffers(program)
      .then((result) => {
        if (!mounted) return;
        setOffers(result);
      })
      .catch(() => {
        if (!mounted) return;
        setError("Não foi possível carregar as ofertas no momento.");
        setOffers([]);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [program]);

  return {
    offers,
    loading,
    error,
    retry: load,
  };
};
