import { listConfiguracoes, listEquipes, listPerfis, listViagens, upsertConfiguracao } from "@/lib/adminApi";

export type OnboardingStatus = "novo" | "progresso" | "travado" | "completo";
export type EtapaStatus = "done" | "current" | "todo";

export interface EtapaOnboarding {
  id: number;
  nome: string;
  descricao: string;
  emoji: string;
  status: EtapaStatus;
  concluidaEm?: string;
  diasEsperados: number;
  isMilestone?: boolean;
}

export interface OnboardingEquipe {
  equipeId: string;
  equipeNome: string;
  equipeAvatar: string;
  plano: string;
  criadaEm: string;
  progresso: number;
  etapasCompletas: number;
  status: OnboardingStatus;
  diasSemProgresso?: number;
  diasParaConcluir?: number;
  pontuacaoSaude: number;
  etapas: EtapaOnboarding[];
  lembretesEnviados: number;
}

export interface OnboardingAutomation {
  id: string;
  label: string;
  descricao: string;
  enabled: boolean;
}

export interface OnboardingSnapshot {
  version: 1;
  equipes: OnboardingEquipe[];
  automacoes: OnboardingAutomation[];
  etapaConfig: { id: number; nome: string; enabled: boolean; diasEsperados: number }[];
}

const STORAGE_KEY = "gm-admin-onboarding-v1";
const BACKEND_CONFIG_KEY = "admin_onboarding_snapshot";

const ETAPAS_BASE = [
  { id: 1, nome: "Primeiro login realizado", descricao: "Acesso à plataforma confirmado", emoji: "🔐", diasEsperados: 1 },
  { id: 2, nome: "Perfil da equipe completo", descricao: "Nome, logo e configurações básicas", emoji: "👤", diasEsperados: 2 },
  { id: 3, nome: "3 clientes cadastrados", descricao: "Carteiras de clientes criadas no CRM", emoji: "👥", diasEsperados: 5 },
  { id: 4, nome: "Programas de milhas configurados", descricao: "Pelo menos 1 programa vinculado a um cliente", emoji: "⭐", diasEsperados: 7 },
  { id: 5, nome: "Primeira emissão registrada", descricao: "Emissão de passagem documentada no sistema", emoji: "✈️", diasEsperados: 10 },
  { id: 6, nome: "Link público de captação ativado", descricao: "Página de captação de leads configurada", emoji: "🔗", diasEsperados: 12 },
  { id: 7, nome: "Primeira reunião agendada", descricao: "Reunião com cliente registrada na plataforma", emoji: "📅", diasEsperados: 15 },
  { id: 8, nome: "Marco: 10 clientes atingidos", descricao: "Equipe estabelecida com carteira sólida", emoji: "🏆", diasEsperados: 20, isMilestone: true },
] as const;

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function buildEtapas(criadaEm: string, completed: number): EtapaOnboarding[] {
  return ETAPAS_BASE.map((etapa, index) => {
    if (index < completed) {
      return { ...etapa, status: "done", concluidaEm: addDays(criadaEm, etapa.diasEsperados) };
    }
    if (index === completed && completed < ETAPAS_BASE.length) {
      return { ...etapa, status: "current" };
    }
    return { ...etapa, status: "todo" };
  });
}

function computeStatus(progresso: number, diasSemProgresso?: number): OnboardingStatus {
  if (progresso >= 100) return "completo";
  if ((diasSemProgresso ?? 0) > 7) return "travado";
  if (progresso > 0) return "progresso";
  return "novo";
}

function computeHealth({
  diasSemProgresso,
  diasParaConcluir,
  status,
}: {
  diasSemProgresso?: number;
  diasParaConcluir?: number;
  status: OnboardingStatus;
}): number {
  let score = 100;
  score -= Math.min(30, (diasSemProgresso ?? 0) * 5);
  if (status === "travado" && (diasSemProgresso ?? 0) > 14) score -= 10;
  if (typeof diasParaConcluir === "number" && diasParaConcluir < 14) score += 10;
  return Math.max(0, Math.min(100, score));
}

