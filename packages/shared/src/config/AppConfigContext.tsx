import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { DEFAULT_APP_CONFIG } from "./appConfigDefaults";

export type AppConfigContextValue = {
  /** Valores finais (BD sobrepõe estes defaults). */
  config: Record<string, unknown>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  get: (chave: string) => unknown;
  getString: (chave: string, fallback?: string) => string;
  versionOf: (chave: string) => number | undefined;
};

const Ctx = createContext<AppConfigContextValue | null>(null);

type Row = { chave: string; valor: unknown; versao: number };

function buildMerged(rows: Map<string, Row>): { config: Record<string, unknown>; versions: Map<string, number> } {
  const config: Record<string, unknown> = { ...DEFAULT_APP_CONFIG };
  const versions = new Map<string, number>();
  for (const [k, { valor, versao }] of rows) {
    config[k] = valor;
    versions.set(k, versao);
  }
  return { config, versions };
}

export function AppConfigProvider({ client, children }: { client: SupabaseClient; children: ReactNode }) {
  const [rowMap, setRowMap] = useState<Map<string, Row>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: qErr } = await client.from("configuracoes").select("chave, valor, versao");
      if (qErr) throw qErr;
      const m = new Map<string, Row>();
      for (const r of data ?? []) {
        const row = r as Row;
        m.set(row.chave, { chave: row.chave, valor: row.valor, versao: Number(row.versao) || 1 });
      }
      setRowMap(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRowMap(new Map());
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const channel = client
      .channel("gest-miles-config-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "configuracoes" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const oldRow = payload.old as { chave?: string } | null;
            const ch = oldRow?.chave;
            if (ch) {
              setRowMap((prev) => {
                const next = new Map(prev);
                next.delete(ch);
                return next;
              });
            }
            return;
          }
          const n = payload.new as { chave?: string; valor?: unknown; versao?: number } | null;
          if (n?.chave != null) {
            setRowMap((prev) => {
              const next = new Map(prev);
              next.set(n.chave!, {
                chave: n.chave!,
                valor: n.valor,
                versao: Number(n.versao) || 1,
              });
              return next;
            });
          }
        },
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [client]);

  const { config, versions } = useMemo(() => buildMerged(rowMap), [rowMap]);

  const value = useMemo<AppConfigContextValue>(() => {
    const getString = (chave: string, fallback = "") => {
      const v = config[chave];
      if (v == null) return fallback;
      if (typeof v === "string") return v;
      if (typeof v === "number" || typeof v === "boolean") return String(v);
      try {
        return JSON.stringify(v);
      } catch {
        return fallback;
      }
    };
    return {
      config,
      loading,
      error,
      refresh,
      get: (chave) => config[chave],
      getString,
      versionOf: (chave) => versions.get(chave),
    };
  }, [config, versions, loading, error, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppConfig(): AppConfigContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppConfig deve ser usado dentro de AppConfigProvider");
  return v;
}

/** Para componentes opcionais (ex.: bibliotecas partilhadas) quando o provider ainda não existe. */
export function useOptionalAppConfig(): AppConfigContextValue | null {
  return useContext(Ctx);
}
