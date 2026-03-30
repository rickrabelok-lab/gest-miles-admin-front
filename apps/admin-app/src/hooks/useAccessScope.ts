import { useMemo } from "react";

import { useAdminAuth } from "@/context/AdminAuthContext";
import { computeAdminScope, type AdminScope } from "@/lib/accessScope";

export function useAccessScope(): {
  scope: AdminScope | null;
  role: string | null;
  equipeId: string | null;
  roleLoading: boolean;
} {
  const { role, equipeId, roleLoading } = useAdminAuth();
  const scope = useMemo<AdminScope | null>(() => {
    if (roleLoading) return null;
    return computeAdminScope(role, equipeId);
  }, [roleLoading, role, equipeId]);
  return { scope, role, equipeId, roleLoading };
}