function seed(): OnboardingSnapshot {
  const jcCriada = "2024-01-10T09:00:00.000Z";
  const mvCriada = new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString();
  const tgCriada = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();

  const jcEtapasCompletas = 8;
  const mvEtapasCompletas = 5;
  const tgEtapasCompletas = 2;

  const jcProgresso = Math.round((jcEtapasCompletas / 8) * 100);
  const mvProgresso = Math.round((mvEtapasCompletas / 8) * 100);
  const tgProgresso = Math.round((tgEtapasCompletas / 8) * 100);

  const jcStatus = computeStatus(jcProgresso, 0);
  const mvStatus = computeStatus(mvProgresso, 2);
  const tgStatus = computeStatus(tgProgresso, 14);

  return {
    version: 1,
    equipes: [
      {
        equipeId: "eq-jc",
        equipeNome: "Equipe do João Carvalho",
        equipeAvatar: "JC",
        plano: "Plano Enterprise",
        criadaEm: jcCriada,
        progresso: jcProgresso,
        etapasCompletas: jcEtapasCompletas,
        status: jcStatus,
        diasParaConcluir: 18,
        pontuacaoSaude: computeHealth({ status: jcStatus, diasParaConcluir: 18 }),
        etapas: buildEtapas(jcCriada, jcEtapasCompletas),
        lembretesEnviados: 2,
      },
      {
        equipeId: "eq-mv",
        equipeNome: "Equipe Miles & Viagens",
        equipeAvatar: "MV",
        plano: "Plano Pro",
        criadaEm: mvCriada,
        progresso: mvProgresso,
        etapasCompletas: mvEtapasCompletas,
        status: mvStatus,
        diasSemProgresso: 2,
        pontuacaoSaude: computeHealth({ status: mvStatus, diasSemProgresso: 2 }),
        etapas: buildEtapas(mvCriada, mvEtapasCompletas),
        lembretesEnviados: 1,
      },
      {
        equipeId: "eq-tg",
        equipeNome: "TravelGest Premium",
        equipeAvatar: "TG",
        plano: "Plano Pro",
        criadaEm: tgCriada,
        progresso: tgProgresso,
        etapasCompletas: tgEtapasCompletas,
        status: tgStatus,
        diasSemProgresso: 14,
        pontuacaoSaude: computeHealth({ status: tgStatus, diasSemProgresso: 14 }),
        etapas: buildEtapas(tgCriada, tgEtapasCompletas),
        lembretesEnviados: 4,
      },
    ],
    automacoes: [
      { id: "auto-1", label: "E-mail de boas-vindas no cadastro", descricao: "Dispara automaticamente ao criar a equipe.", enabled: true },
      { id: "auto-2", label: "Lembrete no dia 3 se sem 1º login", descricao: "Lembra de concluir o primeiro acesso.", enabled: true },
      { id: "auto-3", label: "Lembrete no dia 7 se sem clientes", descricao: "Estimula a ativação inicial do CRM.", enabled: true },
      { id: "auto-4", label: "Lembrete no dia 14 se travada (manual)", descricao: "Requer ação manual da operação.", enabled: false },
      { id: "auto-5", label: "E-mail de parabéns ao completar 100%", descricao: "Reconhece a conclusão do onboarding.", enabled: true },
    ],
    etapaConfig: ETAPAS_BASE.map((etapa) => ({ id: etapa.id, nome: etapa.nome, enabled: true, diasEsperados: etapa.diasEsperados })),
  };
}

export function loadOnboardingSnapshot(): OnboardingSnapshot {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw) as OnboardingSnapshot;
    if (!parsed?.equipes || !parsed?.automacoes || !parsed?.etapaConfig) return seed();
    return parsed;
  } catch {
    return seed();
  }
}

export function saveOnboardingSnapshot(snapshot: OnboardingSnapshot): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  void saveOnboardingConfigToBackend(snapshot);
}

function countLeadingDone(flags: boolean[]): number {
  let count = 0;
  for (const item of flags) {
    if (!item) break;
    count += 1;
  }
  return count;
}

function buildDynamicEquipeFromBackend(input: {
  equipeId: string;
  equipeNome: string;
  criadaEm: string;
  clientesCount: number;
  viagensCount: number;
  hasAdminEquipe: boolean;
}): OnboardingEquipe {
  const createdIso = input.criadaEm;
  const daysSinceCreated = relDays(createdIso);

  const step1 = input.hasAdminEquipe || daysSinceCreated > 0;
  const step2 = input.equipeNome.trim().length > 2;
  const step3 = input.clientesCount >= 3;
  const step4 = input.clientesCount >= 1;
  const step5 = input.viagensCount >= 1;
  const step6 = input.clientesCount >= 5;
  const step7 = input.viagensCount >= 2;
  const step8 = input.clientesCount >= 10;

  const doneFlags = [step1, step2, step3, step4, step5, step6, step7, step8];
  const etapasCompletas = countLeadingDone(doneFlags);
  const progresso = Math.round((etapasCompletas / 8) * 100);
  const diasSemProgresso = Math.max(0, daysSinceCreated - etapasCompletas * 3);
  const status = computeStatus(progresso, diasSemProgresso);
  const diasParaConcluir = status === "completo" ? Math.max(1, Math.round(daysSinceCreated * 0.9)) : undefined;
  const pontuacaoSaude = computeHealth({ status, diasSemProgresso, diasParaConcluir });
  const etapas = buildEtapas(createdIso, etapasCompletas).map((step, index) => {
    const shouldBeCurrent = index === etapasCompletas && etapasCompletas < 8;
    if (status === "completo" && step.status !== "done") return { ...step, status: "done" as const, concluidaEm: addDays(createdIso, step.diasEsperados) };
    if (shouldBeCurrent && step.status === "todo") return { ...step, status: "current" as const };
    return step;
  });

  const nomeParts = input.equipeNome.trim().split(/\s+/).filter(Boolean);
  const equipeAvatar =
    nomeParts.length >= 2
      ? `${(nomeParts[0]?.[0] ?? "").toUpperCase()}${(nomeParts[nomeParts.length - 1]?.[0] ?? "").toUpperCase()}`
      : input.equipeNome.slice(0, 2).toUpperCase();

  return {
    equipeId: input.equipeId,
    equipeNome: input.equipeNome,
    equipeAvatar: equipeAvatar || "EQ",
    plano: "Plano Pro",
    criadaEm: createdIso,
    progresso,
    etapasCompletas,
    status,
    diasSemProgresso: status === "travado" ? diasSemProgresso : undefined,
    diasParaConcluir,
    pontuacaoSaude,
    etapas,
    lembretesEnviados: Math.max(0, Math.floor(diasSemProgresso / 7)),
  };
}

