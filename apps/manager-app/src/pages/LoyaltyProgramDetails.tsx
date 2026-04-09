import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Settings2,
  Info,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Plus,
  Minus,
  Calendar,
  Filter,
  Plane,
  BarChart3,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Workspaces,
  WorkspaceTrigger,
  WorkspaceContent,
  type Workspace,
} from "@/components/ui/workspaces";
import { cn } from "@/lib/utils";
import { parseYmdToLocalDate } from "@/lib/dateYmd";
import { DatePickerField } from "@/components/ui/date-picker-field";
import {
  normalizePersistedProgramState,
  stripPersistedMetaForServer,
  type PersistedProgramState,
} from "@/lib/program-state";
import { useProgramasCliente } from "@/hooks/useProgramasCliente";
import { useAuth } from "@/contexts/AuthContext";
import { logAcao } from "@/lib/audit";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

type MovimentoTipo = "entrada" | "saida";

type Movimento = {
  id: string;
  data: string;
  tipo: MovimentoTipo;
  descricao: string;
  milhas: number;
  lucrativa?: boolean;
  /** Valor pago (R$) na entrada, quando tipo === "entrada" */
  valorPago?: number;
  entradaTipo?: string;
  validadeLote?: string;
  origem?: string;
  destino?: string;
  classe?: string;
  passageiros?: number;
  taxas?: number;
  tarifaPagante?: number;
  economiaReal?: number;
  custoMilheiroBase?: number;
  codigoReserva?: string;
};

type LoteMilhas = {
  id: string;
  validadeLote: string;
  quantidade: number;
};

type ProgramState = {
  programId?: string;
  managerClientId?: string | null;
  managerClientName?: string | null;
  name: string;
  logo: string;
  logoColor: string;
  logoImageUrl?: string;
  balance: string;
  valueInBRL: string;
  lastUpdate: string;
  variation: "up" | "down" | "none";
};

const initialMovimentos: Movimento[] = [];

interface ProgramWorkspace extends Workspace {
  categoria: string;
  logo: string;
  plan: string;
}

type EntradaValidadeOpcao =
  | "6m"
  | "12m"
  | "24m"
  | "36m"
  | "60m"
  | "manual";

const SALDO_BASE_INICIAL = 0;
const CUSTO_MEDIO_BASE_INICIAL = 0;
const CUSTO_SALDO_BASE_INICIAL = 0;
const STORAGE_PREFIX = "mile-manager:program-state:";

const ACTION_PLAN_LABEL_BY_KEY = {
  latam: "Latam Pass",
  azul: "Tudo Azul",
  smiles: "Smiles",
  avios: "Avios",
} as const;

type ActionPlanProgramKey = keyof typeof ACTION_PLAN_LABEL_BY_KEY;

const ACTION_PLAN_BY_PROGRAM_ID: Record<string, ActionPlanProgramKey> = {
  "latam-pass": "latam",
  latam: "latam",
  "tudo-azul": "azul",
  azul: "azul",
  smiles: "smiles",
  gol: "smiles",
  avios: "avios",
  iberia: "avios",
  "british-airways": "avios",
  "qatar-airways": "avios",
  finnair: "avios",
};

