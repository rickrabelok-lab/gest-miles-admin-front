import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";

export type NpsClassificacao = "detrator" | "neutro" | "promotor";

export type NpsAvaliacaoRow = {
  id: string;
  cliente_id: string;
  gestor_id: string;
  equipe_id: string | null;
  nota: number;
  classificacao: NpsClassificacao;
  comentario: string | null;
  data_avaliacao: string;
};

export type NpsAvaliacaoEnriched = NpsAvaliacaoRow & {
  clienteNome: string;
  gestorNome: string;
};

function toQueryError(err: unknown, fallback: string): Error {
  if (err instanceof Error) return err;
  if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
    return new Error((err as { message: string }).message);
  }
  return new Error(fallback);
}

/**
 * Avaliações NPS visíveis ao usuário atual (RLS: CS por gestor supervisionado, gestor próprio, admin por equipe, etc.).
 * @param restrictToGestorIds — se informado, restringe a `.in('gestor_id', …)` (carteira CS); caso contrário só RLS.
 */
export function useNpsDashboard(enabled: boolean, restrictToGestorIds: string[] | null) {
  return useQuery({
    queryKey: [
      "nps_avaliacoes_dashboard",
      restrictToGestorIds?.length ? [...restrictToGestorIds].sort().join(",") : "all",
    ],
    enabled,
    queryFn: async (): Promise<NpsAvaliacaoEnriched[]> => {
      let q = supabase
        .from("nps_avaliacoes")
        .select("id, cliente_id, gestor_id, equipe_id, nota, classificacao, comentario, data_avaliacao")
        .order("data_avaliacao", { ascending: false });

      if (restrictToGestorIds && restrictToGestorIds.length > 0) {
        q = q.in("gestor_id", restrictToGestorIds);
      }

      const { data: rows, error } = await q;
      if (error) throw toQueryError(error, "Não foi possível carregar avaliações NPS.");

      const list = (rows ?? []) as NpsAvaliacaoRow[];
      const ids = [...new Set(list.flatMap((r) => [r.cliente_id, r.gestor_id]))];
      if (ids.length === 0) return [];

      const { data: perfis, error: pErr } = await supabase
        .from("perfis")
        .select("usuario_id, nome_completo")
        .in("usuario_id", ids);
      if (pErr) throw toQueryError(pErr, "Não foi possível carregar nomes para o NPS.");

      const nomeById: Record<string, string> = {};
      (perfis ?? []).forEach((row: { usuario_id: string; nome_completo: string | null }) => {
        nomeById[row.usuario_id] = (row.nome_completo ?? "").trim() || "—";
      });

      return list.map((r) => ({
        ...r,
        clienteNome: nomeById[r.cliente_id] ?? "—",
        gestorNome: nomeById[r.gestor_id] ?? "—",
      }));
    },
  });
}

export function computeNpsStats(rows: NpsAvaliacaoRow[]) {
  const n = rows.length;
  if (n === 0) {
    return {
      npsScore: null as number | null,
      avgNota: null as number | null,
      pct: { promotor: 0, neutro: 0, detrator: 0 },
      counts: { promotor: 0, neutro: 0, detrator: 0 },
    };
  }
  const counts = { promotor: 0, neutro: 0, detrator: 0 };
  for (const r of rows) {
    if (r.classificacao === "promotor") counts.promotor++;
    else if (r.classificacao === "neutro") counts.neutro++;
    else counts.detrator++;
  }
  const pct = {
    promotor: (counts.promotor / n) * 100,
    neutro: (counts.neutro / n) * 100,
    detrator: (counts.detrator / n) * 100,
  };
  const npsScore = pct.promotor - pct.detrator;
  const avgNota = rows.reduce((s, r) => s + r.nota, 0) / n;
  return { npsScore, avgNota, pct, counts };
}

export function npsByGestor(rows: NpsAvaliacaoRow[], gestorNomeById: Map<string, string>) {
  const map = new Map<string, NpsAvaliacaoRow[]>();
  for (const r of rows) {
    const arr = map.get(r.gestor_id) ?? [];
    arr.push(r);
    map.set(r.gestor_id, arr);
  }
  return [...map.entries()].map(([gestorId, list]) => ({
    gestorId,
    gestorNome: gestorNomeById.get(gestorId) ?? "—",
    ...computeNpsStats(list),
    count: list.length,
  }));
}
