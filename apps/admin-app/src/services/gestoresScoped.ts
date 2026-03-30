import { gestoresNoGrupos, listEquipeGestorLinks, listGestores, type Perfil } from "@/lib/adminApi";
import { computeClienteResumoFromPrograms, groupProgramsByCliente, type ProgramaClienteRow } from "@/lib/dashboardMetrics";
import { isMissingRelationError } from "@/lib/supabaseErrors";
import { supabase } from "@/lib/supabase";

export type GestorOverviewRow = {
  gestor_id: string;
  gestor_nome: string;
  clientes_count: number;
  economia_gerada: number;
  score_medio: number;
};

export async function fetchGestoresOverviewEscopo(equipeIds: string[]): Promise<GestorOverviewRow[]> {
  if (!equipeIds.length) return [];

  const [links, allGestores, egLinks, programasRes] = await Promise.all([
    supabase.from("cliente_gestores").select("cliente_id, gestor_id"),
    listGestores(),
    listEquipeGestorLinks(),
    supabase
      .from("programas_cliente")
      .select("cliente_id, program_id, saldo, custo_medio_milheiro, state, updated_at")
      .limit(8000),
  ]);

  if (links.error && !isMissingRelationError(links.error)) throw links.error;
  if (programasRes.error && !isMissingRelationError(programasRes.error)) throw programasRes.error;

  const linkRows = (links.data ?? []) as Array<{ cliente_id: string; gestor_id: string }>;
  const gestoresEscopo = gestoresNoGrupos(equipeIds, allGestores, egLinks);
  const gestorIds = new Set(gestoresEscopo.map((g) => g.usuario_id));

  const clientesByGestor = new Map<string, string[]>();
  for (const g of gestoresEscopo) clientesByGestor.set(g.usuario_id, []);
  for (const row of linkRows) {
    const gid = String(row.gestor_id ?? "");
    if (!gestorIds.has(gid)) continue;
    const cid = String(row.cliente_id ?? "");
    if (!cid) continue;
    clientesByGestor.get(gid)!.push(cid);
  }

  const programsByCliente = programasRes.data
    ? groupProgramsByCliente(programasRes.data as ProgramaClienteRow[])
    : new Map<string, ProgramaClienteRow[]>();

  const nomeByUser = new Map<string, string>();
  gestoresEscopo.forEach((g) => {
    nomeByUser.set(g.usuario_id, (g.nome_completo ?? "").trim() || "—");
  });

  return gestoresEscopo.map((g) => {
    const clientes = [...new Set(clientesByGestor.get(g.usuario_id) ?? [])];
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
      gestor_id: g.usuario_id,
      gestor_nome: nomeByUser.get(g.usuario_id) ?? g.usuario_id,
      clientes_count: clientes.length,
      economia_gerada: economiaSum,
      score_medio,
    };
  });
}

export async function fetchClienteIdsForGestor(gestorId: string): Promise<string[]> {
  const { data, error } = await supabase.from("cliente_gestores").select("cliente_id").eq("gestor_id", gestorId);
  if (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }
  return [...new Set((data ?? []).map((r) => String((r as { cliente_id: string }).cliente_id)))];
}

export async function fetchPerfisByIds(ids: string[]): Promise<Perfil[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase.from("perfis").select("usuario_id, nome_completo, role, equipe_id").in("usuario_id", ids);
  if (error) throw error;
  return (data ?? []) as Perfil[];
}
