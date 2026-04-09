export type ViagemStatusInput = {
  data_ida: Date | string;
  data_volta: Date | string;
};

export type StatusViagem = "planejada" | "em_andamento" | "finalizada";

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function getStatusViagem(viagem: ViagemStatusInput): StatusViagem {
  const hoje = new Date();
  const dataIda = toDate(viagem.data_ida);
  const dataVolta = toDate(viagem.data_volta);

  if (hoje < dataIda) return "planejada";
  if (hoje <= dataVolta) return "em_andamento";
  return "finalizada";
}

type ViagemDestinoInput = {
  destino_iata?: string | null;
  destino?: string | null;
  passageiros?: number | null;
  qtd_passageiros?: number | null;
};

type ViagemTimelineInput = {
  data_ida: string;
};

export function groupViagensByDestino<T extends ViagemDestinoInput>(viagens: T[]): Array<{ destino: string; clientes: number; passageiros: number }> {
  const map = new Map<string, { clientes: number; passageiros: number }>();
  for (const v of viagens) {
    const destino = (v.destino_iata || v.destino || "").trim();
    if (!destino) continue;
    const passageiros = Number(v.passageiros ?? v.qtd_passageiros ?? 1) || 1;
    const current = map.get(destino) ?? { clientes: 0, passageiros: 0 };
    current.clientes += 1;
    current.passageiros += passageiros;
    map.set(destino, current);
  }
  return [...map.entries()]
    .map(([destino, agg]) => ({ destino, clientes: agg.clientes, passageiros: agg.passageiros }))
    .sort((a, b) => b.clientes - a.clientes || b.passageiros - a.passageiros);
}

export function groupViagensTimelineByDataIda<T extends ViagemTimelineInput>(viagens: T[]): Array<{ data: string; itens: T[] }> {
  const map = new Map<string, T[]>();
  for (const viagem of viagens) {
    const key = viagem.data_ida;
    const list = map.get(key) ?? [];
    list.push(viagem);
    map.set(key, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data, itens]) => ({ data, itens }));
}
