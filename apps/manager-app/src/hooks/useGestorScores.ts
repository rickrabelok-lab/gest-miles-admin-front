import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";

export type GestorScoreRow = {
  id: string;
  gestor_id: string;
  equipe_id: string | null;
  score_total: number;
  score_economia: number;
  score_nps: number;
  score_csat: number;
  score_sla: number;
  data_calculo: string;
};

export type GestorScoreEnriched = GestorScoreRow & { gestorNome: string };

function toQueryError(err: unknown, fallback: string): Error {
  if (err instanceof Error) return err;
  if (
    err &&
    typeof err === "object" &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string"
  ) {
    return new Error((err as { message: string }).message);
  }
  return new Error(fallback);
}

export function useGestorScores(enabled: boolean, restrictToGestorIds: string[] | null) {
  return useQuery({
    queryKey: [
      "gestor_scores",
      restrictToGestorIds?.length ? [...restrictToGestorIds].sort().join(",") : "all",
    ],
    enabled,
    queryFn: async (): Promise<GestorScoreEnriched[]> => {
      let q = supabase
        .from("gestor_scores")
        .select(
          "id, gestor_id, equipe_id, score_total, score_economia, score_nps, score_csat, score_sla, data_calculo",
        )
        .order("data_calculo", { ascending: false });

      if (restrictToGestorIds && restrictToGestorIds.length > 0) {
        q = q.in("gestor_id", restrictToGestorIds);
      }

      const { data: rows, error } = await q;
      if (error) throw toQueryError(error, "Não foi possível carregar o ranking de gestores.");

      const list = (rows ?? []) as GestorScoreRow[];
      const gestorIds = [...new Set(list.map((r) => r.gestor_id))];
      if (gestorIds.length === 0) return [];

      const { data: perfis, error: pErr } = await supabase
        .from("perfis")
        .select("usuario_id, nome_completo")
        .in("usuario_id", gestorIds);
      if (pErr) throw toQueryError(pErr, "Não foi possível carregar nomes dos gestores.");

      const nomeById: Record<string, string> = {};
      (perfis ?? []).forEach((row: { usuario_id: string; nome_completo: string | null }) => {
        nomeById[row.usuario_id] = (row.nome_completo ?? "").trim() || "—";
      });

      return list.map((r) => ({
        ...r,
        gestorNome: nomeById[r.gestor_id] ?? "—",
      }));
    },
  });
}

export function useGestorScoresRefresh() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("gestor_scores_refresh_snapshot");
      if (error) throw toQueryError(error, "Não foi possível atualizar o ranking.");
      const n = typeof data === "number" ? data : Number(data);
      if (Number.isNaN(n)) return 0;
      return n;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["gestor_scores"] });
    },
  });
}

/** Último snapshot por gestor (lista já ordenada por data desc no fetch). */
export function latestScoreByGestor<T extends GestorScoreRow>(rows: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of rows) {
    if (!m.has(r.gestor_id)) m.set(r.gestor_id, r);
  }
  return m;
}

/** Histórico por gestor, mais recente primeiro. */
export function historyByGestor<T extends GestorScoreRow>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const arr = m.get(r.gestor_id) ?? [];
    arr.push(r);
    m.set(r.gestor_id, arr);
  }
  m.forEach((arr) => {
    arr.sort((a, b) => new Date(b.data_calculo).getTime() - new Date(a.data_calculo).getTime());
  });
  return m;
}

export function scoreBand(total: number): "green" | "yellow" | "red" {
  if (total >= 80) return "green";
  if (total >= 50) return "yellow";
  return "red";
}

const DROP_DELTA = 5;

export function detectPerformanceDrops<T extends GestorScoreRow>(history: Map<string, T[]>): T[] {
  const out: T[] = [];
  history.forEach((snapshots) => {
    if (snapshots.length < 2) return;
    const [cur, prev] = snapshots;
    if (cur.score_total < prev.score_total - DROP_DELTA) out.push(cur);
  });
  return out.sort((a, b) => b.score_total - a.score_total);
}
