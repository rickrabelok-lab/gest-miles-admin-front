import { useCallback, useEffect, useState } from "react";

import {
  computeClienteResumoFromPrograms,
  groupProgramsByCliente,
  type ProgramaClienteRow,
} from "@/lib/dashboardMetrics";
import { isMissingRelationError } from "@/lib/supabaseErrors";
import { supabase } from "@/lib/supabase";

function pickString(row: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export type UserPerEquipe = { equipe_id: string; equipe_nome: string; count: number };

export type ClientePerGestor = { gestor_id: string; gestor_nome: string; count: number };

export type GestorPerformance = {
  gestor_id: string;
  gestor_nome: string;
  clientes_count: number;
  economia_gerada: number;
  score_medio: number;
};

export type SubscriptionPoint = { month: string; count: number };

export type AdminDashboardData = {
  total_users: number;
  total_equipes: number;
  total_clientes: number;
  total_gestores: number;
  active_subscriptions: number;
  expired_subscriptions: number;
  expiring_soon_subscriptions: number;
  users_per_equipe: UserPerEquipe[];
  clientes_per_gestor: ClientePerGestor[];
  gestor_performance: GestorPerformance[];
  subscriptions_over_time: SubscriptionPoint[];
  subscriptions_table_available: boolean;
  programas_available: boolean;
};

const emptyData: AdminDashboardData = {
  total_users: 0,
  total_equipes: 0,
  total_clientes: 0,
  total_gestores: 0,
  active_subscriptions: 0,
  expired_subscriptions: 0,
  expiring_soon_subscriptions: 0,
  users_per_equipe: [],
  clientes_per_gestor: [],
  gestor_performance: [],
  subscriptions_over_time: [],
  subscriptions_table_available: false,
  programas_available: false,
};

async function loadDashboard(): Promise<{ data: AdminDashboardData; error: string | null }> {
  const [perfisRes, equipesRes, linksRes, programasRes, subsRes] = await Promise.all([
    supabase.from("perfis").select("usuario_id, nome_completo, role, equipe_id"),
    supabase.from("equipes").select("id, nome"),
    supabase.from("cliente_gestores").select("cliente_id, gestor_id"),
    supabase
      .from("programas_cliente")
      .select("cliente_id, program_id, saldo, custo_medio_milheiro, state, updated_at")
      .limit(8000),
    supabase.from("subscriptions").select("*").limit(5000),
  ]);

  if (perfisRes.error) {
    return { data: emptyData, error: perfisRes.error.message };
  }
  if (equipesRes.error) {
    return { data: emptyData, error: equipesRes.error.message };
  }

  const perfis = (perfisRes.data ?? []) as Array<{
    usuario_id: string;
    nome_completo: string | null;
    role: string;
    equipe_id: string | null;
  }>;
  const equipes = (equipesRes.data ?? []) as Array<{ id: string; nome: string }>;
  const equipeNome = new Map(equipes.map((e) => [e.id, e.nome]));

  const total_users = perfis.length;
  const total_clientes = perfis.filter((p) => p.role === "cliente" || p.role === "cliente_gestao").length;
  const total_gestores = perfis.filter((p) => p.role === "gestor").length;
  const total_equipes = equipes.length;

  const nomeByUser = new Map(perfis.map((p) => [p.usuario_id, (p.nome_completo ?? "").trim() || "—"]));

  const byEquipe = new Map<string, number>();
  for (const p of perfis) {
    const key = p.equipe_id ?? "__none__";
    byEquipe.set(key, (byEquipe.get(key) ?? 0) + 1);
  }
  const users_per_equipe: UserPerEquipe[] = [...byEquipe.entries()]
    .map(([equipe_id, count]) => ({
      equipe_id,
      equipe_nome: equipe_id === "__none__" ? "Sem equipe" : (equipeNome.get(equipe_id) ?? equipe_id),
      count,
    }))
    .sort((a, b) => b.count - a.count);

  let clientes_per_gestor: ClientePerGestor[] = [];
  if (!linksRes.error && linksRes.data) {
    const rows = linksRes.data as Array<{ cliente_id: string; gestor_id: string }>;
    const byGestor = new Map<string, number>();
    for (const r of rows) {
      const g = String(r.gestor_id ?? "");
      if (!g) continue;
      byGestor.set(g, (byGestor.get(g) ?? 0) + 1);
    }
    clientes_per_gestor = [...byGestor.entries()]
      .map(([gestor_id, count]) => ({
        gestor_id,
        gestor_nome: nomeByUser.get(gestor_id) ?? gestor_id,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  } else if (linksRes.error && !isMissingRelationError(linksRes.error)) {
    return { data: emptyData, error: linksRes.error.message };
  }

  let programas_available = false;
  let programsByCliente = new Map<string, ProgramaClienteRow[]>();
  if (!programasRes.error && programasRes.data) {
    programas_available = true;
    const pr = (programasRes.data ?? []) as ProgramaClienteRow[];
    programsByCliente = groupProgramsByCliente(pr);
  } else if (programasRes.error && !isMissingRelationError(programasRes.error)) {
    return { data: emptyData, error: programasRes.error.message };
  }

  const gestorIds = perfis.filter((p) => p.role === "gestor").map((p) => p.usuario_id);
  const links = (linksRes.data ?? []) as Array<{ cliente_id: string; gestor_id: string }>;
  const clientesByGestor = new Map<string, string[]>();
  for (const g of gestorIds) clientesByGestor.set(g, []);
  for (const row of links) {
    const gid = String(row.gestor_id ?? "");
    const cid = String(row.cliente_id ?? "");
    if (!clientesByGestor.has(gid)) continue;
    clientesByGestor.get(gid)!.push(cid);
  }

  const gestor_performance: GestorPerformance[] = gestorIds.map((gestor_id) => {
    const clientes = [...new Set(clientesByGestor.get(gestor_id) ?? [])];
    let economiaSum = 0;
    let scoreSum = 0;
    let scoreN = 0;
    for (const cid of clientes) {
      const progRows = programsByCliente.get(cid) ?? [];
      if (!progRows.length) continue;
      const { economiaTotal, scoreEstrategico } = computeClienteResumoFromPrograms(progRows);
      economiaSum += economiaTotal;
      scoreSum += scoreEstrategico;
      scoreN += 1;
    }
    const score_medio = scoreN > 0 ? Math.round((scoreSum / scoreN) * 10) / 10 : 0;
    return {
      gestor_id,
      gestor_nome: nomeByUser.get(gestor_id) ?? gestor_id,
      clientes_count: clientes.length,
      economia_gerada: economiaSum,
      score_medio,
    };
  });
  gestor_performance.sort((a, b) => b.economia_gerada - a.economia_gerada);

  let active_subscriptions = 0;
  let expired_subscriptions = 0;
  let expiring_soon_subscriptions = 0;
  const subscriptions_over_timeMap = new Map<string, number>();
  let subscriptions_table_available = false;

  const now = new Date();
  const soon = new Date(now);
  soon.setDate(soon.getDate() + 30);

  if (!subsRes.error && subsRes.data) {
    subscriptions_table_available = true;
    const subRows = subsRes.data as Record<string, unknown>[];
    for (const raw of subRows) {
      const status = (pickString(raw, ["status", "estado", "subscription_status"]) ?? "").toLowerCase();
      const end =
        parseDate(pickString(raw, ["expires_at", "end_at", "current_period_end", "valid_until", "data_fim"])) ??
        parseDate(pickString(raw, ["canceled_at", "cancelled_at"]));
      const created =
        parseDate(pickString(raw, ["created_at", "started_at", "data_inicio"])) ?? parseDate(pickString(raw, ["inserted_at"]));

      if (created) {
        const mk = monthKey(created);
        subscriptions_over_timeMap.set(mk, (subscriptions_over_timeMap.get(mk) ?? 0) + 1);
      }

      const activeLike =
        status.includes("active") ||
        status.includes("ativa") ||
        status === "paid" ||
        status === "trialing" ||
        status === "trial";
      const expiredLike = status.includes("expir") || status.includes("cancel") || status === "canceled" || status === "ended";

      if (end && end < now) {
        expired_subscriptions += 1;
      } else if (activeLike || (!status && (!end || end >= now))) {
        active_subscriptions += 1;
        if (end && end <= soon && end >= now) {
          expiring_soon_subscriptions += 1;
        }
      } else if (expiredLike) {
        expired_subscriptions += 1;
      } else if (end && end >= now) {
        active_subscriptions += 1;
        if (end <= soon) expiring_soon_subscriptions += 1;
      }
    }
  } else if (subsRes.error && !isMissingRelationError(subsRes.error)) {
    return { data: emptyData, error: subsRes.error.message };
  }

  const subscriptions_over_time: SubscriptionPoint[] = [...subscriptions_over_timeMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));

  return {
    data: {
      total_users,
      total_equipes,
      total_clientes,
      total_gestores,
      active_subscriptions,
      expired_subscriptions,
      expiring_soon_subscriptions,
      users_per_equipe,
      clientes_per_gestor,
      gestor_performance,
      subscriptions_over_time,
      subscriptions_table_available,
      programas_available,
    },
    error: null,
  };
}

export function useAdminDashboard() {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: next, error: err } = await loadDashboard();
      setData(next);
      setError(err);
    } catch (e) {
      setData(emptyData);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return {
    ...emptyData,
    ...(data ?? {}),
    loading,
    error,
    refetch,
  };
}
