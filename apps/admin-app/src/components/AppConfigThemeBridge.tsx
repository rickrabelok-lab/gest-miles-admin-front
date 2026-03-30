import { useAppConfig } from "@gest-miles/shared";
import { useEffect } from "react";

/** Aplica cores dinâmicas da config global como variáveis CSS (consumo opcional no CSS). */
export function AppConfigThemeBridge() {
  const { config } = useAppConfig();

  useEffect(() => {
    const p = typeof config["sistema.cor_primaria"] === "string" ? config["sistema.cor_primaria"] : "#8b5cf6";
    const s = typeof config["sistema.cor_secundaria"] === "string" ? config["sistema.cor_secundaria"] : "#06b6d4";
    const a = typeof config["sistema.cor_accent"] === "string" ? config["sistema.cor_accent"] : "#22c55e";
    const root = document.documentElement;
    root.style.setProperty("--app-primary", p);
    root.style.setProperty("--app-secondary", s);
    root.style.setProperty("--app-accent", a);
  }, [config]);

  return null;
}