function relDays(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000)));
}

export async function loadOnboardingSnapshotFromBackend(): Promise<OnboardingSnapshot> {
  const local = await loadOnboardingConfigFromBackend();
  try {
    const [equipes, clientesGestao, viagens, adminsEquipe] = await Promise.all([
      listEquipes(),
      listPerfis({ role: "cliente_gestao" }),
      listViagens(),
      listPerfis({ role: "admin_equipe" }),
    ]);

    if (!equipes.length) return local;

    const clientesPorEquipe = new Map<string, number>();
    for (const cliente of clientesGestao) {
      if (!cliente.equipe_id) continue;
      const eq = String(cliente.equipe_id);
      clientesPorEquipe.set(eq, (clientesPorEquipe.get(eq) ?? 0) + 1);
    }

    const viagensPorEquipe = new Map<string, number>();
    for (const viagem of viagens) {
      if (!viagem.equipe_id) continue;
      const eq = String(viagem.equipe_id);
      viagensPorEquipe.set(eq, (viagensPorEquipe.get(eq) ?? 0) + 1);
    }

    const adminsPorEquipe = new Set<string>();
    for (const admin of adminsEquipe) {
      if (!admin.equipe_id) continue;
      adminsPorEquipe.add(String(admin.equipe_id));
    }

    const equipesDinamicas = equipes.map((equipe) =>
      buildDynamicEquipeFromBackend({
        equipeId: equipe.id,
        equipeNome: equipe.nome,
        criadaEm: equipe.created_at ?? new Date().toISOString(),
        clientesCount: clientesPorEquipe.get(equipe.id) ?? 0,
        viagensCount: viagensPorEquipe.get(equipe.id) ?? 0,
        hasAdminEquipe: adminsPorEquipe.has(equipe.id),
      }),
    );

    const ordered = [...equipesDinamicas].sort((a, b) => {
      const rank: Record<OnboardingStatus, number> = { travado: 0, progresso: 1, novo: 2, completo: 3 };
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      return b.progresso - a.progresso;
    });

    return {
      ...local,
      equipes: ordered,
    };
  } catch {
    return local;
  }
}

function isValidOnboardingConfig(value: unknown): value is Pick<OnboardingSnapshot, "automacoes" | "etapaConfig"> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<OnboardingSnapshot>;
  return Array.isArray(candidate.automacoes) && Array.isArray(candidate.etapaConfig);
}

export async function loadOnboardingConfigFromBackend(): Promise<OnboardingSnapshot> {
  const local = loadOnboardingSnapshot();
  try {
    const rows = await listConfiguracoes();
    const row = rows.find((item) => item.chave === BACKEND_CONFIG_KEY);
    if (!row) return local;
    if (!isValidOnboardingConfig(row.valor)) return local;
    const config = row.valor as Pick<OnboardingSnapshot, "automacoes" | "etapaConfig">;
    return { ...local, automacoes: config.automacoes, etapaConfig: config.etapaConfig };
  } catch {
    return local;
  }
}

export async function saveOnboardingConfigToBackend(snapshot: OnboardingSnapshot): Promise<void> {
  try {
    await upsertConfiguracao({
      chave: BACKEND_CONFIG_KEY,
      valor: {
        automacoes: snapshot.automacoes,
        etapaConfig: snapshot.etapaConfig,
      },
      descricao: "Configuração de onboarding do admin (automações e etapas)",
    });
  } catch {
    // Fallback local já cobre indisponibilidade de backend.
  }
}