const normalizeProgramToken = (value?: string) =>
  (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const resolveActionPlanProgramKey = (
  programId?: string,
  programName?: string,
): ActionPlanProgramKey | null => {
  const normalizedProgramId = normalizeProgramToken(programId);
  if (normalizedProgramId && ACTION_PLAN_BY_PROGRAM_ID[normalizedProgramId]) {
    return ACTION_PLAN_BY_PROGRAM_ID[normalizedProgramId];
  }

  const normalizedProgramName = normalizeProgramToken(programName);
  if (!normalizedProgramName) return null;
  if (normalizedProgramName.includes("latam")) return "latam";
  if (normalizedProgramName.includes("azul")) return "azul";
  if (normalizedProgramName.includes("smiles") || normalizedProgramName.includes("gol")) {
    return "smiles";
  }
  if (
    normalizedProgramName.includes("avios")
    || normalizedProgramName.includes("iberia")
    || normalizedProgramName.includes("british")
    || normalizedProgramName.includes("qatar")
    || normalizedProgramName.includes("finnair")
  ) {
    return "avios";
  }
  return null;
};

const formatDateYmd = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const parseMovimentoDate = (value?: string) => {
  if (!value) return null;

  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(`${value}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // dd/mm/yy or dd/mm/yyyy
  if (/^\d{2}\/\d{2}\/\d{2,4}$/.test(value)) {
    const [dd, mm, yy] = value.split("/");
    const year = yy.length === 2 ? Number(`20${yy}`) : Number(yy);
    const d = new Date(year, Number(mm) - 1, Number(dd));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
};

const getEconomiaMovimentoSaida = (
  movimento: Movimento,
  custoMilheiroFallback: number,
) => {
  if (movimento.tipo !== "saida") return 0;
  if (typeof movimento.economiaReal === "number") return movimento.economiaReal;

  const milhas = Math.abs(movimento.milhas ?? 0);
  const taxas = movimento.taxas ?? 0;
  const tarifa = movimento.tarifaPagante ?? 0;
  const custoMilheiroBase = movimento.custoMilheiroBase ?? custoMilheiroFallback;

  if (milhas <= 0 || tarifa <= 0) return 0;

  const custoMilhas = (milhas / 1000) * custoMilheiroBase;
  return tarifa - (custoMilhas + taxas);
};

const readPersistedProgramState = (
  storageKey: string,
): PersistedProgramState | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedProgramState;
    if (typeof parsed?.saldo !== "number" || !Array.isArray(parsed?.movimentos)) {
      return null;
    }
    if (typeof parsed?.custoSaldo !== "number") {
      parsed.custoSaldo = 0;
    }
    if (typeof parsed?.custoMedioMilheiro !== "number") {
      parsed.custoMedioMilheiro =
        parsed.saldo > 0 ? (parsed.custoSaldo / parsed.saldo) * 1000 : 0;
    }
    if (!Array.isArray(parsed.lotes)) {
      parsed.lotes = [];
    }
    return parsed;
  } catch {
    return null;
  }
};

const LoyaltyProgramDetails = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { role } = useAuth();
  const { programId } = useParams();

  const program = (location.state as { program?: ProgramState } | null)?.program;
  const managerClientId =
    program?.managerClientId ??
    ((role === "gestor" || role === "admin")
      ? searchParams.get("clientId")
      : null);
  const managerClientName = program?.managerClientName ?? null;
  const isManagerView = !!managerClientId && (role === "gestor" || role === "admin");
  const roleViewLabel = role === "cs"
    ? "CS"
    : role === "admin"
      ? "admin"
      : "gestor";

  const {
    byProgramId: remoteByProgramId,
    saveProgramState,
    clientId: effectiveClientId,
  } = useProgramasCliente(managerClientId);

  const programName = program?.name ?? "Programa de Milhas";
  const lastUpdate = program?.lastUpdate ?? "03/03";
  const [updatedAtDisplay, setUpdatedAtDisplay] = useState(
    `${lastUpdate} às 17:40`,
  );
  const dataOwnerId = effectiveClientId ?? "anonymous";
  const storageKey = useMemo(
    () =>
      `${STORAGE_PREFIX}${dataOwnerId}:${programId ?? "default"}:${programName
        .toLowerCase()
        .replace(/\s+/g, "-")}`,
    [dataOwnerId, programId, programName],
  );

  const programWorkspaces = useMemo<ProgramWorkspace[]>(
    () => [
      {
        id: "sem-clube",
        name: "Sem Clube",
        categoria: "Diamante",
        logo:
          "https://images.unsplash.com/photo-1431540015161-0bf868a2d407?auto=format&fit=crop&w=80&q=80",
        plan: "Sem assinatura mensal",
      },
      {
        id: "clube-pro-1000",
        name: "Clube Pro 1.000",
        categoria: "Diamante",
        logo:
          "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=80&q=80",
        plan: "Acúmulo mensal de 1.000",
      },
      {
        id: "clube-master-2500",
        name: "Clube Master 2.500",
        categoria: "Diamante",
        logo:
          "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=80&q=80",
        plan: "Acúmulo mensal de 2.500",
      },
      {
        id: "clube-vip-5000",
        name: "Clube Vip 5.000",
        categoria: "Diamante",
        logo:
          "https://images.unsplash.com/photo-1523952578875-e6bb18b26645?auto=format&fit=crop&w=80&q=80",
        plan: "Acúmulo mensal de 5.000",
      },
      {
        id: "clube-exclusive-20000",
        name: "Clube Exclusive 20.000",
        categoria: "Diamante",
        logo:
          "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=80&q=80",
        plan: "Acúmulo mensal de 20.000",
      },
    ],
    [],
  );
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("sem-clube");
  const selectedWorkspace = useMemo(
    () =>
      programWorkspaces.find((w) => w.id === selectedWorkspaceId) ??
      programWorkspaces[0],
    [programWorkspaces, selectedWorkspaceId],
  );

  // Estado financeiro inicial a partir do card / estado persistido
  const saldoInicial = SALDO_BASE_INICIAL;
  const persistedState = useMemo(
    () => readPersistedProgramState(storageKey),
    [storageKey],
  );

  const [saldo, setSaldo] = useState<number>(
    persistedState?.saldo ?? saldoInicial,
  );
  const [movimentos, setMovimentos] = useState<Movimento[]>(
    persistedState?.movimentos ?? initialMovimentos,
  );
  const [lotes, setLotes] = useState<LoteMilhas[]>(
    persistedState?.lotes ?? [],
  );
  const [custoSaldo, setCustoSaldo] = useState<number>(
    persistedState?.custoSaldo ?? 0,
  );
  const [custoMedioMilheiro, setCustoMedioMilheiro] = useState<number>(
    persistedState?.custoMedioMilheiro ?? CUSTO_MEDIO_BASE_INICIAL,
  );
  const custoTotal = custoSaldo;
  const [actionPlanFollowupOpen, setActionPlanFollowupOpen] = useState(false);
  const [actionPlanFollowupSaving, setActionPlanFollowupSaving] = useState(false);
  const actionPlanProgramKey = useMemo(
    () => resolveActionPlanProgramKey(programId, programName),
    [programId, programName],
  );
  const actionPlanProgramLabel = actionPlanProgramKey
    ? ACTION_PLAN_LABEL_BY_KEY[actionPlanProgramKey]
    : null;

  const maybeAskActionPlanFollowup = async () => {
    if (!effectiveClientId || !actionPlanProgramKey || !actionPlanProgramLabel) return;
    try {
      const { data: perfilRows, error } = await supabase
        .from("perfis")
        .select("id, slug, configuracao_tema")
        .eq("usuario_id", effectiveClientId)
        .limit(1);
      if (error) throw error;
      const perfil = (perfilRows ?? [])[0] as
        | { id?: string; slug?: string | null; configuracao_tema?: Record<string, unknown> | null }
        | undefined;

      const perfilCfg = (perfil?.configuracao_tema ?? {}) as Record<string, unknown>;
      const clientePerfil = (perfilCfg.clientePerfil ?? {}) as Record<string, unknown>;
      const planoAcao = (clientePerfil.planoAcao ?? {}) as Record<string, unknown>;
      if (planoAcao[actionPlanProgramKey] !== true) return;

      setActionPlanFollowupOpen(true);
    } catch {
      // Não bloqueia o fluxo de emissão caso a leitura do plano falhe.
    }
  };

  const handleConfirmActionPlanFollowup = async (keepInPlan: boolean) => {
    if (!effectiveClientId || !actionPlanProgramKey || !actionPlanProgramLabel) {
      setActionPlanFollowupOpen(false);
      return;
    }

    setActionPlanFollowupSaving(true);
    try {
      const { data: perfilRows, error } = await supabase
        .from("perfis")
        .select("id, slug, configuracao_tema")
        .eq("usuario_id", effectiveClientId)
        .limit(1);
      if (error) throw error;
      const perfil = (perfilRows ?? [])[0] as
        | { id?: string; slug?: string | null; configuracao_tema?: Record<string, unknown> | null }
        | undefined;

      const perfilCfg = (perfil?.configuracao_tema ?? {}) as Record<string, unknown>;
      const clientePerfil = (perfilCfg.clientePerfil ?? {}) as Record<string, unknown>;
      const existingPlanoAcao = (clientePerfil.planoAcao ?? {}) as Record<string, unknown>;
      const nextPlanoAcao: Record<string, unknown> = {
        ...existingPlanoAcao,
        [actionPlanProgramKey]: keepInPlan,
      };
      const nextConfig = {
        ...perfilCfg,
        clientePerfil: {
          ...clientePerfil,
          planoAcao: nextPlanoAcao,
        },
      };

      if (perfil?.id) {
        const { error: updateError } = await supabase
          .from("perfis")
          .update({ configuracao_tema: nextConfig })
          .eq("usuario_id", effectiveClientId);
        if (updateError) throw updateError;
      } else {
        const fallbackSuffix = effectiveClientId.slice(0, 8);
        const { error: insertError } = await supabase.from("perfis").insert({
          usuario_id: effectiveClientId,
          slug: `cliente-${fallbackSuffix}`,
          nome_completo: `Cliente ${fallbackSuffix}`,
          configuracao_tema: nextConfig,
        });
        if (insertError) throw insertError;
      }

      queryClient.invalidateQueries({ queryKey: ["cliente_gestores_perfis"] });
      setActionPlanFollowupOpen(false);
      toast.success(
        keepInPlan
          ? `${actionPlanProgramLabel} mantido no plano de ação.`
          : `${actionPlanProgramLabel} removido do plano de ação.`,
      );
    } catch (error) {
      const rawMessage =
        error instanceof Error ? error.message : "Não foi possível atualizar o plano de ação.";
      const message = /row-level security|permission denied|violates/i.test(rawMessage)
        ? "Sem permissão para atualizar o plano de ação deste cliente."
        : rawMessage;
      toast.error(message);
    } finally {
      setActionPlanFollowupSaving(false);
    }
  };

  const handleAtualizarTela = () => {
    // Recalcula os indicadores a partir do estado atual e carimba a última atualização.
    const custoSaldoRecalculado = (saldo / 1000) * custoMedioMilheiro;
    setCustoSaldo(custoSaldoRecalculado);

    const agora = new Date();
    const data = agora.toLocaleDateString("pt-BR");
    const hora = agora.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    setUpdatedAtDisplay(`${data} às ${hora}`);
    if (isManagerView) {
      void logAcao({
        tipoAcao: "atualizacao_manual_programa",
        entidadeAfetada: "programa_cliente",
        entidadeId: programId,
        details: { managerClientId, programName },
      });
    }
  };

  const handleResetarTodosSaldos = () => {
    if (typeof window === "undefined") return;

    const confirmar = window.confirm(
      "Tem certeza que deseja resetar todos os saldos e históricos?",
    );
    if (!confirmar) return;

    const prefixOwner = `${STORAGE_PREFIX}${dataOwnerId}:`;
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith(prefixOwner))
      .forEach((key) => window.localStorage.removeItem(key));

    setSaldo(0);
    setMovimentos([]);
    setCustoSaldo(0);
    setCustoMedioMilheiro(0);
    setUpdatedAtDisplay("Resetado agora");
    if (isManagerView) {
      void logAcao({
        tipoAcao: "reset_saldos",
        entidadeAfetada: "programa_cliente",
        entidadeId: programId,
        details: { managerClientId, programName },
      });
    }
  };

  useEffect(() => {
    const nextState = readPersistedProgramState(storageKey);
    setSaldo(nextState?.saldo ?? saldoInicial);
    setMovimentos(nextState?.movimentos ?? initialMovimentos);
    if (nextState?.lotes?.length) {
      setLotes(nextState.lotes);
    } else {
      // Migração simples: se não houver lotes persistidos, recria a partir das entradas com validade.
      const lotesMigrados = (nextState?.movimentos ?? initialMovimentos)
        .filter((m) => m.tipo === "entrada" && !!m.validadeLote && m.milhas > 0)
        .reduce<Record<string, number>>((acc, m) => {
          const key = m.validadeLote!;
          acc[key] = (acc[key] ?? 0) + m.milhas;
          return acc;
        }, {});

      setLotes(
        Object.entries(lotesMigrados).map(([validadeLote, quantidade]) => ({
          id: `${validadeLote}-${quantidade}`,
          validadeLote,
          quantidade,
        })),
      );
    }
    setCustoSaldo(nextState?.custoSaldo ?? CUSTO_SALDO_BASE_INICIAL);
    setCustoMedioMilheiro(
      nextState?.custoMedioMilheiro ?? CUSTO_MEDIO_BASE_INICIAL,
    );
  }, [storageKey, saldoInicial]);

  /**
   * Sincroniza com Supabase sem apagar edições locais:
   * - refetch após save / HMR não pode trazer snapshot mais “antigo” que o que o usuário acabou de digitar.
   * - Se houver mais movimentos no storage local que no servidor, não sobrescreve.
   * - Se a quantidade for igual, só aplica remoto se `updated_at` do servidor for mais recente
   *   que `_localRevisionMs` (folga de relógio).
   */
  useEffect(() => {
    const row = remoteByProgramId.get(programId ?? "");
    if (!row?.state) return;

    const remoteNorm = normalizePersistedProgramState(row.state as PersistedProgramState);
    const remoteTs = new Date(row.updated_at).getTime();
    const local = readPersistedProgramState(storageKey);
    const localRev = local?._localRevisionMs ?? 0;
    const localMov = local?.movimentos?.length ?? 0;
    const remoteMov = remoteNorm.movimentos.length;

    if (localMov > remoteMov) return;

    const CLOCK_SKEW_MS = 3_000;
    if (localMov === remoteMov && localRev > remoteTs + CLOCK_SKEW_MS) return;

    setSaldo(remoteNorm.saldo);
    setMovimentos(remoteNorm.movimentos);
    setLotes(remoteNorm.lotes);
    setCustoSaldo(remoteNorm.custoSaldo);
    setCustoMedioMilheiro(remoteNorm.custoMedioMilheiro);
  }, [remoteByProgramId, programId, storageKey]);

  // Regra de negócio: custo do saldo = saldo * custo médio por milheiro / 1000
  useEffect(() => {
    const custoSaldoEsperado = (saldo / 1000) * custoMedioMilheiro;
    if (Math.abs(custoSaldo - custoSaldoEsperado) > 0.0001) {
      setCustoSaldo(custoSaldoEsperado);
    }
  }, [saldo, custoMedioMilheiro, custoSaldo]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stateToPersist: PersistedProgramState = {
      saldo,
      movimentos,
      custoSaldo,
      custoMedioMilheiro,
      lotes,
      _localRevisionMs: Date.now(),
    };
    window.localStorage.setItem(storageKey, JSON.stringify(stateToPersist));
    if (programId && effectiveClientId) {
      void saveProgramState({
        programId,
        programName,
        logo: program?.logo ?? null,
        logoColor: program?.logoColor ?? null,
        logoImageUrl: program?.logoImageUrl ?? null,
        state: stripPersistedMetaForServer(stateToPersist),
      });
    }
  }, [
    storageKey,
    saldo,
    movimentos,
    custoSaldo,
    custoMedioMilheiro,
    lotes,
    programId,
    programName,
    program?.logoImageUrl,
    program?.logo,
    program?.logoColor,
    effectiveClientId,
    saveProgramState,
  ]);

  const pontosAVencer = useMemo<
    Array<{ data: string; quantidade: number; diasRestantes: number }>
  >(() => {
    const lotesPorValidade = new Map<string, number>();
    lotes
      .filter((l) => l.quantidade > 0)
      .forEach((lote) => {
        const atual = lotesPorValidade.get(lote.validadeLote) ?? 0;
        lotesPorValidade.set(lote.validadeLote, atual + lote.quantidade);
      });

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const msDia = 1000 * 60 * 60 * 24;

    return Array.from(lotesPorValidade.entries())
      .map(([validadeLote, quantidade]) => {
        const validade = new Date(`${validadeLote}T00:00:00`);
        const diasRestantes = Math.ceil(
          (validade.getTime() - hoje.getTime()) / msDia,
        );

        return {
          data: validade.toLocaleDateString("pt-BR", { timeZone: "UTC" }),
          quantidade,
          diasRestantes,
        };
      })
      .sort((a, b) => a.diasRestantes - b.diasRestantes);
  }, [lotes]);

  /** Milhas que vencem nos próximos 30 dias */
  const milhasVencendoUltimos30Dias = useMemo(
    () =>
      pontosAVencer
        .filter((p) => p.diasRestantes >= 0 && p.diasRestantes <= 30)
        .reduce((acc, p) => acc + p.quantidade, 0),
    [pontosAVencer],
  );

  const valorEstimadoMilheiro = 18.85; // exemplo de valuation
  const valorEstrategicoEstimado = useMemo(
    () => (saldo / 1000) * valorEstimadoMilheiro,
    [saldo],
  );

  const economiaRealUltimos12Meses = useMemo(() => {
    const limite = new Date();
    limite.setMonth(limite.getMonth() - 12);
    limite.setHours(0, 0, 0, 0);

    return movimentos
      .filter((m) => m.tipo === "saida")
      .filter((m) => {
        const data = parseMovimentoDate(m.data);
        return !!data && data >= limite;
      })
      .reduce(
        (acc, m) => acc + getEconomiaMovimentoSaida(m, custoMedioMilheiro),
        0,
      );
  }, [movimentos, custoMedioMilheiro]);

  // Modais
  const [entradaOpen, setEntradaOpen] = useState(false);
  const [saidaOpen, setSaidaOpen] = useState(false);
  const [movimentoDetalheOpen, setMovimentoDetalheOpen] = useState(false);
  const [movimentoSelecionado, setMovimentoSelecionado] =
    useState<Movimento | null>(null);

  // Entrada de milhas
  const [entradaTipo, setEntradaTipo] = useState("compra");
  const [entradaQuantidade, setEntradaQuantidade] = useState(0);
  const [entradaValorPago, setEntradaValorPago] = useState(0);
  const [entradaData, setEntradaData] = useState("");
  const [entradaValidadeOpcao, setEntradaValidadeOpcao] =
    useState<EntradaValidadeOpcao>("12m");
  const [entradaValidadeLote, setEntradaValidadeLote] = useState("");
  const [entradaObs, setEntradaObs] = useState("");

  const custoMilheiroOperacao = useMemo(
    () =>
      entradaQuantidade > 0
        ? (entradaValorPago / entradaQuantidade) * 1000
        : 0,
    [entradaValorPago, entradaQuantidade],
  );

  const novoCustoMedioPonderado = useMemo(() => {
    if (entradaQuantidade <= 0) return custoMedioMilheiro;
    const novoSaldo = saldo + entradaQuantidade;
    const novoCustoTotal = custoSaldo + entradaValorPago;
    if (novoSaldo <= 0) return 0;
    return (novoCustoTotal / novoSaldo) * 1000;
  }, [saldo, custoSaldo, entradaQuantidade, entradaValorPago, custoMedioMilheiro]);

  const handleSalvarEntrada = () => {
    if (entradaQuantidade <= 0) return;

    const novoSaldo = saldo + entradaQuantidade;
    const novoCustoSaldo = custoSaldo + entradaValorPago;
    const novoCustoMedio =
      novoSaldo > 0 ? (novoCustoSaldo / novoSaldo) * 1000 : 0;

    setSaldo(novoSaldo);
    setCustoSaldo(novoCustoSaldo);
    setCustoMedioMilheiro(novoCustoMedio);

    const hoje = new Date();
    const dataMovimento =
      entradaData || hoje.toLocaleDateString("pt-BR", { timeZone: "UTC" });
    const baseDate = entradaData
      ? new Date(`${entradaData}T00:00:00`)
      : new Date();

    const validadeMesesMap: Record<Exclude<EntradaValidadeOpcao, "manual">, number> =
      {
        "6m": 6,
        "12m": 12,
        "24m": 24,
        "36m": 36,
        "60m": 60,
      };

    const validadeLoteFinal =
      entradaValidadeOpcao === "manual"
        ? entradaValidadeLote
        : (() => {
            const validade = new Date(baseDate);
            validade.setMonth(validade.getMonth() + validadeMesesMap[entradaValidadeOpcao]);
            return formatDateYmd(validade);
          })();

    const descricaoBase =
      entradaTipo === "compra"
        ? "Compra de milhas"
        : entradaTipo === "transferencia"
          ? "Transferência de milhas"
          : entradaTipo === "bonus"
            ? "Bônus de milhas"
            : entradaTipo === "clube"
              ? "Crédito Clube de milhas"
              : "Ajuste de milhas";

    const novoMovimento: Movimento = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      data: dataMovimento,
      tipo: "entrada",
      descricao: entradaObs ? `${descricaoBase} – ${entradaObs}` : descricaoBase,
      milhas: entradaQuantidade,
      valorPago: entradaValorPago,
      entradaTipo,
      validadeLote: validadeLoteFinal || undefined,
    };

    setMovimentos((anterior) => [novoMovimento, ...anterior]);

    if (validadeLoteFinal) {
      setLotes((anteriores) => {
        const existing = anteriores.find(
          (l) => l.validadeLote === validadeLoteFinal,
        );
        if (existing) {
          return anteriores.map((l) =>
            l.validadeLote === validadeLoteFinal
              ? { ...l, quantidade: l.quantidade + entradaQuantidade }
              : l,
          );
        }
        return [
          ...anteriores,
          {
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            validadeLote: validadeLoteFinal,
            quantidade: entradaQuantidade,
          },
        ];
      });
    }

    setEntradaOpen(false);
    setEntradaQuantidade(0);
    setEntradaValorPago(0);
    setEntradaData("");
    setEntradaValidadeOpcao("12m");
    setEntradaValidadeLote("");
    setEntradaObs("");
    setEntradaTipo("compra");
    if (isManagerView) {
      void logAcao({
        tipoAcao: "registro_entrada_milhas",
        entidadeAfetada: "movimentos_programa",
        entidadeId: novoMovimento.id,
        details: {
          managerClientId,
          programId,
          programName,
          milhas: entradaQuantidade,
          valorPago: entradaValorPago,
        },
      });
    }
  };

  // Saída / emissão
  const [emitDescricao, setEmitDescricao] = useState("");
  const [emitOrigem, setEmitOrigem] = useState("");
  const [emitDestino, setEmitDestino] = useState("");
  const [emitTipoViagem, setEmitTipoViagem] = useState<"somente_ida" | "ida_e_volta">(
    "somente_ida",
  );
  const [emitDataIda, setEmitDataIda] = useState("");
  const [emitDataVolta, setEmitDataVolta] = useState("");
  const [emitPax, setEmitPax] = useState(1);
  const [emitClasse, setEmitClasse] = useState("executiva");
  const [emitBagagem, setEmitBagagem] = useState(false);
  const [emitAssento, setEmitAssento] = useState(false);
  const [emitSeguro, setEmitSeguro] = useState(false);
  const [emitOutroAdd, setEmitOutroAdd] = useState("");
  const [emitCodigoReserva, setEmitCodigoReserva] = useState("");

  const [emitMilhas, setEmitMilhas] = useState(0);
  const [emitTaxas, setEmitTaxas] = useState(0);
  const [emitTarifaPagante, setEmitTarifaPagante] = useState(0);
  const [emitObs, setEmitObs] = useState("");

  // Usa o custo médio atual do programa como base do cálculo.
  const custoMedioMilheiroReferencia = custoMedioMilheiro;

  const custoMilhasNaEmissao = useMemo(
    () => (emitMilhas / 1000) * custoMedioMilheiroReferencia,
    [emitMilhas, custoMedioMilheiroReferencia],
  );

  const custoRealEmissaoMilhasETaxas = useMemo(
    () => custoMilhasNaEmissao + emitTaxas,
    [custoMilhasNaEmissao, emitTaxas],
  );

  // Economia real da emissão = tarifa pagante - (custo das milhas + taxas)
  const economiaRealEmissao = useMemo(
    () => emitTarifaPagante - custoRealEmissaoMilhasETaxas,
    [custoRealEmissaoMilhasETaxas, emitTarifaPagante],
  );

  const valorMilheiroReal = useMemo(() => {
    if (emitMilhas <= 0) return 0;
    return (economiaRealEmissao / emitMilhas) * 1000;
  }, [economiaRealEmissao, emitMilhas]);

  const roiEmissao = useMemo(() => {
    const investimento = custoRealEmissaoMilhasETaxas;
    if (investimento <= 0) return 0;
    return (economiaRealEmissao / investimento) * 100;
  }, [custoRealEmissaoMilhasETaxas, economiaRealEmissao]);

  const descontoReal = useMemo(() => {
    if (emitTarifaPagante <= 0) return 0;
    return (economiaRealEmissao / emitTarifaPagante) * 100;
  }, [economiaRealEmissao, emitTarifaPagante]);

  const classificacaoEmissao = useMemo<"vantajosa" | "mais_cara">(() => {
    // Verde quando emitir com milhas sai igual/mais barato que tarifa pagante.
    if (custoRealEmissaoMilhasETaxas <= emitTarifaPagante) return "vantajosa";
    // Vermelho quando emitir com milhas fica mais caro que pagar a tarifa.
    return "mais_cara";
  }, [custoRealEmissaoMilhasETaxas, emitTarifaPagante]);

  const corClassificacao =
    classificacaoEmissao === "vantajosa" ? "text-emerald-400" : "text-red-400";

  const handleSalvarSaida = () => {
    if (emitMilhas <= 0) return;
    const milhasSaida = Math.min(emitMilhas, saldo);
    const novoSaldo = Math.max(saldo - milhasSaida, 0);
    const custoRemovido = (milhasSaida / 1000) * custoMedioMilheiro;
    const novoCustoSaldo = Math.max(custoSaldo - custoRemovido, 0);

    setSaldo(novoSaldo);
    setCustoSaldo(novoCustoSaldo);

    // Regra: saída sempre debita primeiro dos lotes mais próximos de vencer.
    setLotes((anteriores) => {
      const ordenados = [...anteriores]
        .filter((l) => l.quantidade > 0)
        .sort(
          (a, b) =>
            new Date(a.validadeLote).getTime() - new Date(b.validadeLote).getTime(),
        );

      let restante = milhasSaida;
      const atualizados = ordenados.map((lote) => {
        if (restante <= 0) return lote;
        const debitado = Math.min(lote.quantidade, restante);
        restante -= debitado;
        return {
          ...lote,
          quantidade: lote.quantidade - debitado,
        };
      });

      // Mantém lotes sem validade não afetados e remove lotes zerados.
      const semValidade = anteriores.filter((l) => !l.validadeLote);
      return [...atualizados, ...semValidade].filter((l) => l.quantidade > 0);
    });

    const hoje = new Date();
    const dataMovimento =
      emitDataIda || hoje.toLocaleDateString("pt-BR", { timeZone: "UTC" });

    const rota =
      emitOrigem && emitDestino ? `${emitOrigem.toUpperCase()} – ${emitDestino.toUpperCase()}` : "";

    const descricaoBase =
      emitDescricao || (rota ? `Emissão ${rota}` : "Emissão com milhas");

    const movimentoEmissao: Movimento = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      data: dataMovimento,
      tipo: "saida",
      descricao: emitObs
        ? `${descricaoBase} – ${emitObs}`
        : descricaoBase,
      milhas: -emitMilhas,
      lucrativa: roiEmissao >= 0,
      origem: emitOrigem || undefined,
      destino: emitDestino || undefined,
      classe: emitClasse || undefined,
      passageiros: emitPax,
      taxas: emitTaxas,
      tarifaPagante: emitTarifaPagante,
      economiaReal: economiaRealEmissao,
      custoMilheiroBase: custoMedioMilheiroReferencia,
      codigoReserva: emitCodigoReserva.trim() || undefined,
    };

    setMovimentos((anterior) => [movimentoEmissao, ...anterior]);

    // Aqui você registraria histórico + ROI individual da emissão no backend.
    setSaidaOpen(false);
    if (isManagerView) {
      void logAcao({
        tipoAcao: "registro_saida_milhas",
        entidadeAfetada: "movimentos_programa",
        entidadeId: movimentoEmissao.id,
        details: {
          managerClientId,
          programId,
          programName,
          milhas: milhasSaida,
          economiaReal: economiaRealEmissao,
        },
      });
    }
    void maybeAskActionPlanFollowup();
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-slate-100 text-slate-900">
      {/* Header */}
      <header className="bg-header text-header-foreground">
        <div className="flex items-center justify-between px-4 pb-3 pt-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-header-foreground/15 text-header-foreground ring-1 ring-header-foreground/25"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[10px] uppercase tracking-[0.18em] text-header-foreground/70">
              Programa
            </span>
            <span className="max-w-[170px] truncate text-sm font-semibold tracking-tight">
              {programName}
            </span>
            {managerClientId && (
              <>
                <span className="rounded-full bg-header-foreground/15 px-2 py-0.5 text-[10px] text-header-foreground">
                  {`Visualizando como ${roleViewLabel}`}
                </span>
                {managerClientName && (
                  <span className="max-w-[200px] truncate text-[10px] text-header-foreground/85">
                    {managerClientName}
                  </span>
                )}
              </>
            )}
            {programId && (
              <span className="text-[10px] text-header-foreground/70">
                #{programId}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAtualizarTela}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-header-foreground/15 text-header-foreground ring-1 ring-header-foreground/25"
              aria-label="Recarregar página"
              title="Recarregar"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleResetarTodosSaldos}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-header-foreground/15 text-header-foreground ring-1 ring-header-foreground/25"
              aria-label="Resetar todos os saldos"
              title="Resetar saldos"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <Tabs defaultValue="resumo" className="flex flex-1 flex-col">
        <TabsList className="mx-4 mb-3 grid grid-cols-3 rounded-full border border-slate-300 bg-slate-100 p-1 text-xs">
          <TabsTrigger value="resumo" className="rounded-full text-slate-700 data-[state=active]:bg-slate-900 data-[state=active]:text-white">
            Resumo
          </TabsTrigger>
          <TabsTrigger value="extrato" className="rounded-full text-slate-700 data-[state=active]:bg-slate-900 data-[state=active]:text-white">
            Extrato
          </TabsTrigger>
          <TabsTrigger value="analise" className="rounded-full text-slate-700 data-[state=active]:bg-slate-900 data-[state=active]:text-white">
            Análise
          </TabsTrigger>
        </TabsList>

        {/* Resumo */}
        <TabsContent value="resumo" className="flex-1">
          <ScrollArea className="h-[calc(100vh-150px)] px-4 pb-6">
            {/* Card principal */}
            <Card className="mb-3 rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm">
              <CardContent className="p-4">
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700 ring-1 ring-cyan-200">
                      <Plane className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-600">
                        Categoria
                      </p>
                      <Workspaces
                        workspaces={programWorkspaces}
                        selectedWorkspaceId={selectedWorkspaceId}
                        onWorkspaceChange={(workspace) =>
                          setSelectedWorkspaceId((workspace as ProgramWorkspace).id)
                        }
                      >
                        <WorkspaceTrigger
                          className="text-xs font-semibold text-cyan-700"
                          renderTrigger={(workspace) => (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-700">
                              {(workspace as ProgramWorkspace).name}
                            </span>
                          )}
                        />
                        <WorkspaceContent title="Plano de clube" />
                      </Workspaces>
                    </div>
                  </div>
                  <div className="text-right text-[10px] text-slate-600">
                    <p>Atualização</p>
                    <p className="font-medium text-slate-700">
                      {updatedAtDisplay}
                    </p>
                  </div>
                </div>

                <div className="mb-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-600">
                    Saldo de milhas
                  </p>
                  <p className="mt-1 text-3xl font-semibold tracking-tight">
                    {saldo.toLocaleString("pt-BR")}{" "}
                    <span className="text-xs font-normal text-slate-600">
                      milhas
                    </span>
                  </p>
                </div>

                <div className="flex items-start justify-between rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div>
                    <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-600">
                      Custo do saldo
                      <Info className="h-3 w-3 text-slate-500" />
                    </p>
                    <p className="mt-1 text-lg font-semibold text-emerald-600">
                      {custoTotal.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-600">
                      Custo real pago pelas milhas do saldo
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-right">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200">
                      <TrendingUp className="h-3 w-3" />
                      Economia 12m{" "}
                      {economiaRealUltimos12Meses.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                        maximumFractionDigits: 0,
                      })}
                    </span>
                    <span className="text-[10px] text-slate-600">
                      Custo médio:{" "}
                      {custoMedioMilheiro.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}{" "}
                      / milheiro
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Ações imediatamente abaixo do card estratégico */}
            <div className="mb-4 grid grid-cols-2 gap-3">
              <Button
                type="button"
                className="h-11 rounded-full bg-emerald-500 text-xs font-medium text-emerald-950 hover:bg-emerald-400"
                onClick={() => setEntradaOpen(true)}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Entrada de milhas
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-full border-red-200 bg-red-50 text-xs font-medium text-red-700 hover:bg-red-100"
                onClick={() => setSaidaOpen(true)}
              >
                <Minus className="mr-1.5 h-4 w-4" />
                Saída de milhas
              </Button>
            </div>

            {/* Bloco financeiro */}
            <Card className="mb-4 rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800">
                    Inteligência de custo
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                    <p className="text-[11px] text-slate-600">
                      Custo médio por milheiro
                    </p>
                    <p className="text-base font-semibold text-amber-600">
                      {custoMedioMilheiro.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      <span className="text-[10px] font-normal text-slate-600">
                        / 1.000 milhas
                      </span>
                    </p>
                  </div>
                  <div className="space-y-1 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                    <p className="text-[11px] text-slate-600">
                      Custo do saldo
                    </p>
                    <p className="text-base font-semibold text-slate-900">
                      {custoTotal.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                  <div className="space-y-1 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                    <p className="text-[11px] text-slate-600">
                      Milhas vencendo nos próximos 30 dias
                    </p>
                    <p className="text-base font-semibold text-amber-600">
                      {milhasVencendoUltimos30Dias.toLocaleString("pt-BR")}{" "}
                      <span className="text-[10px] font-normal text-slate-600">
                        milhas
                      </span>
                    </p>
                  </div>
                </div>

              </CardContent>
            </Card>

            {/* Pontos a vencer */}
            <Card className="mb-4 rounded-3xl border border-slate-200 bg-white shadow-sm">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-700">
                    Pontos a vencer
                  </span>
                  <Calendar className="h-4 w-4 text-slate-500" />
                </div>

                <div className="space-y-3">
                  {pontosAVencer.length === 0 ? (
                    <div className="rounded-2xl bg-slate-50 p-3 text-[11px] text-slate-500 ring-1 ring-slate-200">
                      Nenhum lote com validade informado ainda.
                    </div>
                  ) : (
                    pontosAVencer.map((ponto) => {
                      const percentual = Math.min(
                        100,
                        Math.max(0, (1 - ponto.diasRestantes / 365) * 100),
                      );
                      const critico =
                        ponto.diasRestantes >= 0 && ponto.diasRestantes < 90;
                      const vencido = ponto.diasRestantes < 0;

                      return (
                        <div
                          key={`${ponto.data}-${ponto.quantidade}`}
                          className="space-y-1 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <div>
                              <p className="text-slate-700">{ponto.data}</p>
                              <p className="text-[11px] text-slate-500">
                                {vencido
                                  ? `Venceu há ${Math.abs(ponto.diasRestantes)} dias`
                                  : `Expira em ${ponto.diasRestantes} dias`}
                              </p>
                            </div>
                            <p
                              className={cn(
                                "text-sm font-semibold",
                                critico
                                  ? "text-amber-700"
                                  : vencido
                                    ? "text-red-700"
                                    : "text-slate-900",
                              )}
                            >
                              {ponto.quantidade.toLocaleString("pt-BR")} pts
                            </p>
                          </div>
                          <Progress
                            value={percentual}
                            className={cn(
                              "h-1.5 bg-slate-200",
                              (critico || vencido) && "bg-red-950 [&>*]:bg-red-500",
                            )}
                          />
                          {critico && (
                            <p className="text-[10px] font-medium text-amber-700">
                              Alerta: menos de 90 dias para expirar.
                            </p>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </ScrollArea>
        </TabsContent>

        {/* Extrato */}
        <TabsContent value="extrato" className="flex-1">
          <div className="flex items-center justify-between px-4 pb-2 pt-1 text-xs text-slate-400">
            <div className="flex gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-600"
              >
                <Filter className="h-3 w-3" />
                Período
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-600"
              >
                Tipo
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-600"
              >
                Emissões lucrativas
              </button>
            </div>
          </div>
          <ScrollArea className="h-[calc(100vh-150px)] px-4 pb-6">
            <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm">
              <CardContent className="divide-y divide-slate-200 p-0">
                {movimentos.length === 0 && (
                  <div className="px-4 py-6 text-center text-xs text-slate-400">
                    Nenhuma movimentação registrada ainda.
                  </div>
                )}
                {movimentos.map((mov) => (
                  <button
                    key={mov.id}
                    type="button"
                    onClick={() => {
                      setMovimentoSelecionado(mov);
                      setMovimentoDetalheOpen(true);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-xs"
                  >
                    <div className="w-16">
                      <p className="text-[11px] text-slate-400">{mov.data}</p>
                      <p
                        className={cn(
                          "mt-0.5 text-xs font-semibold",
                          mov.tipo === "entrada"
                            ? "text-emerald-700"
                            : "text-red-700",
                        )}
                      >
                        {mov.tipo === "entrada" ? "Entrada" : "Saída"}
                      </p>
                    </div>
                    <div className="flex-1">
                      <p className="text-[12px] text-slate-900">
                        {mov.descricao}
                      </p>
                      {mov.tipo === "saida" && mov.codigoReserva && (
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          Reserva: {mov.codigoReserva}
                        </p>
                      )}
                      {mov.lucrativa !== undefined && (
                        <p
                          className={cn(
                            "mt-0.5 text-[10px]",
                            mov.lucrativa
                              ? "text-emerald-700"
                              : "text-red-700",
                          )}
                        >
                          {mov.lucrativa
                            ? "Emissão lucrativa"
                            : "Abaixo do custo médio"}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p
                        className={cn(
                          "text-xs font-semibold",
                          mov.milhas >= 0
                            ? "text-emerald-700"
                            : "text-red-700",
                        )}
                      >
                        {mov.milhas >= 0 ? "+" : "-"}{" "}
                        {Math.abs(mov.milhas).toLocaleString("pt-BR")}
                      </p>
                    </div>
                    <ChevronRight className="h-3 w-3 text-slate-400" />
                  </button>
                ))}
              </CardContent>
            </Card>
          </ScrollArea>
        </TabsContent>

        {/* Análise */}
        <TabsContent value="analise" className="flex-1">
          <ScrollArea className="h-[calc(100vh-150px)] px-4 pb-6">
            <Card className="mb-4 rounded-3xl border border-slate-200 bg-white shadow-sm">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-700">
                    Evolução do saldo
                  </span>
                  <BarChart3 className="h-4 w-4 text-slate-500" />
                </div>
                <div className="h-24 rounded-2xl bg-slate-50 text-[11px] text-slate-500 ring-1 ring-slate-200">
                  <p className="p-3 text-sm text-muted-foreground">
                    Gráfico saldo vs. tempo — em breve (dados agregados do programa).
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="mb-4 rounded-3xl border border-slate-200 bg-white shadow-sm">
              <CardContent className="space-y-3 p-4">
                <span className="text-xs font-medium text-slate-700">
                  Custo médio vs. valor obtido
                </span>
                <div className="space-y-2 text-[11px] text-slate-600">
                  <p>
                    Custo médio atual:{" "}
                    <span className="font-semibold text-slate-900">
                      {custoMedioMilheiro.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}{" "}
                      / milheiro
                    </span>
                  </p>
                  <p>
                    Melhor emissão recente (exemplo):{" "}
                    <span className="font-semibold text-emerald-700">
                      R$ 34,00 / milheiro
                    </span>{" "}
                    {(((34 - custoMedioMilheiro) / custoMedioMilheiro) * 100).toFixed(
                      1,
                    )}
                    % acima do custo.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm">
              <CardContent className="space-y-3 p-4">
                <span className="text-xs font-medium text-slate-700">
                  Ranking das melhores emissões
                </span>
                <div className="space-y-2 text-[11px]">
                  <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                    <div>
                      <p className="text-slate-900">GRU – MCO Executiva</p>
                      <p className="text-[10px] text-slate-500">
                        {">"} R$ 34/milheiro • ROI +61%
                      </p>
                    </div>
                    <Badge className="rounded-full bg-emerald-100 text-[10px] text-emerald-700 ring-1 ring-emerald-200">
                      Excelente uso
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                    <div>
                      <p className="text-slate-900">GRU – SSA Econômica</p>
                      <p className="text-[10px] text-slate-500">
                        R$ 22/milheiro • ROI +15%
                      </p>
                    </div>
                    <Badge className="rounded-full bg-amber-100 text-[10px] text-amber-700 ring-1 ring-amber-200">
                      Uso moderado
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                    <div>
                      <p className="text-slate-900">CGH – SDU Ponte aérea</p>
                      <p className="text-[10px] text-slate-500">
                        R$ 15/milheiro • ROI -10%
                      </p>
                    </div>
                    <Badge className="rounded-full bg-red-100 text-[10px] text-red-700 ring-1 ring-red-200">
                      Abaixo do custo
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Modal entrada */}
      <Dialog open={movimentoDetalheOpen} onOpenChange={setMovimentoDetalheOpen}>
        <DialogContent className="max-w-md border-slate-800 bg-slate-950 text-slate-100">
          <DialogHeader>
            <DialogTitle>Detalhes da movimentação</DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Informações completas da movimentação selecionada.
            </DialogDescription>
          </DialogHeader>
          {movimentoSelecionado && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-slate-900 p-3">
                  <p className="text-slate-400">Data</p>
                  <p className="font-semibold text-slate-100">
                    {movimentoSelecionado.data}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-900 p-3">
                  <p className="text-slate-400">Tipo</p>
                  <p
                    className={cn(
                      "font-semibold",
                      movimentoSelecionado.tipo === "entrada"
                        ? "text-emerald-300"
                        : "text-red-300",
                    )}
                  >
                    {movimentoSelecionado.tipo === "entrada"
                      ? "Entrada"
                      : "Saída"}
                  </p>
                </div>
              </div>

              <div className="rounded-xl bg-slate-900 p-3">
                <p className="text-slate-400">Descrição</p>
                <p className="font-semibold text-slate-100">
                  {movimentoSelecionado.descricao}
                </p>
              </div>

              <div className="rounded-xl bg-slate-900 p-3">
                <p className="text-slate-400">Milhas</p>
                <p
                  className={cn(
                    "font-semibold",
                    movimentoSelecionado.milhas >= 0
                      ? "text-emerald-300"
                      : "text-red-300",
                  )}
                >
                  {movimentoSelecionado.milhas >= 0 ? "+" : "-"}{" "}
                  {Math.abs(movimentoSelecionado.milhas).toLocaleString("pt-BR")}
                </p>
              </div>

              {movimentoSelecionado.tipo === "entrada" && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-slate-900 p-3">
                    <p className="text-slate-400">Tipo de entrada</p>
                    <p className="font-semibold text-slate-100">
                      {movimentoSelecionado.entradaTipo ?? "-"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-900 p-3">
                    <p className="text-slate-400">Valor pago</p>
                    <p className="font-semibold text-slate-100">
                      {(movimentoSelecionado.valorPago ?? 0).toLocaleString(
                        "pt-BR",
                        {
                          style: "currency",
                          currency: "BRL",
                        },
                      )}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-900 p-3 col-span-2">
                    <p className="text-slate-400">Validade do lote</p>
                    <p className="font-semibold text-slate-100">
                      {movimentoSelecionado.validadeLote ?? "-"}
                    </p>
                  </div>
                </div>
              )}

              {movimentoSelecionado.tipo === "saida" && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-slate-900 p-3 col-span-2">
                    <p className="text-slate-400">Código da reserva</p>
                    <p className="font-semibold text-slate-100">
                      {movimentoSelecionado.codigoReserva ?? "-"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-900 p-3">
                    <p className="text-slate-400">Rota</p>
                    <p className="font-semibold text-slate-100">
                      {movimentoSelecionado.origem && movimentoSelecionado.destino
                        ? `${movimentoSelecionado.origem.toUpperCase()} - ${movimentoSelecionado.destino.toUpperCase()}`
                        : "-"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-900 p-3">
                    <p className="text-slate-400">Classe / Pax</p>
                    <p className="font-semibold text-slate-100">
                      {(movimentoSelecionado.classe ?? "-").toUpperCase()} /{" "}
                      {movimentoSelecionado.passageiros ?? "-"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-900 p-3">
                    <p className="text-slate-400">Taxas</p>
                    <p className="font-semibold text-slate-100">
                      {(movimentoSelecionado.taxas ?? 0).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-900 p-3">
                    <p className="text-slate-400">Tarifa pagante</p>
                    <p className="font-semibold text-slate-100">
                      {(movimentoSelecionado.tarifaPagante ?? 0).toLocaleString(
                        "pt-BR",
                        {
                          style: "currency",
                          currency: "BRL",
                        },
                      )}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal entrada */}
      <Dialog open={entradaOpen} onOpenChange={setEntradaOpen}>
        <DialogContent className="max-w-md border-slate-800 bg-slate-950 text-slate-100">
          <DialogHeader>
            <DialogTitle>Entrada de milhas</DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Registre compras, transferências, bônus ou ajustes. O custo médio
              será recalculado automaticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-xs">
            <div>
              <p className="mb-1 text-[11px] text-slate-300">Tipo</p>
              <div className="grid grid-cols-3 gap-1.5">
                {["compra", "transferencia", "bonus", "clube", "ajuste"].map(
                  (tipo) => (
                    <button
                      key={tipo}
                      type="button"
                      onClick={() => setEntradaTipo(tipo)}
                      className={cn(
                        "rounded-full border px-2 py-1 capitalize",
                        entradaTipo === tipo
                          ? "border-emerald-400 bg-emerald-500/10 text-emerald-200"
                          : "border-slate-800 bg-slate-900 text-slate-300",
                      )}
                    >
                      {tipo}
                    </button>
                  ),
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-1 text-[11px] text-slate-300">
                  Quantidade de milhas
                </p>
                <Input
                  type="number"
                  value={entradaQuantidade || ""}
                  onChange={(event) =>
                    setEntradaQuantidade(Number(event.target.value) || 0)
                  }
                  className="no-spinner h-9 border-slate-800 bg-slate-900 text-xs"
                  min={0}
                />
              </div>
              <div>
                <p className="mb-1 text-[11px] text-slate-300">
                  Valor pago (R$)
                </p>
                <Input
                  type="number"
                  value={entradaValorPago || ""}
                  onChange={(event) =>
                    setEntradaValorPago(Number(event.target.value) || 0)
                  }
                  className="no-spinner h-9 border-slate-800 bg-slate-900 text-xs"
                  min={0}
                />
              </div>
            </div>

            <div className="rounded-xl bg-slate-900 p-3 text-[11px] text-slate-300">
              Custo do milheiro nessa operação:{" "}
              <span className="font-semibold text-emerald-300">
                {custoMilheiroOperacao.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
                {" / 1.000 milhas"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-1 text-[11px] text-slate-300">Data</p>
                <DatePickerField
                  value={entradaData}
                  onChange={setEntradaData}
                  placeholder="Escolher data"
                  triggerClassName="h-9 border-slate-800 bg-slate-900 text-xs text-slate-100 hover:bg-slate-800 hover:text-slate-100"
                  contentClassName="border-slate-700"
                />
              </div>
              <div>
                <p className="mb-1 text-[11px] text-slate-300">
                  Validade do lote
                </p>
                <Select
                  value={entradaValidadeOpcao}
                  onValueChange={(value) =>
                    setEntradaValidadeOpcao(value as EntradaValidadeOpcao)
                  }
                >
                  <SelectTrigger className="h-9 border-slate-800 bg-slate-900 text-xs">
                    <SelectValue placeholder="Selecione a validade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6m">6 meses</SelectItem>
                    <SelectItem value="12m">12 meses</SelectItem>
                    <SelectItem value="24m">24 meses</SelectItem>
                    <SelectItem value="36m">36 meses</SelectItem>
                    <SelectItem value="60m">60 meses</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {entradaValidadeOpcao === "manual" && (
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <p className="mb-1 text-[11px] text-slate-300">
                    Validade manual (data)
                  </p>
                  <DatePickerField
                    value={entradaValidadeLote}
                    onChange={setEntradaValidadeLote}
                    placeholder="Escolher data"
                    triggerClassName="h-9 border-slate-800 bg-slate-900 text-xs text-slate-100 hover:bg-slate-800 hover:text-slate-100"
                    contentClassName="border-slate-700"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3">
              <div>
                <p className="mb-1 text-[11px] text-slate-300">Observações</p>
                <Input
                  value={entradaObs}
                  onChange={(event) => setEntradaObs(event.target.value)}
                  className="h-9 border-slate-800 bg-slate-900 text-xs"
                  placeholder="Promoção, parceiro, etc."
                />
              </div>
            </div>

            <div className="mt-1 rounded-2xl bg-slate-900/80 p-3 text-[11px] text-slate-400">
              <p className="mb-1 font-medium text-slate-200">
                Novo custo médio projetado
              </p>
              <p>
                Atual:{" "}
                <span className="font-semibold text-slate-100">
                  {custoMedioMilheiro.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}{" "}
                  / milheiro
                </span>
              </p>
              <p>
                Projetado:{" "}
                <span className="font-semibold text-emerald-300">
                  {novoCustoMedioPonderado.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}{" "}
                  / milheiro
                </span>
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs text-slate-300 hover:bg-slate-900"
                onClick={() => setEntradaOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-emerald-500 text-xs font-medium text-emerald-950 hover:bg-emerald-400"
                onClick={handleSalvarEntrada}
              >
                Salvar entrada
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal saída / emissão */}
      <Dialog open={saidaOpen} onOpenChange={setSaidaOpen}>
        <DialogContent className="max-w-md border-slate-800 bg-slate-950 text-slate-100">
          <DialogHeader>
            <DialogTitle>Saída de milhas (emissão)</DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Registre a emissão completa para medir o ROI real de cada voo.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[70vh] pr-2">
            <div className="space-y-4 pb-2 text-xs">
              {/* 1. Informações da emissão */}
              <div className="space-y-2 rounded-2xl bg-slate-900/70 p-3">
                <p className="text-[11px] font-medium text-slate-300">
                  1. Informações da emissão
                </p>
                <Input
                  value={emitDescricao}
                  onChange={(event) => setEmitDescricao(event.target.value)}
                  placeholder="Ex: GRU – MCO Executiva férias família"
                  className="h-8 border-slate-800 bg-slate-950 text-xs"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={emitOrigem}
                    onChange={(event) => setEmitOrigem(event.target.value)}
                    placeholder="Origem (GRU)"
                    className="h-8 border-slate-800 bg-slate-950 text-xs"
                  />
                  <Input
                    value={emitDestino}
                    onChange={(event) => setEmitDestino(event.target.value)}
                    placeholder="Destino (MCO)"
                    className="h-8 border-slate-800 bg-slate-950 text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <p className="mb-1 text-[11px] text-slate-300">Tipo de viagem</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEmitTipoViagem("somente_ida")}
                        className={cn(
                          "rounded-full border px-2 py-1 text-[11px]",
                          emitTipoViagem === "somente_ida"
                            ? "border-violet-400 bg-violet-500/10 text-violet-200"
                            : "border-slate-800 bg-slate-900 text-slate-300",
                        )}
                      >
                        Apenas ida
                      </button>
                      <button
                        type="button"
                        onClick={() => setEmitTipoViagem("ida_e_volta")}
                        className={cn(
                          "rounded-full border px-2 py-1 text-[11px]",
                          emitTipoViagem === "ida_e_volta"
                            ? "border-violet-400 bg-violet-500/10 text-violet-200"
                            : "border-slate-800 bg-slate-900 text-slate-300",
                        )}
                      >
                        Ida e volta
                      </button>
                    </div>
                  </div>
                  <DatePickerField
                    value={emitDataIda}
                    onChange={(ymd) => {
                      setEmitDataIda(ymd);
                      if (emitDataVolta && emitDataVolta < ymd) setEmitDataVolta("");
                    }}
                    placeholder="Data de ida"
                    triggerClassName="h-8 border-slate-800 bg-slate-950 px-2.5 text-xs text-slate-100 hover:bg-slate-900 hover:text-slate-100"
                    contentClassName="border-slate-700"
                  />
                  {emitTipoViagem === "ida_e_volta" ? (
                    <DatePickerField
                      value={emitDataVolta}
                      onChange={setEmitDataVolta}
                      placeholder="Data de volta"
                      disabled={
                        emitDataIda
                          ? { before: parseYmdToLocalDate(emitDataIda)! }
                          : undefined
                      }
                      triggerClassName="h-8 border-slate-800 bg-slate-950 px-2.5 text-xs text-slate-100 hover:bg-slate-900 hover:text-slate-100"
                      contentClassName="border-slate-700"
                    />
                  ) : (
                    <Input
                      type="number"
                      min={1}
                      value={emitPax}
                      onChange={(event) => setEmitPax(Number(event.target.value) || 1)}
                      className="h-8 border-slate-800 bg-slate-950 text-xs"
                      placeholder="Qtd. passageiros"
                    />
                  )}
                </div>
                {emitTipoViagem === "ida_e_volta" && (
                  <Input
                    type="number"
                    min={1}
                    value={emitPax}
                    onChange={(event) => setEmitPax(Number(event.target.value) || 1)}
                    className="h-8 border-slate-800 bg-slate-950 text-xs"
                    placeholder="Qtd. passageiros"
                  />
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Select value={emitClasse} onValueChange={setEmitClasse}>
                    <SelectTrigger className="h-8 border-slate-800 bg-slate-950 text-xs">
                      <SelectValue placeholder="Classe" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="economica">Econômica</SelectItem>
                      <SelectItem value="premium">Premium</SelectItem>
                      <SelectItem value="executiva">Executiva</SelectItem>
                      <SelectItem value="primeira">Primeira</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex items-center gap-1 text-[11px] text-slate-300">
                      <input
                        type="checkbox"
                        checked={emitBagagem}
                        onChange={(event) => setEmitBagagem(event.target.checked)}
                        className="h-3 w-3 rounded border-slate-700 bg-slate-900 text-violet-500"
                      />
                      Bagagem
                    </label>
                    <label className="inline-flex items-center gap-1 text-[11px] text-slate-300">
                      <input
                        type="checkbox"
                        checked={emitAssento}
                        onChange={(event) => setEmitAssento(event.target.checked)}
                        className="h-3 w-3 rounded border-slate-700 bg-slate-900 text-violet-500"
                      />
                      Assento
                    </label>
                    <label className="inline-flex items-center gap-1 text-[11px] text-slate-300">
                      <input
                        type="checkbox"
                        checked={emitSeguro}
                        onChange={(event) => setEmitSeguro(event.target.checked)}
                        className="h-3 w-3 rounded border-slate-700 bg-slate-900 text-violet-500"
                      />
                      Seguro
                    </label>
                  </div>
                </div>
                <Input
                  value={emitOutroAdd}
                  onChange={(event) => setEmitOutroAdd(event.target.value)}
                  placeholder="Outros adicionais (opcional)"
                  className="h-8 border-slate-800 bg-slate-950 text-xs"
                />
                <Input
                  value={emitCodigoReserva}
                  onChange={(event) => setEmitCodigoReserva(event.target.value)}
                  placeholder="Código da reserva (ex: ABC123)"
                  className="h-8 border-slate-800 bg-slate-950 text-xs"
                />
              </div>

              {/* 2. Dados financeiros */}
              <div className="space-y-2 rounded-2xl bg-slate-900/70 p-3">
                <p className="text-[11px] font-medium text-slate-300">
                  2. Dados financeiros da emissão
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="mb-1 text-[11px] text-slate-300">
                      Milhas utilizadas *
                    </p>
                    <Input
                      type="number"
                      min={0}
                      value={emitMilhas || ""}
                      onChange={(event) =>
                        setEmitMilhas(Number(event.target.value) || 0)
                      }
                      className="no-spinner h-8 border-slate-800 bg-slate-950 text-xs"
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] text-slate-300">
                      Taxas pagas (R$) *
                    </p>
                    <Input
                      type="number"
                      min={0}
                      value={emitTaxas || ""}
                      onChange={(event) =>
                        setEmitTaxas(Number(event.target.value) || 0)
                      }
                      className="no-spinner h-8 border-slate-800 bg-slate-950 text-xs"
                    />
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-[11px] text-slate-300">
                    Tarifa pagante (R$) *
                  </p>
                  <Input
                    type="number"
                    min={0}
                    value={emitTarifaPagante || ""}
                    onChange={(event) =>
                      setEmitTarifaPagante(Number(event.target.value) || 0)
                    }
                    className="no-spinner h-8 border-slate-800 bg-slate-950 text-xs"
                  />
                </div>
              </div>

              {/* 3. Calculadora inteligente */}
              <div className="space-y-2 rounded-2xl bg-slate-900/70 p-3">
                <p className="text-[11px] font-medium text-slate-300">
                  3. Calculadora inteligente de valor do milheiro
                </p>
                <div className="space-y-1 text-[11px] text-slate-400">
                  <p>
                    Base de custo médio do milheiro:{" "}
                    <span className="font-semibold text-slate-100">
                      {custoMedioMilheiroReferencia.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </p>
                  <p>
                    Custo da emissão (milhas + taxas):{" "}
                    <span className="font-semibold text-amber-300">
                      {custoRealEmissaoMilhasETaxas.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </span>
                  </p>
                  <p>
                    Desconto obtido vs tarifa pagante:{" "}
                    <span className="font-semibold text-emerald-300">
                      {descontoReal.toFixed(1)}%
                    </span>
                    {" • "}
                    <span className="font-semibold text-emerald-300">
                      {economiaRealEmissao.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </span>
                  </p>
                </div>
              </div>

              {/* 4. Resumo estratégico */}
              <div className="space-y-2 rounded-2xl bg-slate-900/70 p-3">
                <p className="text-[11px] font-medium text-slate-300">
                  4. Resumo estratégico da emissão
                </p>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="space-y-1 rounded-2xl bg-slate-950/80 p-2">
                    <p className="text-slate-400">Milhas usadas</p>
                    <p className="text-sm font-semibold text-slate-100">
                      {emitMilhas.toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <div className="space-y-1 rounded-2xl bg-slate-950/80 p-2">
                    <p className="text-slate-400">Economia real</p>
                    <p className="text-sm font-semibold text-emerald-300">
                      {economiaRealEmissao.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </p>
                  </div>
                  <div className="space-y-1 rounded-2xl bg-slate-950/80 p-2">
                    <p className="text-slate-400">Valor do milheiro</p>
                    <p className="text-sm font-semibold text-emerald-300">
                      {custoMedioMilheiro.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </p>
                  </div>
                  <div className="space-y-1 rounded-2xl bg-slate-950/80 p-2">
                    <p className="text-slate-400">Desconto real</p>
                    <p className="text-sm font-semibold text-emerald-300">
                      {descontoReal.toFixed(1)}%
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-2xl bg-slate-950/90 px-3 py-2">
                  <div className="text-[11px] text-slate-400">
                    <p>Classificação da emissão</p>
                    <p className={cn("mt-0.5 text-sm font-semibold", corClassificacao)}>
                      {classificacaoEmissao === "vantajosa"
                        ? "🟢 Abaixo do custo da pagante"
                        : "🔴 Mais caro que tarifa pagante"}
                    </p>
                  </div>
                </div>
              </div>

              {/* 5. Observações */}
              <div className="space-y-2 rounded-2xl bg-slate-900/70 p-3">
                <p className="text-[11px] font-medium text-slate-300">
                  5. Observações estratégicas
                </p>
                <Textarea
                  value={emitObs}
                  onChange={(event) => setEmitObs(event.target.value)}
                  rows={3}
                  className="border-slate-800 bg-slate-950 text-xs"
                  placeholder="Insights sobre a emissão, aprendizados, contexto etc."
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs text-slate-300 hover:bg-slate-900"
                  onClick={() => setSaidaOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="bg-red-500 text-xs font-medium text-slate-950 hover:bg-red-400"
                  onClick={handleSalvarSaida}
                >
                  Salvar emissão
                </Button>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={actionPlanFollowupOpen} onOpenChange={setActionPlanFollowupOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Plano de ação</DialogTitle>
            <DialogDescription>
              {actionPlanProgramLabel
                ? `Você finalizou a emissão da passagem que estava no plano de ação. Deseja manter ${actionPlanProgramLabel} como plano de ação para futuras emissões ou tirar do plano de ação?`
                : "Deseja manter este programa no plano de ação para futuras emissões?"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleConfirmActionPlanFollowup(false)}
              disabled={actionPlanFollowupSaving}
            >
              Tirar do plano
            </Button>
            <Button
              type="button"
              onClick={() => void handleConfirmActionPlanFollowup(true)}
              disabled={actionPlanFollowupSaving}
            >
              Manter no plano
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LoyaltyProgramDetails;

