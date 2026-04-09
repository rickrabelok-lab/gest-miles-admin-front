import { supabase } from "@gest-miles/shared";
import type { Aeroporto } from "./aeroportos";

export type ViagemDashboardItem = {
  id: string;
  cliente_id: string;
  equipe_id: string | null;
  origem_iata: string;
  destino_iata: string;
  data_ida: string;
  data_volta: string;
  passageiros: number;
  cliente_nome: string;
  tipo_usuario: "clientes" | "clientes_gestao" | "outro";
  equipe_nome: string | null;
  gestor_id: string | null;
  gestor_nome: string | null;
  aeroporto_origem: Aeroporto | null;
  aeroporto_destino: Aeroporto | null;
};

export type ViagensDashboardFilters = {
  equipeId?: string | null;
  gestorId?: string | null;
  tipoUsuario?: "todos" | "clientes" | "clientes_gestao";
  periodoInicio?: string | null;
  periodoFim?: string | null;
  destino?: string | null;
};

type ViagemRow = {
  id: string;
  cliente_id: string;
  equipe_id: string | null;
  origem_iata?: string | null;
  destino_iata?: string | null;
  destino?: string | null;
  data_ida: string;
  data_volta: string;
  passageiros?: number | null;
  qtd_passageiros?: number | null;
};

type PerfilRow = {
  usuario_id: string;
  nome_completo?: string | null;
  role?: string | null;
  equipe_id?: string | null;
};
type EquipeRow = { id: string; nome?: string | null };

const AEROPORTO_COLUMNS = "id, codigo_iata, nome, cidade, pais, lat, lng";

function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string; details?: string };
  if (e.code === "42P01") return true;
  const text = `${e.message ?? ""} ${e.details ?? ""}`.toLowerCase();
  return text.includes("does not exist") || text.includes("schema cache") || text.includes("could not find the table");
}

function pickPassageiros(v: ViagemRow): number {
  return Number(v.passageiros ?? v.qtd_passageiros ?? 1) || 1;
}

