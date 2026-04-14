import { listEquipes, listPerfis, type Equipe, type Perfil } from "@/lib/adminApi";

export type DashboardKpisEscopo = {
  total_users: number;
  total_clientes: number;
  total_gestores: number;
  total_cs: number;
  total_admin_equipe: number;
  total_equipes_no_escopo: number;
};

/** Contagens de perfis por equipe (para tabelas / drill-down). */
export type EquipePerfisContagem = {
  clientes: number;
  gestores: number;
  cs: number;
  admin_equipe: number;
};

function perfilRoleNorm(p: Perfil): string {
  return String(p.role ?? "")
    .trim()
    .toLowerCase();
}

function emptyEscopo(): DashboardKpisEscopo {
  return {
    total_users: 0,
    total_clientes: 0,
    total_gestores: 0,
    total_cs: 0,
    total_admin_equipe: 0,
    total_equipes_no_escopo: 0,
  };
}

/**
 * KPIs do filtro atual a partir de uma lista já carregada de perfis (evita segunda ida ao servidor).
 */
export function computeDashboardKpisEscopoFromPerfis(
  todosPerfis: Perfil[],
  equipeIds: string[],
  equipes: Equipe[],
): DashboardKpisEscopo {
  if (!equipeIds.length) return emptyEscopo();
  const set = new Set(equipeIds);
  const perfis = todosPerfis.filter((p) => p.equipe_id != null && set.has(p.equipe_id));
  const total_equipes_no_escopo = equipes.filter((e) => set.has(e.id)).length;
  const total_clientes = perfis.filter((p) => {
    const r = perfilRoleNorm(p);
    return r === "cliente" || r === "cliente_gestao";
  }).length;
  const total_gestores = perfis.filter((p) => perfilRoleNorm(p) === "gestor").length;
  const total_cs = perfis.filter((p) => perfilRoleNorm(p) === "cs").length;
  const total_admin_equipe = perfis.filter((p) => perfilRoleNorm(p) === "admin_equipe").length;
  return {
    total_users: perfis.length,
    total_clientes,
    total_gestores,
    total_cs,
    total_admin_equipe,
    total_equipes_no_escopo,
  };
}

/** Agrega clientes / gestores / cs / admin_equipe por `equipe_id`. */
export function computeEquipeRoleCountsByEquipeId(todosPerfis: Perfil[]): Record<string, EquipePerfisContagem> {
  const out: Record<string, EquipePerfisContagem> = {};
  for (const p of todosPerfis) {
    const eid = p.equipe_id;
    if (!eid) continue;
    if (!out[eid]) {
      out[eid] = { clientes: 0, gestores: 0, cs: 0, admin_equipe: 0 };
    }
    const r = perfilRoleNorm(p);
    if (r === "cliente" || r === "cliente_gestao") out[eid].clientes += 1;
    else if (r === "gestor") out[eid].gestores += 1;
    else if (r === "cs") out[eid].cs += 1;
    else if (r === "admin_equipe") out[eid].admin_equipe += 1;
  }
  return out;
}

export async function fetchDashboardKpisEscopo(equipeIds: string[]): Promise<DashboardKpisEscopo> {
  if (!equipeIds.length) return emptyEscopo();
  const [perfis, equipes] = await Promise.all([listPerfis({ equipeIds }), listEquipes()]);
  return computeDashboardKpisEscopoFromPerfis(perfis, equipeIds, equipes);
}
