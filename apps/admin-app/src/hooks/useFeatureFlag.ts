import { useSyncExternalStore } from "react";

import { isFeatureGloballyEnabled, loadFeatureFlagsSnapshot } from "@/services/adminFeatureFlagsStore";

function subscribe(onChanged: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => onChanged();
  window.addEventListener("gm-feature-flags-changed", handler);
  return () => window.removeEventListener("gm-feature-flags-changed", handler);
}

/**
 * Consulta se uma feature está habilitada no snapshot global (admin localStorage).
 * Em produção, o app gestor deve alinhar com override de equipe + plano; esta versão cobre o painel admin e preview.
 */
export function useFeatureFlag(key: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isFeatureGloballyEnabled(key),
    () => false,
  );
}

/** Para leituras fora de React (ex.: guards). */
export function getFeatureFlagSnapshot() {
  return loadFeatureFlagsSnapshot();
}