export async function listViagensDashboard(filters?: ViagensDashboardFilters): Promise<ViagemDashboardItem[]> {
  let modernQ = supabase
    .from("viagens")
    .select("id, cliente_id, equipe_id, origem_iata, destino_iata, data_ida, data_volta, passageiros")
    .order("data_ida", { ascending: true });

  if (filters?.equipeId) modernQ = modernQ.eq("equipe_id", filters.equipeId);
  if (filters?.periodoInicio) modernQ = modernQ.gte("data_ida", filters.periodoInicio);
  if (filters?.periodoFim) modernQ = modernQ.lte("data_ida", filters.periodoFim);

  const modernRes = await modernQ;
  let viagens: ViagemRow[] = [];
  if (!modernRes.error) {
    viagens = ((modernRes.data ?? []) as ViagemRow[]).map((v) => ({
      ...v,
      origem_iata: String(v.origem_iata ?? "").toUpperCase(),
      destino_iata: String(v.destino_iata ?? v.destino ?? "").toUpperCase(),
    }));
  } else {
    const m = `${modernRes.error.message ?? ""}`.toLowerCase();
    const schemaMismatch = m.includes("column") && m.includes("does not exist");
    if (!schemaMismatch && !isMissingRelationError(modernRes.error)) throw modernRes.error;
    if (isMissingRelationError(modernRes.error)) return [];

    let legacyQ = supabase
      .from("viagens")
      .select("id, cliente_id, equipe_id, destino, data_ida, data_volta, qtd_passageiros")
      .order("data_ida", { ascending: true });
    if (filters?.equipeId) legacyQ = legacyQ.eq("equipe_id", filters.equipeId);
    if (filters?.periodoInicio) legacyQ = legacyQ.gte("data_ida", filters.periodoInicio);
    if (filters?.periodoFim) legacyQ = legacyQ.lte("data_ida", filters.periodoFim);

    const legacyRes = await legacyQ;
    if (legacyRes.error) {
      if (isMissingRelationError(legacyRes.error)) return [];
      throw legacyRes.error;
    }
    viagens = ((legacyRes.data ?? []) as ViagemRow[]).map((v) => ({
      ...v,
      origem_iata: String(v.origem_iata ?? "").toUpperCase(),
      destino_iata: String(v.destino_iata ?? v.destino ?? "").toUpperCase(),
      passageiros: Number(v.passageiros ?? v.qtd_passageiros ?? 1) || 1,
    }));
  }

  if (viagens.length === 0) return [];

  const clienteIds = [...new Set(viagens.map((v) => v.cliente_id).filter(Boolean))];
  const equipeIds = [...new Set(viagens.map((v) => v.equipe_id).filter((x): x is string => !!x))];
  const iatas = [...new Set(viagens.flatMap((v) => [v.origem_iata ?? "", v.destino_iata ?? ""]).filter(Boolean))];

  const [clientesRes, gestoresRes, aeroportosRes] = await Promise.all([
    clienteIds.length
      ? supabase.from("perfis").select("usuario_id, nome_completo, role, equipe_id").in("usuario_id", clienteIds)
      : Promise.resolve({ data: [], error: null }),
    equipeIds.length
      ? supabase.from("perfis").select("usuario_id, nome_completo, role, equipe_id").eq("role", "gestor").in("equipe_id", equipeIds)
      : Promise.resolve({ data: [], error: null }),
    iatas.length ? supabase.from("aeroportos").select(AEROPORTO_COLUMNS).in("codigo_iata", iatas) : Promise.resolve({ data: [], error: null }),
  ]);

  if (clientesRes.error && !isMissingRelationError(clientesRes.error)) throw clientesRes.error;
  if (gestoresRes.error && !isMissingRelationError(gestoresRes.error)) throw gestoresRes.error;
  if (aeroportosRes.error && !isMissingRelationError(aeroportosRes.error)) throw aeroportosRes.error;
  const equipesRes = equipeIds.length
    ? await supabase.from("equipes").select("id, nome").in("id", equipeIds)
    : ({ data: [], error: null } as { data: EquipeRow[]; error: null });
  if (equipesRes.error && !isMissingRelationError(equipesRes.error)) throw equipesRes.error;

  const clientes = (clientesRes.data ?? []) as PerfilRow[];
  const gestores = (gestoresRes.data ?? []) as PerfilRow[];
  const aeroportos = (aeroportosRes.data ?? []) as Aeroporto[];
  const equipes = (equipesRes.data ?? []) as EquipeRow[];

  const clienteById = new Map(clientes.map((c) => [c.usuario_id, c]));
  const gestorByEquipeId = new Map<string, PerfilRow>();
  for (const g of gestores) {
    const key = g.equipe_id ? String(g.equipe_id) : "";
    if (key && !gestorByEquipeId.has(key)) gestorByEquipeId.set(key, g);
  }
  const aeroportoByIata = new Map(aeroportos.map((a) => [a.codigo_iata.toUpperCase(), a]));
  const equipeById = new Map(equipes.map((e) => [String(e.id), e]));

  let out = viagens.map<ViagemDashboardItem>((v) => {
    const cliente = clienteById.get(v.cliente_id);
    const gestor = v.equipe_id ? gestorByEquipeId.get(v.equipe_id) : undefined;
    const tipo = String(cliente?.role ?? "");
    return {
      id: v.id,
      cliente_id: v.cliente_id,
      equipe_id: v.equipe_id ?? null,
      origem_iata: String(v.origem_iata ?? ""),
      destino_iata: String(v.destino_iata ?? ""),
      data_ida: v.data_ida,
      data_volta: v.data_volta,
      passageiros: pickPassageiros(v),
      cliente_nome: String(cliente?.nome_completo ?? "").trim() || "Cliente sem nome",
      tipo_usuario: tipo === "cliente_gestao" ? "clientes_gestao" : tipo === "cliente" ? "clientes" : "outro",
      equipe_nome: v.equipe_id ? (String(equipeById.get(v.equipe_id)?.nome ?? "").trim() || null) : null,
      gestor_id: gestor?.usuario_id ?? null,
      gestor_nome: gestor?.nome_completo ?? null,
      aeroporto_origem: aeroportoByIata.get(String(v.origem_iata ?? "").toUpperCase()) ?? null,
      aeroporto_destino: aeroportoByIata.get(String(v.destino_iata ?? "").toUpperCase()) ?? null,
    };
  });

  if (filters?.tipoUsuario && filters.tipoUsuario !== "todos") {
    out = out.filter((v) => v.tipo_usuario === filters.tipoUsuario);
  }
  if (filters?.gestorId) {
    out = out.filter((v) => v.gestor_id === filters.gestorId);
  }
  if (filters?.destino && filters.destino.trim()) {
    const qd = filters.destino.trim().toLowerCase();
    out = out.filter((v) => {
      const iata = v.destino_iata.toLowerCase();
      const nome = v.aeroporto_destino?.nome?.toLowerCase() ?? "";
      const cidade = v.aeroporto_destino?.cidade?.toLowerCase() ?? "";
      return iata.includes(qd) || nome.includes(qd) || cidade.includes(qd);
    });
  }

  return out;
}
