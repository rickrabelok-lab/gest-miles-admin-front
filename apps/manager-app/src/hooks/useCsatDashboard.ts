import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";

export type CsatAvaliacaoRow = {
  id: string;
  cliente_id: string;
  gestor_id: string;
  equipe_id: string | null;
  nota: number;
  comentario: string | null;
  mes_referencia: string;
  data_avaliacao: string;
};

export type CsatAvaliacaoEnriched = CsatAvaliacaoRow & {
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

export function useCsatDashboard(enabled: boolean, restrictToGestorIds: string[] | null) {
  return useQuery({
    queryKey: [
      "csat_avaliacoes_dashboard",
      restrictToGestorIds?.length ? [...restrictToGestorIds].sort().join(",") : "all",
    ],
    enabled,
    queryFn: async (): Promise<CsatAvaliacaoEnriched[]> => {
      let q = supabase
        .from("csat_avaliacoes")
        .select("id, cliente_id, gestor_id, equipe_id, nota, comentario, mes_referencia, data_avaliacao")
        .order("mes_referencia", { ascending: false })
        .order("data_avaliacao", { ascending: false });

      if (restrictToGestorIds && restrictToGestorIds.length > 0) {
        q = q.in("gestor_id", restrictToGestorIds);
      }

      const { data: rows, error } = await q;
      if (error) throw toQueryError(error, "Não foi possível carregar avaliações CSAT.");

      const list = (rows ?? []) as CsatAvaliacaoRow[];
      const ids = [...new Set(list.flatMap((r) => [r.cliente_id, r.gestor_id]))];
      if (ids.length === 0) return [];

      const { data: perfis, error: pErr } = await supabase
        .from("perfis")
        .select("usuario_id, nome_completo")
        .in("usuario_id", ids);
      if (pErr) throw toQueryError(pErr, "Não foi possível carregar nomes para o CSAT.");

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

export function csatAvg(rows: Pick<CsatAvaliacaoRow, "nota">[]) {
  if (rows.length === 0) return null;
  return rows.reduce((s, r) => s + r.nota, 0) / rows.length;
}

export function csatByGestor(rows: CsatAvaliacaoRow[], gestorNomeById: Map<string, string>) {
  const map = new Map<string, CsatAvaliacaoRow[]>();
  for (const r of rows) {
    const arr = map.get(r.gestor_id) ?? [];
    arr.push(r);
    map.set(r.gestor_id, arr);
  }
  return [...map.entries()].map(([gestorId, list]) => ({
    gestorId,
    gestorNome: gestorNomeById.get(gestorId) ?? "—",
    avg: csatAvg(list),
    count: list.length,
  }));
}

/** Média CSAT por mês (YYYY-MM-01) para gráfico */
export function csatEvolutionSeries(rows: CsatAvaliacaoRow[]) {
  const byMes = new Map<string, number[]>();
  for (const r of rows) {
    const key = r.mes_referencia.slice(0, 10);
    const arr = byMes.get(key) ?? [];
    arr.push(r.nota);
    byMes.set(key, arr);
  }
  return [...byMes.entries()]
    .map(([mes, notas]) => ({
      mes,
      mesLabel: formatMesRef(mes),
      avg: notas.reduce((a, b) => a + b, 0) / notas.length,
      n: notas.length,
    }))
    .sort((a, b) => a.mes.localeCompare(b.mes));
}

export function formatMesRef(ymd: string) {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}

export type CsatDropHighlight = {
  clienteId: string;
  clienteNome: string;
  gestorId: string;
  gestorNome: string;
  mesAnterior: string;
  mesAtual: string;
  notaAnterior: number;
  notaAtual: number;
};

/**
 * Queda relevante: queda ≥2 pontos, ou passou de ≥4 para ≤2.
 */
export function detectCsatDrops(rows: CsatAvaliacaoEnriched[]): CsatDropHighlight[] {
  const byPair = new Map<string, CsatAvaliacaoEnriched[]>();
  for (const r of rows) {
    const k = `${r.cliente_id}:${r.gestor_id}`;
    const arr = byPair.get(k) ?? [];
    arr.push(r);
    byPair.set(k, arr);
  }

  const out: CsatDropHighlight[] = [];
  for (const [, list] of byPair) {
    const sorted = [...list].sort((a, b) => a.mes_referencia.localeCompare(b.mes_referencia));
    if (sorted.length < 2) continue;
    const prev = sorted[sorted.length - 2];
    const last = sorted[sorted.length - 1];
    const drop = prev.nota - last.nota;
    const significant = drop >= 2 || (prev.nota >= 4 && last.nota <= 2);
    if (!significant) continue;
    out.push({
      clienteId: last.cliente_id,
      clienteNome: last.clienteNome,
      gestorId: last.gestor_id,
      gestorNome: last.gestorNome,
      mesAnterior: formatMesRef(prev.mes_referencia),
      mesAtual: formatMesRef(last.mes_referencia),
      notaAnterior: prev.nota,
      notaAtual: last.nota,
    });
  }
  return out;
}
