/** Agrega `programas_cliente` por cliente (mesma lógica de métricas do gestor). */

export type ProgramaClienteRow = {
  cliente_id: string;
  program_id?: string | null;
  saldo?: number | null;
  custo_medio_milheiro?: number | null;
  state?: unknown;
  updated_at?: string | null;
};

type StateShape = {
  lotes?: Array<{ validadeLote?: string; quantidade?: number }>;
  movimentos?: Array<{
    tipo?: string;
    economiaReal?: number;
    data?: string;
    milhas?: number;
  }>;
};

function readState(row: ProgramaClienteRow): StateShape {
  return (row.state ?? {}) as StateShape;
}

export function computeClienteResumoFromPrograms(rows: ProgramaClienteRow[]): {
  economiaTotal: number;
  scoreEstrategico: number;
} {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let milhas = 0;
  let economiaSoma = 0;
  let roiSoma = 0;
  let roiCount = 0;
  let melhorMilheiroVal: number | null = null;
  let pontosVencendo90d = 0;
  const milhasPorPrograma = new Map<string, number>();
  let ultimaMov: string | null = null;

  for (const row of rows) {
    const programId = String(row.program_id ?? "");
    const saldo = Number(row.saldo ?? 0);
    milhas += saldo;
    milhasPorPrograma.set(programId, (milhasPorPrograma.get(programId) ?? 0) + saldo);

    const state = readState(row);
    (state.lotes ?? []).forEach((lote) => {
      if (!lote.validadeLote) return;
      const validade = new Date(`${lote.validadeLote}T00:00:00`);
      const dias = Math.ceil((validade.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (dias >= 0 && dias <= 90) {
        pontosVencendo90d += Number(lote.quantidade ?? 0);
      }
    });

    const movimentos = state.movimentos ?? [];
    const saidas = movimentos.filter((m) => m.tipo === "saida");
    saidas.forEach((m) => {
      const economia = typeof m.economiaReal === "number" ? m.economiaReal : 0;
      economiaSoma += economia;
      if (economia !== 0) {
        roiSoma += economia;
        roiCount += 1;
      }
      const milhasM = Number(m.milhas ?? 0);
      if (milhasM > 0 && typeof m.economiaReal === "number") {
        const porMilheiro = (m.economiaReal / milhasM) * 1000;
        if (melhorMilheiroVal === null || porMilheiro > melhorMilheiroVal) {
          melhorMilheiroVal = porMilheiro;
        }
      }
    });
    movimentos.forEach((m) => {
      if (!m.data) return;
      if (!ultimaMov || m.data > ultimaMov) ultimaMov = m.data;
    });
  }

  const roiMedio = roiCount > 0 ? roiSoma / roiCount : 0;
  const totalMilhas = milhas || 1;
  let maxPct = 0;
  milhasPorPrograma.forEach((m) => {
    const pct = (m / totalMilhas) * 100;
    if (pct > maxPct) maxPct = pct;
  });
  const concentracaoMaxima = maxPct;

  const roiNorm = Math.min(1, Math.max(0, (roiMedio + 500) / 1000));
  const vencendoNorm = milhas ? 1 - Math.min(1, pontosVencendo90d / milhas) : 1;
  const diversificacao = 1 - concentracaoMaxima / 100;
  const atividade = ultimaMov ? 1 : 0;
  let scoreEstrategico = Math.round(roiNorm * 30 + vencendoNorm * 25 + diversificacao * 25 + atividade * 20);
  scoreEstrategico = Math.min(100, Math.max(0, scoreEstrategico));

  return { economiaTotal: economiaSoma, scoreEstrategico };
}

export function groupProgramsByCliente(rows: ProgramaClienteRow[]): Map<string, ProgramaClienteRow[]> {
  const map = new Map<string, ProgramaClienteRow[]>();
  for (const r of rows) {
    const id = String(r.cliente_id ?? "");
    if (!id) continue;
    if (!map.has(id)) map.set(id, []);
    map.get(id)!.push(r);
  }
  return map;
}
