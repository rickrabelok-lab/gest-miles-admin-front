import { listEquipes, listPerfis } from "@/lib/adminApi";

export type DashboardKpisEscopo = {
  total_users: number;
  total_clientes: number;
  total_gestores: number;
  total_equipes_no_escopo: number;
};

export async function fetchDashboardKpisEscopo(equipeIds: string[]): Promise<DashboardKpisEscopo> {
  if (!equipeIds.length) {
    return { total_users: 0, total_clientes: 0, total_gestores: 0, total_equipes_no_escopo: 0 };
  }
  const [perfis, equipes] = await Promise.all([listPerfis({ equipeIds }), listEquipes()]);
  const set = new Set(equipeIds);
  const total_equipes_no_escopo = equipes.filter((e) => set.has(e.id)).length;
  const total_clientes = perfis.filter((p) => p.role === "cliente" || p.role === "cliente_gestao").length;
  const total_gestores = perfis.filter((p) => p.role === "gestor").length;
  return {
    total_users: perfis.length,
    total_clientes,
    total_gestores,
    total_equipes_no_escopo,
  };
}
