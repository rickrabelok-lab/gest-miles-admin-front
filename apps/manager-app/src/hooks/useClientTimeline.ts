import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";

export type TimelineEventoTipo =
  | "EMISSAO"
  | "NPS"
  | "CSAT"
  | "ALERTA"
  | "TAREFA"
  | "LOGIN"
  | "ATUALIZACAO_CONTA";

export type TimelineEventRow = {
  id: string;
  cliente_id: string;
  gestor_id: string | null;
  equipe_id: string | null;
  tipo_evento: TimelineEventoTipo;
  titulo: string;
  descricao: string;
  metadata: Record<string, unknown>;
  data_evento: string;
};

export type TimelineEventEnriched = TimelineEventRow & {
  gestorNome: string | null;
};

export type TimelineFilters = {
  tipoEvento: "all" | TimelineEventoTipo;
  gestorId: "all" | string;
  startDate: string | null; // YYYY-MM-DD
  endDate: string | null; // YYYY-MM-DD
};

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

export function useClientTimeline(clienteId: string | null, enabled: boolean, filters: TimelineFilters) {
  const queryKey = useMemo(
    () => [
      "timeline_eventos",
      clienteId,
      filters.tipoEvento,
      filters.gestorId,
      filters.startDate ?? "none",
      filters.endDate ?? "none",
    ],
    [clienteId, filters.endDate, filters.gestorId, filters.startDate, filters.tipoEvento],
  );

  return useQuery({
    queryKey,
    enabled: enabled && !!clienteId,
    queryFn: async (): Promise<TimelineEventEnriched[]> => {
      if (!clienteId) return [];

      let q = supabase
        .from("timeline_eventos")
        .select("id, cliente_id, gestor_id, equipe_id, tipo_evento, titulo, descricao, metadata, data_evento")
        .eq("cliente_id", clienteId)
        .order("data_evento", { ascending: false })
        .limit(100);

      if (filters.tipoEvento !== "all") {
        q = q.eq("tipo_evento", filters.tipoEvento);
      }

      if (filters.gestorId !== "all") {
        q = q.eq("gestor_id", filters.gestorId);
      }

      if (filters.startDate) {
        q = q.gte("data_evento", `${filters.startDate}T00:00:00.000Z`);
      }
      if (filters.endDate) {
        q = q.lte("data_evento", `${filters.endDate}T23:59:59.999Z`);
      }

      const { data: rows, error } = await q;
      if (error) throw toQueryError(error, "Não foi possível carregar o Timeline.");

      const list = (rows ?? []) as TimelineEventRow[];

      const gestorIds = [...new Set(list.map((r) => r.gestor_id).filter(Boolean) as string[])];
      if (gestorIds.length === 0) {
        return list.map((r) => ({ ...r, gestorNome: null }));
      }

      const { data: perfis, error: pErr } = await supabase
        .from("perfis")
        .select("usuario_id, nome_completo")
        .in("usuario_id", gestorIds);
      if (pErr) throw toQueryError(pErr, "Não foi possível carregar nomes de gestores.");

      const nomeById: Record<string, string> = {};
      (perfis ?? []).forEach((p: { usuario_id: string; nome_completo: string | null }) => {
        nomeById[p.usuario_id] = (p.nome_completo ?? "").trim() || "—";
      });

      return list.map((r) => ({
        ...r,
        gestorNome: r.gestor_id ? nomeById[r.gestor_id] ?? null : null,
      }));
    },
  });
}

export async function loadGestoresForCliente(clienteId: string) {
  const { data: links, error } = await supabase
    .from("cliente_gestores")
    .select("gestor_id")
    .eq("cliente_id", clienteId);

  if (error) throw toQueryError(error, "Não foi possível carregar gestores do cliente.");

  const gestorIds = [...new Set((links ?? []).map((r: { gestor_id: string }) => r.gestor_id).filter(Boolean))];
  if (gestorIds.length === 0) return [];

  const { data: perfis, error: pErr } = await supabase
    .from("perfis")
    .select("usuario_id, nome_completo")
    .in("usuario_id", gestorIds);
  if (pErr) throw toQueryError(pErr, "Não foi possível carregar nomes dos gestores.");

  const nomeById: Record<string, string> = {};
  (perfis ?? []).forEach((p: { usuario_id: string; nome_completo: string | null }) => {
    nomeById[p.usuario_id] = (p.nome_completo ?? "").trim() || "—";
  });

  return gestorIds
    .map((id) => ({
      id,
      nome: nomeById[id] ?? "—",
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

