/**
 * Cupons & promoções (admin) — persistido em localStorage.
 */

export type CupomTipo = "percentual" | "fixo" | "trial";
export type CupomStatus = "ativo" | "pausado" | "expirado" | "esgotado";
export type PlanoCupom = "basico" | "pro" | "enterprise";

export interface Cupom {
  id: string;
  codigo: string;
  tipo: CupomTipo;
  valor: number;
  planos: PlanoCupom[];
  maxUsos: number | null;
  totalUsos: number;
  status: CupomStatus;
  descricaoInterna?: string;
  expiradoEm: string | null;
  criadoEm: string;
  criadoPor?: string;
  totalDescontoGerado: number;
}

export interface UsoCupom {
  id: string;
  cupomId: string;
  equipeId: string;
  valorDesconto: number;
  aplicadoEm: string;
}

export interface CuponsState {
  cupons: Cupom[];
  usos: UsoCupom[];
  version: 1;
}

const STORAGE_KEY = "gm-admin-cupons-v1";

function iso(d: Date): string {
  return d.toISOString();
}

function seed(): CuponsState {
  const t = new Date();
  const c1 = "cup-launch";
  const c2 = "cup-trial";
  const c3 = "cup-fixed";
  const c4 = "cup-parc";
  const c5 = "cup-promo";
  const c6 = "cup-welcome";

  const cupons: Cupom[] = [
    {
      id: c1,
      codigo: "LAUNCH30",
      tipo: "percentual",
      valor: 30,
      planos: ["basico", "pro", "enterprise"],
      maxUsos: 50,
      totalUsos: 8,
      status: "ativo",
      descricaoInterna: "Lançamento plataforma",
      expiradoEm: `${t.getFullYear()}-06-30T23:59:59.000Z`,
      criadoEm: iso(t),
      totalDescontoGerado: 4200,
    },
    {
      id: c2,
      codigo: "TRIAL14",
      tipo: "trial",
      valor: 14,
      planos: ["pro", "enterprise"],
      maxUsos: null,
      totalUsos: 3,
      status: "ativo",
      expiradoEm: `${t.getFullYear()}-12-31T23:59:59.000Z`,
      criadoEm: iso(t),
      totalDescontoGerado: 0,
    },
    {
      id: c3,
      codigo: "FIXED200",
      tipo: "fixo",
      valor: 200,
      planos: ["basico"],
      maxUsos: 10,
      totalUsos: 1,
      status: "ativo",
      expiradoEm: `${t.getFullYear()}-05-15T23:59:59.000Z`,
      criadoEm: iso(t),
      totalDescontoGerado: 200,
    },
    {
      id: c6,
      codigo: "WELCOME10",
      tipo: "percentual",
      valor: 10,
      planos: ["basico", "pro"],
      maxUsos: 100,
      totalUsos: 0,
      status: "ativo",
      expiradoEm: `${t.getFullYear()}-08-01T23:59:59.000Z`,
      criadoEm: iso(t),
      totalDescontoGerado: 0,
    },
    {
      id: c4,
      codigo: "PARCEIRO50",
      tipo: "percentual",
      valor: 50,
      planos: ["enterprise"],
      maxUsos: 5,
      totalUsos: 0,
      status: "pausado",
      expiradoEm: null,
      criadoEm: iso(t),
      totalDescontoGerado: 0,
    },
    {
      id: c5,
      codigo: "PROMO2024",
      tipo: "percentual",
      valor: 20,
      planos: ["basico", "pro", "enterprise"],
      maxUsos: 50,
      totalUsos: 50,
      status: "expirado",
      expiradoEm: "2024-12-31T23:59:59.000Z",
      criadoEm: iso(t),
      totalDescontoGerado: 4540,
    },
  ];

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  const usos: UsoCupom[] = [];
  for (let i = 0; i < 12; i++) {
    usos.push({
      id: `u-mes-${i}`,
      cupomId: c1,
      equipeId: `eq-${i}`,
      valorDesconto: 745,
      aplicadoEm: iso(new Date(y, m, Math.min(28, i + 1))),
    });
  }
  for (let i = 0; i < 7; i++) {
    usos.push({
      id: `u-prev-${i}`,
      cupomId: c1,
      equipeId: `eqp-${i}`,
      valorDesconto: 400,
      aplicadoEm: iso(new Date(y, m - 1, 5 + i)),
    });
  }
  usos.push(
    { id: "u-trial", cupomId: c2, equipeId: "eq-t1", valorDesconto: 0, aplicadoEm: iso(new Date(y, m - 1, 18)) },
    { id: "u-fix", cupomId: c3, equipeId: "eq-f1", valorDesconto: 200, aplicadoEm: iso(new Date(y, m - 1, 20)) },
  );

  return { version: 1, cupons, usos };
}

