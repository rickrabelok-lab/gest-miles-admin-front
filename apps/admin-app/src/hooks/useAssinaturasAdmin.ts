import { useCallback, useEffect, useState } from "react";

import { formatSupabaseError } from "@/lib/adminApi";
import { extendSubscriptionByDays, listSubscriptionsAdmin, type SubscriptionView } from "@/services/subscriptionsAdmin";

export function useAssinaturasAdmin() {
  const [rows, setRows] = useState<SubscriptionView[]>([]);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { rows: r, available: a } = await listSubscriptionsAdmin();
      setRows(r);
      setAvailable(a);
    } catch (e) {
      setError(formatSupabaseError(e));
      setRows([]);
      setAvailable(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const extend30 = useCallback(
    async (id: string) => {
      await extendSubscriptionByDays(id, 30);
      await refetch();
    },
    [refetch],
  );

  return { rows, available, loading, error, refetch, extend30 };
}
