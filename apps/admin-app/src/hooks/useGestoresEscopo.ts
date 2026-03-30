import { useCallback, useEffect, useState } from "react";

import { formatSupabaseError } from "@/lib/adminApi";
import { fetchGestoresOverviewEscopo, type GestorOverviewRow } from "@/services/gestoresScoped";

export function useGestoresEscopo(equipeIdsFiltro: string[]) {
  const [rows, setRows] = useState<GestorOverviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!equipeIdsFiltro.length) {
      setRows([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchGestoresOverviewEscopo(equipeIdsFiltro));
    } catch (e) {
      setError(formatSupabaseError(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [equipeIdsFiltro.join(",")]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { rows, loading, error, refetch };
}