export function loadCuponsState(): CuponsState {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    const p = JSON.parse(raw) as CuponsState;
    if (!p?.cupons) return seed();
    if (!p.usos) p.usos = [];
    return p;
  } catch {
    return seed();
  }
}

export function saveCuponsState(s: CuponsState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function statusVisual(c: Cupom): CupomStatus {
  if (c.status === "esgotado") return "esgotado";
  if (c.status === "pausado") return "pausado";
  if (c.expiradoEm && new Date(c.expiradoEm) < new Date()) return "expirado";
  if (c.maxUsos != null && c.totalUsos >= c.maxUsos) return "esgotado";
  return c.status === "ativo" ? "ativo" : c.status;
}

export function cuponsAtivosCount(cupons: Cupom[]): number {
  return cupons.filter((c) => statusVisual(c) === "ativo").length;
}

export interface KpiCupons {
  ativos: number;
  totalCadastrados: number;
  usosMes: number;
  deltaUsos: number;
  descontoMesCentavos: number;
  maisUsadoCodigo: string;
  maisUsadoTipo: string;
  maisUsadoUsos: number;
}

export function computeKpis(state: CuponsState): KpiCupons {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const startThis = new Date(y, m, 1).getTime();
  const startNext = new Date(y, m + 1, 1).getTime();
  const startPrev = new Date(y, m - 1, 1).getTime();

  const usosMes = state.usos.filter((u) => {
    const t = new Date(u.aplicadoEm).getTime();
    return t >= startThis && t < startNext;
  });
  const usosPrev = state.usos.filter((u) => {
    const t = new Date(u.aplicadoEm).getTime();
    return t >= startPrev && t < startThis;
  });

  const descontoMes = usosMes.reduce((s, u) => s + u.valorDesconto, 0);

  let maisUsadoCodigo = "—";
  let maisUsadoUsos = 0;
  const ativos = state.cupons.filter((c) => statusVisual(c) === "ativo");
  const cupMais =
    ativos.length === 0
      ? undefined
      : ativos.reduce<Cupom | undefined>((best, c) => {
          if (!best || c.totalUsos > best.totalUsos) return c;
          return best;
        }, undefined);
  if (cupMais) {
    maisUsadoCodigo = cupMais.codigo;
    maisUsadoUsos = cupMais.totalUsos;
  }
  const maisUsadoTipo = cupMais
    ? cupMais.tipo === "percentual"
      ? `${cupMais.valor}% off`
      : cupMais.tipo === "fixo"
        ? `R$ ${cupMais.valor}`
        : `+${cupMais.valor} dias`
    : "—";

  return {
    ativos: cuponsAtivosCount(state.cupons),
    totalCadastrados: state.cupons.length,
    usosMes: usosMes.length,
    deltaUsos: usosMes.length - usosPrev.length,
    descontoMesCentavos: Math.round(descontoMes * 100),
    maisUsadoCodigo,
    maisUsadoTipo,
    maisUsadoUsos,
  };
}

export function newCupomId(): string {
  return `cup-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function newUsoId(): string {
  return `uso-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function gerarCodigoCupom(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let s = "";
  for (let i = 0; i < 5; i++) s += letters[Math.floor(Math.random() * letters.length)];
  return `${s}${String(Math.floor(10 + Math.random() * 90))}`;
}

export function planosLabel(planos: PlanoCupom[]): string {
  if (planos.length === 3) return "Todos os planos";
  const map: Record<PlanoCupom, string> = { basico: "Básico", pro: "Pro", enterprise: "Enterprise" };
  return planos.map((p) => map[p]).join(" · ");
}

export function exportCuponsCsv(state: CuponsState): string {
  const h = ["codigo", "tipo", "valor", "planos", "max_usos", "total_usos", "status", "expira_em", "desconto_gerado"];
  const rows = state.cupons.map((c) =>
    [
      c.codigo,
      c.tipo,
      String(c.valor),
      c.planos.join("|"),
      c.maxUsos == null ? "" : String(c.maxUsos),
      String(c.totalUsos),
      c.status,
      c.expiradoEm ?? "",
      String(c.totalDescontoGerado),
    ].join(","),
  );
  return [h.join(","), ...rows].join("\n");
}
