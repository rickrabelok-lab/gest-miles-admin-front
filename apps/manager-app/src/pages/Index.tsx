import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  Download,
  Plus,
  X,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DashboardHeader from "@/components/DashboardHeader";
import BalanceTabs from "@/components/BalanceTabs";
import ProgramCard from "@/components/ProgramCard";
import DestinationCarousel from "@/components/DestinationCarousel";
import BonusOffersSection from "@/components/bonus/BonusOffersSection";
import BottomNav from "@/components/BottomNav";
import SmartRedemptionSuggestions from "@/components/SmartRedemptionSuggestions";
import NpsClientePrompt from "@/components/nps/NpsClientePrompt";
import CsatClientePrompt from "@/components/csat/CsatClientePrompt";
import ClientTimelineSection from "@/components/timeline/ClientTimelineSection";
import ClientInsightsSection from "@/components/insights/ClientInsightsSection";
import AirlineLogo from "@/components/AirlineLogo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useProgramasCliente } from "@/hooks/useProgramasCliente";
import { useGestor } from "@/hooks/useGestor";
import { useVincularCliente } from "@/hooks/useVincularCliente";
import { useReunioesNotificacoes } from "@/hooks/useReunioesNotificacoes";
import { supabase } from "@/lib/supabase";
import { homePathForRole } from "@/lib/homeRoute";
import { CARD_DESTINATION_TO_AIRPORT_CODE } from "@/lib/airports";
import { parseYmdToLocalDate } from "@/lib/dateYmd";
import airlineLatamLogo from "@/assets/airline-latam.png";
import airlineAzulLogo from "@/assets/airline-azul.png";
import airlineGolLogo from "@/assets/airline-gol.png";
import programAviosLogo from "@/assets/program-avios.svg";

const STORAGE_PREFIX = "mile-manager:program-state:";
const LOGO_STORAGE_PREFIX = "mile-manager:program-logo:";
const PROGRAM_CARDS_STORAGE_KEY = "mile-manager:program-cards";
const MIGRATION_FLAG_PREFIX = "mile-manager:migration:v1:";
const MANAGER_ACCESSED_CLIENTS_PREFIX = "mile-manager:manager-accessed-clients:";
const ORIGINS_STORAGE_PREFIX = "mile-manager:enabled-origins:";
const DEFAULT_ENABLED_ORIGINS = ["BHZ", "SAO", "RIO", "BSB"];

/** SQL para permitir que o gestor salve o plano de ação do cliente (rodar no Supabase SQL Editor). */
const PERFIS_GESTOR_UPDATE_SQL = `-- Permite que o gestor atualize (e crie) o perfil dos clientes que ele gerencia.
-- No Supabase: SQL Editor > New query > Cole este bloco > Run.

create or replace function public.can_manage_client(target_cliente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    auth.uid() = target_cliente_id
    or public.is_legacy_platform_admin()
    or exists (
      select 1
      from public.cliente_gestores cg
      where cg.gestor_id = auth.uid()
        and cg.cliente_id = target_cliente_id
    )
    -- legado (se a tabela ainda existir)
    or exists (
      select 1
      from public.gestor_clientes gc
      where gc.gestor_id = auth.uid()
        and gc.cliente_id = target_cliente_id
    )
    -- CS que consegue visualizar o cliente também pode atualizar o perfil
    -- (necessário para salvar/remover Plano de Ação).
    or public.can_cs_view_client(target_cliente_id)
    -- admin de equipe (mesma equipe via perfis.equipe_id)
    or exists (
      select 1
      from public.perfis me
      join public.perfis c on c.equipe_id is not distinct from me.equipe_id
      where me.usuario_id = auth.uid()
        and me.role = 'admin'
        and me.equipe_id is not null
        and c.usuario_id = target_cliente_id
        and c.equipe_id is not null
    ),
    false
  );
$$;

-- Restaurar policy de UPDATE no formato esperado nas migrations recentes.
-- Isso evita perder permissões que podem ser necessárias quando o token é de CS/admin de equipe.
drop policy if exists perfis_update_own_or_gestor_or_admin on public.perfis;
create policy perfis_update_own_or_gestor_or_admin on public.perfis
  for update
  using (
    auth.uid() = usuario_id
    or public.is_legacy_platform_admin()
    or public.team_admin_sees_perfil(usuario_id)
    or public.can_manage_client(usuario_id)
    or public.cs_can_access_gestor(usuario_id)
  )
  with check (
    auth.uid() = usuario_id
    or public.is_legacy_platform_admin()
    or public.team_admin_sees_perfil(usuario_id)
    or public.can_manage_client(usuario_id)
    or public.cs_can_access_gestor(usuario_id)
  );
`;

type SelectedDestinationSearch = {
  code: string;
  name: string;
};

type ProgramCardData = {
  programId: string;
  name: string;
  logo: string;
  logoColor: string;
  logoImageUrl?: string;
  balance: string;
  valueInBRL: string;
  lastUpdate: string;
  variation: "up" | "down" | "none";
  error?: string;
  expiring?: boolean;
  expiringTag?: "-90d" | "-60d" | "-30d";
};

type MovimentoTipo = "entrada" | "saida";

type PersistedProgramState = {
  saldo?: number;
  custoMedioMilheiro?: number;
  movimentos?: Array<{
    id?: string;
    data?: string;
    tipo?: MovimentoTipo;
    descricao?: string;
    lucrativa?: boolean;
    validadeLote?: string;
    milhas?: number;
    valorPago?: number;
    taxas?: number;
    tarifaPagante?: number;
    economiaReal?: number;
    custoMilheiroBase?: number;
    origem?: string;
    destino?: string;
    classe?: string;
    passageiros?: number;
    entradaTipo?: string;
  }>;
  lotes?: Array<{
    validadeLote?: string;
    quantidade?: number;
  }>;
};

type ProgramMeta = {
  slug: string;
  name: string;
  logo: string;
  logoColor: string;
};

type ActionPlanDemandRow = {
  id: number;
  tipo: string;
  status: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};

type ActionPlanDemandItem = {
  id: number;
  origem: string | null;
  destino: string;
  status: string;
  createdAt: string;
};

const ACTION_PLAN_PROGRAM_LABELS = [
  ["latam", "Latam Pass"],
  ["azul", "Tudo Azul"],
  ["smiles", "Smiles"],
  ["avios", "Avios"],
] as const;

type ActionPlanProgramKey = (typeof ACTION_PLAN_PROGRAM_LABELS)[number][0];

const ACTION_PLAN_PROGRAM_ICON_BY_KEY: Partial<Record<ActionPlanProgramKey, string>> = {
  latam: airlineLatamLogo,
  azul: airlineAzulLogo,
  smiles: airlineGolLogo,
  avios: programAviosLogo,
};
const ACTION_PLAN_AIRLINE_BY_KEY: Partial<Record<ActionPlanProgramKey, string>> = {
  latam: "LATAM",
  azul: "AZUL",
  smiles: "GOL",
};

const DEMAND_STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
};
const ACTION_PLAN_BUTTON_MAX_ICONS = 3;

type DemandGestorOption = {
  id: string;
  nome: string;
  perfil: "nacional" | "internacional";
};

type VencimentoItem = {
  programSlug: string;
  programName: string;
  programLogo: string;
  programLogoColor: string;
  data: string;
  diasRestantes: number;
  quantidade: number;
};

type ExtratoItem = {
  id: string;
  programSlug: string;
  programName: string;
  programLogo: string;
  programLogoColor: string;
  data: string;
  tipo: MovimentoTipo;
  descricao: string;
  milhas: number;
};

type EmissaoEconomiaItem = {
  id: string;
  programName: string;
  programLogo: string;
  programLogoColor: string;
  data: string;
  descricao: string;
  milhas: number;
  tarifaPagante: number;
  custoReal: number;
  economiaReal: number;
};

type CompraPontosItem = {
  id: string;
  programName: string;
  programLogo: string;
  programLogoColor: string;
  data: string;
  milhas: number;
  valorPago: number;
  custoMilheiro: number;
  descricao: string;
};

const PROGRAM_META_MAP: Record<string, Omit<ProgramMeta, "slug">> = {
  "latam-pass": { name: "LATAM Pass", logo: "LP", logoColor: "#1a3a6b" },
  livelo: { name: "Livelo", logo: "Lv", logoColor: "#e91e63" },
  esfera: { name: "Esfera", logo: "Es", logoColor: "#333333" },
  smiles: { name: "Smiles", logo: "Sm", logoColor: "#f59e42" },
  kmv: { name: "KMV", logo: "KM", logoColor: "#2e7d32" },
};

const slugify = (name: string) => name.toLowerCase().replace(/\s+/g, "-");

const prettyNameFromSlug = (slug: string) =>
  slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const getProgramMetaFromSlug = (slug: string): ProgramMeta => {
  const known = PROGRAM_META_MAP[slug];
  if (known) return { slug, ...known };

  const name = prettyNameFromSlug(slug);
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return {
    slug,
    name,
    logo: initials || "PG",
    logoColor: "#64748b",
  };
};

const parseBrDate = (value?: string) => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(`${value}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (/^\d{2}\/\d{2}\/\d{2,4}$/.test(value)) {
    const [dd, mm, yy] = value.split("/");
    const year = yy.length === 2 ? Number(`20${yy}`) : Number(yy);
    const d = new Date(year, Number(mm) - 1, Number(dd));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
};

const AVAILABLE_PROGRAM_OPTIONS: Array<{
  programId: string;
  name: string;
  logo: string;
  logoColor: string;
}> = [
  {
    programId: "latam-pass",
    name: "Latam Pass",
    logo: "LP",
    logoColor: "#1a3a6b",
  },
  {
    programId: "livelo",
    name: "Livelo",
    logo: "Lv",
    logoColor: "#e91e63",
  },
  {
    programId: "esfera",
    name: "Esfera",
    logo: "Es",
    logoColor: "#333333",
  },
  {
    programId: "smiles",
    name: "Smiles",
    logo: "Sm",
    logoColor: "#f59e42",
  },
  {
    programId: "iberia",
    name: "Ibéria",
    logo: "IB",
    logoColor: "#b91c1c",
  },
  {
    programId: "tudo-azul",
    name: "Tudo azul",
    logo: "TA",
    logoColor: "#1d4ed8",
  },
  {
    programId: "finnair",
    name: "Finnair",
    logo: "FN",
    logoColor: "#2563eb",
  },
  {
    programId: "qatar-airways",
    name: "Qatar Airways",
    logo: "QA",
    logoColor: "#5a1f3d",
  },
  {
    programId: "british-airways",
    name: "British Airways",
    logo: "BA",
    logoColor: "#0f2f6d",
  },
  {
    programId: "coopera",
    name: "Coopera",
    logo: "CP",
    logoColor: "#2d6a4f",
  },
];

const basePrograms: ProgramCardData[] = AVAILABLE_PROGRAM_OPTIONS.filter((option) =>
  ["latam-pass", "livelo", "esfera", "smiles", "iberia", "tudo-azul"].includes(
    option.programId,
  ),
).map((option) => ({
  programId: option.programId,
  name: option.name,
  logo: option.logo,
  logoColor: option.logoColor,
  balance: "0",
  valueInBRL: "0",
  lastUpdate: "CPM",
  variation: "none" as const,
}));

const getProgramInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "PG";

const normalizeProgramCards = (value: unknown): ProgramCardData[] => {
  if (!Array.isArray(value)) return basePrograms;
  const validIds = new Set(AVAILABLE_PROGRAM_OPTIONS.map((option) => option.programId));

  const normalized = value
    .map((item): ProgramCardData | null => {
      if (!item || typeof item !== "object") return null;
      const candidate = item as Partial<ProgramCardData>;
      if (
        typeof candidate.programId !== "string" ||
        typeof candidate.name !== "string"
      ) {
        return null;
      }
      if (!validIds.has(candidate.programId)) {
        return null;
      }

      return {
        programId: candidate.programId,
        name: candidate.name,
        logo: typeof candidate.logo === "string" ? candidate.logo : getProgramInitials(candidate.name),
        logoColor:
          typeof candidate.logoColor === "string" ? candidate.logoColor : "#64748b",
        logoImageUrl:
          typeof candidate.logoImageUrl === "string"
            ? candidate.logoImageUrl
            : undefined,
        balance: typeof candidate.balance === "string" ? candidate.balance : "0",
        valueInBRL: typeof candidate.valueInBRL === "string" ? candidate.valueInBRL : "0",
        lastUpdate:
          typeof candidate.lastUpdate === "string" ? candidate.lastUpdate : "CPM",
        variation:
          candidate.variation === "up" ||
          candidate.variation === "down" ||
          candidate.variation === "none"
            ? candidate.variation
            : "none",
        error: typeof candidate.error === "string" ? candidate.error : undefined,
        expiring: Boolean(candidate.expiring),
        expiringTag:
          candidate.expiringTag === "-30d" ||
          candidate.expiringTag === "-60d" ||
          candidate.expiringTag === "-90d"
            ? candidate.expiringTag
            : undefined,
      };
    })
    .filter((item): item is ProgramCardData => !!item);

  return normalized.length > 0 ? normalized : basePrograms;
};

const Index = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const { role, user } = useAuth();
  const { resumo: reunioesResumoDia } = useReunioesNotificacoes(
    role === "gestor" || role === "cs" || role === "admin",
  );
  const managerClientIdParam = searchParams.get("clientId");
  const managerClientId =
    role === "gestor" || role === "admin" || role === "cs"
      ? managerClientIdParam
      : null;

  // Contexto de "visualização do cliente" usado pelos tabs avançados.
  // - gestor/cs/admin: precisa do `clientId` na querystring
  // - cliente_gestao: o cliente visualizado é o próprio usuário
  const advancedClientId = role === "cliente_gestao" ? user?.id ?? null : managerClientId;
  const canShowTimeline =
    role === "gestor" || role === "admin" || role === "cs"
      ? !!managerClientId
      : role === "cliente_gestao"
        ? !!user?.id
        : false;

  // Insights apenas para gestor/cs/admin (cliente_gestao pode ficar só no Timeline, por segurança/UX).
  const canShowInsights = role === "gestor" || role === "admin" || role === "cs" ? !!managerClientId : false;

  // Apenas gestores/CS/admin podem editar (incluir/remover) Plano de Ação.
  const canEditActionPlan = role === "gestor" || role === "cs" || role === "admin";
  /** CS só entra em modo gestor quando há clientId (acompanhar cliente); gestor/admin veem o painel ampliado na home. */
  const managerMode =
    role === "gestor" ||
    role === "admin" ||
    (role === "cs" && !!managerClientIdParam);
  const demandTargetClientId = managerClientId ?? user?.id ?? null;
  // Usado para controlar quando o botão/ícones do Plano de Ação devem aparecer.
  const showActionPlanButton = !managerMode || !!managerClientId;

  useEffect(() => {
    if (!role || reunioesResumoDia.total <= 0) return;
    if (typeof window === "undefined") return;
    const todayKey = new Date().toISOString().slice(0, 10);
    const storageKey = `mile-manager:agenda-notified:${todayKey}:${role}`;
    if (window.localStorage.getItem(storageKey)) return;
    const horarios = reunioesResumoDia.horarios.join(", ");
    toast.info(
      `Você tem ${reunioesResumoDia.total} reunião(ões) hoje${horarios ? `: ${horarios}` : "."}`,
      { duration: 6000 },
    );
    window.localStorage.setItem(storageKey, "1");
  }, [reunioesResumoDia.total, reunioesResumoDia.horarios, role]);
  const [activeTab, setActiveTab] = useState("saldo");
  const [activeNav, setActiveNav] = useState("programas");
  const [showAll, setShowAll] = useState(false);
  const [programDefs, setProgramDefs] = useState<ProgramCardData[]>(basePrograms);
  const [programs, setPrograms] = useState<ProgramCardData[]>(basePrograms);
  const [economiaPeriodoMeses, setEconomiaPeriodoMeses] = useState<1 | 6 | 12>(12);
  const [isAddProgramMenuOpen, setIsAddProgramMenuOpen] = useState(false);
  const [isActionPlanDialogOpen, setIsActionPlanDialogOpen] = useState(false);
  const [isDemandDialogOpen, setIsDemandDialogOpen] = useState(false);
  const [demandType, setDemandType] = useState<"emissao" | "outros">("emissao");
  const [demandSubmitting, setDemandSubmitting] = useState(false);
  const [demandaOrigem, setDemandaOrigem] = useState("");
  const [demandaDestino, setDemandaDestino] = useState("");
  const [demandaDataIda, setDemandaDataIda] = useState("");
  const [demandaDataVolta, setDemandaDataVolta] = useState("");
  const [demandaPassageiros, setDemandaPassageiros] = useState(1);
  const [demandaClasse, setDemandaClasse] = useState("");
  const [demandaBagagemDescricao, setDemandaBagagemDescricao] = useState("");
  const [demandaAssentoDescricao, setDemandaAssentoDescricao] = useState("");
  const [demandaFlexDatas, setDemandaFlexDatas] = useState<"sim" | "nao">("nao");
  const [demandaOutrosDetalhes, setDemandaOutrosDetalhes] = useState("");
  const [demandaEscopo, setDemandaEscopo] = useState<"nacional" | "internacional">("nacional");
  const [demandaGestores, setDemandaGestores] = useState<DemandGestorOption[]>([]);
  const [demandaGestorId, setDemandaGestorId] = useState("");
  const [isClientesAtivosOpen, setIsClientesAtivosOpen] = useState(false);
  const [isClientesVencendoOpen, setIsClientesVencendoOpen] = useState(false);
  const [vincularIdInput, setVincularIdInput] = useState("");
  const [actionPlanProgramKeys, setActionPlanProgramKeys] = useState<ActionPlanProgramKey[]>([]);
  const [actionPlanDemands, setActionPlanDemands] = useState<ActionPlanDemandItem[]>([]);
  const [actionPlanSaving, setActionPlanSaving] = useState(false);
  const [actionPlanError, setActionPlanError] = useState<string | null>(null);
  const [optionLogoImages, setOptionLogoImages] = useState<Record<string, string>>(
    {},
  );
  const [enabledOrigins, setEnabledOrigins] = useState<string[]>(DEFAULT_ENABLED_ORIGINS);
  const [accessedClientsVersion, setAccessedClientsVersion] = useState(0);
  const [selectedPlanoProgramKey, setSelectedPlanoProgramKey] = useState<ActionPlanProgramKey | null>(null);
  const [showPlanoAcaoPermissionHelp, setShowPlanoAcaoPermissionHelp] = useState(false);
  const economiaReportRef = useRef<HTMLDivElement | null>(null);
  const vencendoSectionRef = useRef<HTMLDivElement | null>(null);
  const {
    byProgramId: remoteByProgramId,
    data: remotePrograms,
    saveProgramState,
  } =
    useProgramasCliente(managerClientId);
  const {
    resumoClientes,
    linkedClientIds,
    kpis: gestorKpis,
    demandasGestor,
    planosAcaoPorPrograma,
    vencimentosTodosClientes,
  } = useGestor(
    managerMode,
    useMemo(() => {
      const ids = new Set<string>();
      if (managerClientId) ids.add(managerClientId);
      if (!managerMode || !user?.id || typeof window === "undefined") {
        return Array.from(ids);
      }
      ids.add(user.id);
      const key = `${MANAGER_ACCESSED_CLIENTS_PREFIX}${user.id}`;
      const raw = window.localStorage.getItem(key);
      if (raw) {
        try {
          const list = JSON.parse(raw) as Array<{ id?: string }>;
          if (Array.isArray(list)) {
            list.forEach((item) => {
              if (typeof item?.id === "string" && item.id.trim()) {
                ids.add(item.id);
              }
            });
          }
        } catch {
          // ignora lista inválida
        }
      }
      return Array.from(ids);
    }, [managerMode, managerClientId, user?.id, accessedClientsVersion]),
  );
  const managerClientName = managerClientId
    ? resumoClientes.find((cliente) => cliente.clienteId === managerClientId)?.nome ?? null
    : null;
  const { vincular, desvincular, isVincularLoading, isDesvincularLoading, getErrorMessage } =
    useVincularCliente(
      role === "gestor" || role === "admin" ? user?.id : undefined,
    );

  // Cliente: só dados do próprio user.id (nunca "anonymous"). Gestor: pode ver cliente ou "anonymous" antes de login.
  const dataOwnerId: string | null =
    role === "gestor" || role === "admin"
      ? managerClientId ?? user?.id ?? "anonymous"
      : role === "cs"
        ? managerClientId ?? user?.id ?? null
        : user?.id ?? null;

  useEffect(() => {
    if (typeof window === "undefined" || !dataOwnerId) {
      if (!dataOwnerId) setEnabledOrigins(DEFAULT_ENABLED_ORIGINS);
      return;
    }
    const key = `${ORIGINS_STORAGE_PREFIX}${dataOwnerId}`;
    const raw = window.localStorage.getItem(key);

    if (!raw) {
      setEnabledOrigins(DEFAULT_ENABLED_ORIGINS);
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setEnabledOrigins(DEFAULT_ENABLED_ORIGINS);
        return;
      }

      const sanitized = parsed
        .map((item) => String(item).trim().toUpperCase())
        .filter(Boolean);
      setEnabledOrigins(sanitized.length > 0 ? sanitized : DEFAULT_ENABLED_ORIGINS);
    } catch {
      setEnabledOrigins(DEFAULT_ENABLED_ORIGINS);
    }
  }, [dataOwnerId]);

  const gestorScore = useMemo(() => {
    if (!managerMode || !gestorKpis) return 0;
    const economiaMediaGerada = gestorKpis.roiMedio;
    // Escala linear: 35.000 de economia média => score 1.000.
    return Math.round(
      Math.min(1000, Math.max(0, (economiaMediaGerada / 35000) * 1000)),
    );
  }, [managerMode, gestorKpis]);

  const clientesComVencendo90d = useMemo(
    () =>
      resumoClientes
        .filter((c) => c.pontosVencendo90d > 0)
        .sort((a, b) => b.pontosVencendo90d - a.pontosVencendo90d),
    [resumoClientes],
  );
  const demandasPendentes = useMemo(
    () => demandasGestor.filter((d) => d.status === "pendente").length,
    [demandasGestor],
  );
  const demandasEmAndamento = useMemo(
    () => demandasGestor.filter((d) => d.status === "em_andamento").length,
    [demandasGestor],
  );

  const handleOpenManagerClient = (clientId: string) => {
    if (managerMode && user?.id && typeof window !== "undefined") {
      const key = `${MANAGER_ACCESSED_CLIENTS_PREFIX}${user.id}`;
      const raw = window.localStorage.getItem(key);
      let list: Array<{ id: string; name?: string }> = [];
      if (raw) {
        try {
          list = JSON.parse(raw);
          if (!Array.isArray(list)) list = [];
        } catch {
          list = [];
        }
      }
      const exists = list.some((item) => item.id === clientId);
      if (!exists) {
        const knownName = resumoClientes.find((c) => c.clienteId === clientId)?.nome;
        list.push({ id: clientId, name: knownName });
        window.localStorage.setItem(key, JSON.stringify(list));
        setAccessedClientsVersion((v) => v + 1);
      }
    }
    const query = new URLSearchParams(searchParams);
    query.set("clientId", clientId);
    navigate(`/?${query.toString()}`);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!dataOwnerId) {
      setProgramDefs(basePrograms);
      setPrograms(basePrograms);
      return;
    }
    const key = `${PROGRAM_CARDS_STORAGE_KEY}${dataOwnerId}`;
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      setProgramDefs(basePrograms);
      setPrograms(basePrograms);
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      const normalized = normalizeProgramCards(parsed);
      setProgramDefs(normalized);
      setPrograms(normalized);
    } catch {
      setProgramDefs(basePrograms);
      setPrograms(basePrograms);
    }
  }, [dataOwnerId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!dataOwnerId) {
      setOptionLogoImages({});
      return;
    }

    const hydrateOptionLogos = () => {
      const next: Record<string, string> = {};
      AVAILABLE_PROGRAM_OPTIONS.forEach((option) => {
        const stored = window.localStorage.getItem(
          `${LOGO_STORAGE_PREFIX}${dataOwnerId}:${option.programId}`,
        );
        if (stored) next[option.programId] = stored;
      });
      setOptionLogoImages(next);
    };

    hydrateOptionLogos();
    window.addEventListener("storage", hydrateOptionLogos);
    return () => window.removeEventListener("storage", hydrateOptionLogos);
  }, [dataOwnerId]);

  useEffect(() => {
    const hydrateProgramsFromStorage = () => {
      if (typeof window === "undefined") return;
      if (!dataOwnerId) {
        setPrograms(basePrograms);
        return;
      }

      const nextPrograms = programDefs.map((program) => {
        const slug = program.programId;
        const nameSlug = slugify(program.name);
        const remoteRow = remoteByProgramId.get(slug);
        const storedLogoImage = window.localStorage.getItem(
          `${LOGO_STORAGE_PREFIX}${dataOwnerId}:${slug}`,
        );
        const storageKey = `${STORAGE_PREFIX}${dataOwnerId}:${slug}:${nameSlug}`;
        const raw = window.localStorage.getItem(storageKey);
        const remoteRaw = remoteRow?.state
          ? JSON.stringify(remoteRow.state)
          : null;
        const sourceRaw = remoteRaw ?? raw;

        if (!sourceRaw) {
          return {
            ...program,
            logoImageUrl:
              remoteRow?.logo_image_url ?? storedLogoImage ?? undefined,
          };
        }

        try {
          const parsed = JSON.parse(sourceRaw) as PersistedProgramState;
          const saldo = typeof parsed.saldo === "number" ? parsed.saldo : 0;
          const custoMedio =
            typeof parsed.custoMedioMilheiro === "number"
              ? parsed.custoMedioMilheiro
              : 0;
          const hoje = new Date();
          hoje.setHours(0, 0, 0, 0);
          const expiringDays = (parsed.movimentos ?? [])
            .filter((mov) => mov.tipo === "entrada" && !!mov.validadeLote && (mov.milhas ?? 0) > 0)
            .map((mov) => {
              const validade = new Date(`${mov.validadeLote}T00:00:00`);
              return Math.ceil(
                (validade.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24),
              );
            })
            .filter((days) => days >= 0 && days <= 90);

          const hasExpiringMiles = expiringDays.length > 0;
          const nearestExpiringDays = hasExpiringMiles
            ? Math.min(...expiringDays)
            : null;
          const expiringTag: ProgramCardData["expiringTag"] =
            nearestExpiringDays === null
              ? undefined
              : nearestExpiringDays <= 30
                ? "-30d"
                : nearestExpiringDays <= 60
                  ? "-60d"
                  : "-90d";
          // Milhas a vencer só é exibido para gestor; cliente não vê esse badge.
          const showExpiring = managerMode && hasExpiringMiles;

          const ultimoMovimentoTipo = parsed.movimentos?.[0]?.tipo;
          const variation: ProgramCardData["variation"] =
            ultimoMovimentoTipo === "saida"
              ? "down"
              : ultimoMovimentoTipo === "entrada"
                ? "up"
                : "none";

          return {
            ...program,
            logoImageUrl:
              remoteRow?.logo_image_url ?? storedLogoImage ?? undefined,
            balance: saldo.toLocaleString("pt-BR"),
            // Exibe no card o custo médio por milheiro informado na tela interna.
            valueInBRL: custoMedio.toLocaleString("pt-BR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
            variation,
            expiring: showExpiring,
            error: showExpiring ? "Milhas a vencer" : program.error,
            expiringTag: showExpiring ? expiringTag : undefined,
          };
        } catch {
          return program;
        }
      });

      setPrograms(nextPrograms);
    };

    hydrateProgramsFromStorage();
    window.addEventListener("focus", hydrateProgramsFromStorage);
    window.addEventListener("storage", hydrateProgramsFromStorage);

    return () => {
      window.removeEventListener("focus", hydrateProgramsFromStorage);
      window.removeEventListener("storage", hydrateProgramsFromStorage);
    };
  }, [programDefs, remoteByProgramId, dataOwnerId, managerMode]);

  useEffect(() => {
    if (!user?.id || managerClientId) return;
    if (typeof window === "undefined") return;

    const migrationKey = `${MIGRATION_FLAG_PREFIX}${user.id}`;
    const alreadyMigrated = window.localStorage.getItem(migrationKey) === "1";
    if (alreadyMigrated) return;

    const runMigration = async () => {
      for (const program of programDefs) {
        const slug = program.programId;
        const nameSlug = slugify(program.name);
        // Só migra dados do próprio usuário (chave com user.id). Nunca migrar da chave antiga
        // sem user id, para não copiar dados de outro usuário para a conta nova.
        const storageKey = `${STORAGE_PREFIX}${user.id}:${slug}:${nameSlug}`;
        const rawState = window.localStorage.getItem(storageKey);
        if (!rawState) continue;

        try {
          const parsed = JSON.parse(rawState) as PersistedProgramState;
          const hasMeaningfulData =
            Number(parsed.saldo ?? 0) > 0 ||
            Number(parsed.custoSaldo ?? 0) > 0 ||
            Number(parsed.custoMedioMilheiro ?? 0) > 0 ||
            (parsed.movimentos?.length ?? 0) > 0 ||
            (parsed.lotes?.length ?? 0) > 0;

          if (!hasMeaningfulData) continue;

          const logoImage =
            window.localStorage.getItem(`${LOGO_STORAGE_PREFIX}${user.id}:${slug}`) ?? null;

          await saveProgramState({
            programId: slug,
            programName: program.name,
            logo: program.logo,
            logoColor: program.logoColor,
            logoImageUrl: logoImage,
            state: {
              saldo: Number(parsed.saldo ?? 0),
              custoSaldo: Number(parsed.custoSaldo ?? 0),
              custoMedioMilheiro: Number(parsed.custoMedioMilheiro ?? 0),
              movimentos: Array.isArray(parsed.movimentos) ? parsed.movimentos : [],
              lotes: Array.isArray(parsed.lotes) ? parsed.lotes : [],
            },
          });
        } catch {
          // ignora item corrompido sem quebrar migração total
        }
      }

      window.localStorage.setItem(migrationKey, "1");
    };

    void runMigration();
  }, [user?.id, managerClientId, programDefs, saveProgramState]);

  const handleProgramLogoChange = (programName: string, imageDataUrl: string) => {
    if (!dataOwnerId) return;
    const slug = programName;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        `${LOGO_STORAGE_PREFIX}${dataOwnerId}:${slug}`,
        imageDataUrl,
      );
    }
    setOptionLogoImages((prev) => ({ ...prev, [slug]: imageDataUrl }));

    const syncLogo = (cards: ProgramCardData[]) =>
      cards.map((program) =>
        program.programId === slug
          ? { ...program, logoImageUrl: imageDataUrl }
          : program,
      );

    setPrograms((prev) => syncLogo(prev));
    setProgramDefs((prev) => {
      const next = syncLogo(prev);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          PROGRAM_CARDS_STORAGE_KEY + dataOwnerId,
          JSON.stringify(next),
        );
      }
      return next;
    });
  };

  const handleToggleProgramCard = (
    option: (typeof AVAILABLE_PROGRAM_OPTIONS)[number],
  ) => {
    if (!dataOwnerId) return;
    const jaExiste = programDefs.some((program) => program.programId === option.programId);

    setProgramDefs((prev) => {
      const next = jaExiste
        ? prev.filter((program) => program.programId !== option.programId)
        : [
            {
              programId: option.programId,
              name: option.name,
              logo: option.logo || getProgramInitials(option.name),
              logoColor: option.logoColor,
              balance: "0",
              valueInBRL: "0",
              lastUpdate: "CPM",
              variation: "none" as const,
            },
            ...prev,
          ];
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          PROGRAM_CARDS_STORAGE_KEY + dataOwnerId,
          JSON.stringify(next),
        );
      }
      return next;
    });
    setShowAll(true);
  };

  const handleSubmitDemand = async () => {
    if (!user?.id || !demandTargetClientId) {
      toast.error("Faça login para solicitar uma demanda.");
      return;
    }

    if (demandType === "emissao") {
      if (!demandaOrigem.trim() || !demandaDestino.trim() || demandaPassageiros <= 0) {
        toast.error("Preencha origem, destino e quantidade de pessoas.");
        return;
      }
      if (demandaDataIda && demandaDataVolta && demandaDataVolta < demandaDataIda) {
        toast.error("A data de volta deve ser igual ou posterior à data de ida.");
        return;
      }
      if (!demandaGestorId) {
        toast.error("Selecione o gestor responsável por essa demanda.");
        return;
      }
    } else if (!demandaOutrosDetalhes.trim()) {
      toast.error("Descreva a solicitação em 'Outros'.");
      return;
    }

    const gestorNacional = gestoresNacionais[0];
    const targetGestorId =
      demandType === "outros"
        ? (gestorNacional?.id ?? "")
        : demandaGestorId;
    if (!targetGestorId) {
      toast.error("Não foi possível identificar o gestor Nacional para esta demanda.");
      return;
    }

    setDemandSubmitting(true);
    try {
      const payload =
        demandType === "emissao"
          ? {
              origem: demandaOrigem.trim(),
              destino: demandaDestino.trim(),
              dataIda: demandaDataIda || null,
              dataVolta: demandaDataVolta || null,
              diasViagem: demandaDiasViagem,
              passageiros: demandaPassageiros,
              classeVoo: demandaClasse.trim(),
              bagagemDespachadaDescricao: demandaBagagemDescricao.trim(),
              selecaoAssentoDescricao: demandaAssentoDescricao.trim(),
              flexibilidadeDatas: demandaFlexDatas,
              escopo: demandaEscopo,
              targetGestorId,
            }
          : {
              detalhes: demandaOutrosDetalhes.trim(),
              escopo: "nacional",
              targetGestorId,
            };

      const { error } = await supabase.from("demandas_cliente").insert({
        cliente_id: demandTargetClientId,
        tipo: demandType,
        status: "pendente",
        payload,
      });
      if (error) throw error;

      toast.success("Demanda enviada para o gestor com sucesso.");
      setIsDemandDialogOpen(false);
      setDemandType("emissao");
      setDemandaOrigem("");
      setDemandaDestino("");
      setDemandaDataIda("");
      setDemandaDataVolta("");
      setDemandaPassageiros(1);
      setDemandaClasse("");
      setDemandaBagagemDescricao("");
      setDemandaAssentoDescricao("");
      setDemandaFlexDatas("nao");
      setDemandaOutrosDetalhes("");
      setDemandaEscopo("nacional");
      setDemandaGestorId("");
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : "Erro ao enviar demanda.";
      const msg = /row-level security|permission denied|new row violates/i.test(rawMsg)
        ? "Sem permissão para abrir demanda para este cliente. Verifique o vínculo do gestor e as policies de RLS."
        : rawMsg;
      toast.error(msg);
    } finally {
      setDemandSubmitting(false);
    }
  };

  const handleSearchEmissionFromDestinationCard = ({
    code,
  }: SelectedDestinationSearch) => {
    const destinationAirportCode = CARD_DESTINATION_TO_AIRPORT_CODE[code] ?? code;
    navigate(`/search-flights?destination=${encodeURIComponent(destinationAirportCode)}`);
  };

  const visiblePrograms = showAll ? programs : programs.slice(0, 4);
  const demandaDiasViagem = useMemo(() => {
    if (!demandaDataIda || !demandaDataVolta) return null;
    const [anoIda, mesIda, diaIda] = demandaDataIda.split("-").map(Number);
    const [anoVolta, mesVolta, diaVolta] = demandaDataVolta.split("-").map(Number);
    const idaUtc = Date.UTC(anoIda, mesIda - 1, diaIda);
    const voltaUtc = Date.UTC(anoVolta, mesVolta - 1, diaVolta);
    const ms = voltaUtc - idaUtc;
    if (Number.isNaN(ms) || ms < 0) return null;
    return Math.round(ms / (1000 * 60 * 60 * 24));
  }, [demandaDataIda, demandaDataVolta]);
  const gestoresNacionais = useMemo(
    () => demandaGestores.filter((g) => g.perfil === "nacional"),
    [demandaGestores],
  );
  const gestoresInternacionais = useMemo(
    () => demandaGestores.filter((g) => g.perfil === "internacional"),
    [demandaGestores],
  );
  const gestoresDisponiveisEmissao = useMemo(
    () => (demandaEscopo === "nacional" ? gestoresNacionais : gestoresInternacionais),
    [demandaEscopo, gestoresNacionais, gestoresInternacionais],
  );

  useEffect(() => {
    const inferPerfil = (nome: string, tema: Record<string, unknown>) => {
      const raw = String(tema?.gestorPerfilDemanda ?? tema?.especialidadeGestor ?? "")
        .trim()
        .toLowerCase();
      if (raw === "nacional" || raw === "internacional") return raw as "nacional" | "internacional";
      // Regra operacional atual: Silmaria/Silmara atua como gestora internacional.
      if (/silmaria|silmara/i.test(nome)) return "internacional";
      return /internacional/i.test(nome) ? "internacional" : "nacional";
    };

    const loadDemandGestores = async () => {
      if (!isDemandDialogOpen || !demandTargetClientId) return;
      const { data: links, error: linksErr } = await supabase
        .from("cliente_gestores")
        .select("gestor_id")
        .eq("cliente_id", demandTargetClientId);
      if (linksErr) {
        setDemandaGestores([]);
        setDemandaGestorId("");
        return;
      }
      const gestorIds = [...new Set((links ?? []).map((l) => l.gestor_id as string).filter(Boolean))];
      if (gestorIds.length === 0) {
        setDemandaGestores([]);
        setDemandaGestorId("");
        return;
      }

      const { data: perfis, error: perfisErr } = await supabase
        .from("perfis")
        .select("usuario_id, nome_completo, configuracao_tema")
        .in("usuario_id", gestorIds);
      if (perfisErr) {
        setDemandaGestores([]);
        setDemandaGestorId("");
        return;
      }

      const options = (perfis ?? [])
        .map((p) => {
          const nome = String(p.nome_completo ?? "Gestor").trim() || "Gestor";
          const tema = (p.configuracao_tema ?? {}) as Record<string, unknown>;
          return {
            id: String(p.usuario_id ?? ""),
            nome,
            perfil: inferPerfil(nome, tema),
          } satisfies DemandGestorOption;
        })
        .filter((p) => p.id)
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

      setDemandaGestores(options);
    };

    void loadDemandGestores();
  }, [isDemandDialogOpen, demandTargetClientId]);

  useEffect(() => {
    if (!isDemandDialogOpen) return;
    if (demandType === "outros") {
      setDemandaGestorId(gestoresNacionais[0]?.id ?? "");
      return;
    }
    const first = gestoresDisponiveisEmissao[0];
    if (!first) {
      setDemandaGestorId("");
      return;
    }
    setDemandaGestorId((prev) =>
      gestoresDisponiveisEmissao.some((g) => g.id === prev) ? prev : first.id,
    );
  }, [isDemandDialogOpen, demandType, demandaEscopo, gestoresNacionais, gestoresDisponiveisEmissao]);
  const gestorClientOptions = useMemo(
    () =>
      resumoClientes.map((client) => ({
        id: client.clienteId,
        name: client.nome,
      })),
    [resumoClientes],
  );

  const clientsForBottomNav = useMemo(() => {
    if (!managerMode || typeof window === "undefined" || !user?.id)
      return gestorClientOptions;
    const key = `${MANAGER_ACCESSED_CLIENTS_PREFIX}${user.id}`;
    const raw = window.localStorage.getItem(key);
    let accessed: Array<{ id: string; name?: string }> = [];
    if (raw) {
      try {
        accessed = JSON.parse(raw);
        if (!Array.isArray(accessed)) accessed = [];
      } catch {
        accessed = [];
      }
    }
    const fromApiIds = new Set(gestorClientOptions.map((c) => c.id));
    const onlyAccessed = accessed.filter((a) => !fromApiIds.has(a.id));
    return [
      ...gestorClientOptions,
      ...onlyAccessed.map((a) => ({
        id: a.id,
        name: a.name ?? `Cliente ${a.id.slice(0, 8)}${a.id.length > 8 ? "…" : ""}`,
      })),
    ];
  }, [
    managerMode,
    user?.id,
    gestorClientOptions,
    accessedClientsVersion,
  ]);

  const actionPlanSelectedPrograms = useMemo(() => {
    return actionPlanProgramKeys.map((key) => {
      const label =
        ACTION_PLAN_PROGRAM_LABELS.find(([programKey]) => programKey === key)?.[1]
        ?? "Plano de Ação";
      const fallbackIcon = label
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
      return {
        key,
        label,
        iconSrc: ACTION_PLAN_PROGRAM_ICON_BY_KEY[key],
        fallbackIcon: fallbackIcon || "PA",
      };
    });
  }, [actionPlanProgramKeys]);

  const actionPlanButtonIcons = useMemo(
    () => actionPlanSelectedPrograms.slice(0, ACTION_PLAN_BUTTON_MAX_ICONS),
    [actionPlanSelectedPrograms],
  );
  const actionPlanButtonOverflowCount = Math.max(
    0,
    actionPlanSelectedPrograms.length - ACTION_PLAN_BUTTON_MAX_ICONS,
  );

  useEffect(() => {
    if (!showActionPlanButton || !demandTargetClientId) return;
    let isMounted = true;

    const loadActionPlan = async () => {
      setActionPlanError(null);

      try {
        const perfilPromise = supabase
          .from("perfis")
          .select("configuracao_tema")
          .eq("usuario_id", demandTargetClientId)
          .limit(1);

        // Só carregamos demandas/detalhes se o usuário realmente puder editar.
        const shouldFetchDemands = canEditActionPlan && isActionPlanDialogOpen;

        const [perfilResult, demandasResult] = shouldFetchDemands
          ? await Promise.all([
              perfilPromise,
              supabase
                .from("demandas_cliente")
                .select("id, tipo, status, payload, created_at")
                .eq("cliente_id", demandTargetClientId)
                .order("created_at", { ascending: false })
                .limit(40),
            ])
          : [await perfilPromise, null];

        if (!isMounted) return;
        if (perfilResult.error) throw perfilResult.error;

        const perfilRow = (perfilResult.data ?? [])[0] as
          | { configuracao_tema?: Record<string, unknown> | null }
          | undefined;
        const perfilCfg = (perfilRow?.configuracao_tema ?? {}) as Record<string, unknown>;
        const clientePerfil = (perfilCfg.clientePerfil ?? {}) as Record<string, unknown>;
        const planoAcao = (clientePerfil.planoAcao ?? {}) as Record<string, unknown>;

        const selectedProgramKeys = ACTION_PLAN_PROGRAM_LABELS
          .filter(([key]) => planoAcao[key] === true)
          .map(([key]) => key);
        setActionPlanProgramKeys(selectedProgramKeys);

        if (shouldFetchDemands) {
          if (!demandasResult) return;
          if (demandasResult.error) throw demandasResult.error;

          const demands = ((demandasResult.data ?? []) as ActionPlanDemandRow[])
            .filter((row) => row.tipo === "emissao")
            .map((row) => {
              const payload = (row.payload ?? {}) as Record<string, unknown>;
              const destinoRaw = payload.destino;
              const origemRaw = payload.origem;
              const destino = typeof destinoRaw === "string" ? destinoRaw.trim() : "";
              const origem = typeof origemRaw === "string" ? origemRaw.trim() : "";
              if (!destino) return null;
              return {
                id: row.id,
                origem: origem || null,
                destino,
                status: row.status ?? "pendente",
                createdAt: row.created_at,
              } as ActionPlanDemandItem;
            })
            .filter((item): item is ActionPlanDemandItem => !!item);

          setActionPlanDemands(demands);
        } else {
          // Cliente só precisa ver quais programas já estão no plano.
          setActionPlanDemands([]);
        }
      } catch (error) {
        const msg =
          error instanceof Error
            ? error.message
            : typeof error === "object" && error !== null && "message" in error
              ? String((error as { message: unknown }).message)
              : "Erro ao carregar plano de ação.";
        setActionPlanError(msg);
      }
    };

    void loadActionPlan();

    return () => {
      isMounted = false;
    };
  }, [showActionPlanButton, demandTargetClientId, canEditActionPlan, isActionPlanDialogOpen]);

  const persistActionPlanPrograms = async (nextKeys: ActionPlanProgramKey[]) => {
    if (!demandTargetClientId) {
      toast.error("Cliente não identificado para salvar o plano de ação.");
      return false;
    }

    setActionPlanSaving(true);
    try {
      const { data: existingPerfilRows, error: existingPerfilError } = await supabase
        .from("perfis")
        .select("id, slug, nome_completo, configuracao_tema")
        .eq("usuario_id", demandTargetClientId)
        .limit(1);
      if (existingPerfilError) throw existingPerfilError;
      const existingPerfil = (existingPerfilRows ?? [])[0] as
        | {
            id?: string | number;
            slug?: string | null;
            nome_completo?: string | null;
            configuracao_tema?: Record<string, unknown> | null;
          }
        | undefined;

      const existingConfig = (existingPerfil?.configuracao_tema ?? {}) as Record<
        string,
        unknown
      >;
      const existingClientePerfil = (existingConfig.clientePerfil ?? {}) as Record<
        string,
        unknown
      >;
      const existingPlanoAcao = (existingClientePerfil.planoAcao ?? {}) as Record<
        string,
        unknown
      >;

      const nextPlanoAcao: Record<string, unknown> = { ...existingPlanoAcao };
      ACTION_PLAN_PROGRAM_LABELS.forEach(([key]) => {
        nextPlanoAcao[key] = nextKeys.includes(key);
      });

      const nextConfig = {
        ...existingConfig,
        clientePerfil: {
          ...existingClientePerfil,
          planoAcao: nextPlanoAcao,
        },
      };

      const fallbackSuffix = demandTargetClientId.slice(0, 8);
      const slug = existingPerfil?.slug ?? `cliente-${fallbackSuffix}`;
      const nomeCompleto = existingPerfil?.nome_completo ?? `Cliente ${fallbackSuffix}`;

      if (existingPerfil != null && existingPerfil.id != null) {
        const { data: updated, error: updateError } = await supabase
          .from("perfis")
          .update({ configuracao_tema: nextConfig })
          .eq("usuario_id", demandTargetClientId)
          .select("usuario_id");
        if (updateError) throw updateError;
        if (!updated?.length) {
          throw new Error("Sem permissão para salvar (gestor: rode o SQL no Supabase e vincule o cliente em Clientes ativos).");
        }
      } else {
        const { error: insertError } = await supabase.from("perfis").insert({
          usuario_id: demandTargetClientId,
          slug,
          nome_completo: nomeCompleto,
          configuracao_tema: nextConfig,
        });
        if (insertError) throw insertError;
      }

      queryClient.invalidateQueries({ queryKey: ["cliente_gestores_perfis"] });
      return true;
    } catch (error) {
      const rawMsg =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null && "message" in error
            ? String((error as { message: unknown }).message)
            : "Erro ao salvar plano de ação.";
      const isPermissionError =
        /Sem permissão|row-level security|permission denied|violates|policy|RLS/i.test(rawMsg);
      const msg = isPermissionError
        ? `Sem permissão para salvar. Abra o diálogo de ajuda (ao fechar este toast) e rode o SQL no Supabase. Confirme também que o cliente está em Clientes ativos.\n\nDetalhes: ${rawMsg}`
        : rawMsg;
      toast.error(msg);
      if (isPermissionError) setShowPlanoAcaoPermissionHelp(true);
      return false;
    } finally {
      setActionPlanSaving(false);
    }
  };

  const toggleActionPlanProgram = async (programKey: ActionPlanProgramKey) => {
    if (actionPlanSaving) return;
    const previousKeys = actionPlanProgramKeys;
    const nextKeys = previousKeys.includes(programKey)
      ? previousKeys.filter((key) => key !== programKey)
      : [...previousKeys, programKey];

    setActionPlanProgramKeys(nextKeys);
    const saved = await persistActionPlanPrograms(nextKeys);
    if (!saved) {
      setActionPlanProgramKeys(previousKeys);
    }
  };

  const programMetaBySlug = useMemo(() => {
    const bySlug = new Map<string, ProgramMeta>();
    programDefs.forEach((program) => {
      const slug = program.programId;
      if (!bySlug.has(slug)) {
        bySlug.set(slug, {
          slug,
          name: program.name,
          logo: program.logo,
          logoColor: program.logoColor,
        });
      }
    });
    return bySlug;
  }, [programDefs]);

  const allPersistedPrograms = useMemo(() => {
    // Cliente sem user: abas Vencendo/Extrato/R$ não mostram dados de ninguém.
    if (!dataOwnerId) return [] as Array<{ meta: ProgramMeta; state: PersistedProgramState }>;

    if (remotePrograms && remotePrograms.length > 0) {
      // Filtro de segurança: só incluir programas do dono atual (evita vazamento entre usuários).
      const targetOwnerId = managerClientId ?? user?.id;
      const safeRows = targetOwnerId
        ? remotePrograms.filter((row) => row.cliente_id === targetOwnerId)
        : [];

      return safeRows
        .map((row) => {
          const state = row.state as PersistedProgramState | null;
          if (!state) return null;
          const meta = programMetaBySlug.get(row.program_id) ?? {
            slug: row.program_id,
            name: row.program_name,
            logo: row.logo ?? getProgramInitials(row.program_name),
            logoColor: row.logo_color ?? "#64748b",
          };
          return { meta, state };
        })
        .filter(
          (item): item is { meta: ProgramMeta; state: PersistedProgramState } =>
            !!item,
        );
    }

    // Cliente: abas Vencendo/Extrato/R$ usam só dados do backend (nunca localStorage), para não cruzar com outros usuários.
    if (!managerMode) return [] as Array<{ meta: ProgramMeta; state: PersistedProgramState }>;

    if (typeof window === "undefined") return [] as Array<{
      meta: ProgramMeta;
      state: PersistedProgramState;
    }>;

    const prefixWithOwner = `${STORAGE_PREFIX}${dataOwnerId}:`;
    const keys = Object.keys(window.localStorage).filter((key) =>
      key.startsWith(prefixWithOwner),
    );

    return keys
      .map((key) => {
        const raw = window.localStorage.getItem(key);
        if (!raw) return null;
        try {
          const state = JSON.parse(raw) as PersistedProgramState;
          // key format: STORAGE_PREFIX + dataOwnerId + ":" + slug + ":" + nameSlug
          const afterPrefix = key.replace(prefixWithOwner, "");
          const parts = afterPrefix.split(":");
          const slug = (parts[0] ?? "programa").toLowerCase();
          const meta = programMetaBySlug.get(slug) ?? getProgramMetaFromSlug(slug);
          return { meta, state };
        } catch {
          return null;
        }
      })
      .filter((item): item is { meta: ProgramMeta; state: PersistedProgramState } => !!item);
  }, [programMetaBySlug, remotePrograms, dataOwnerId, managerClientId, user?.id, managerMode]);

  const vencimentosGlobais = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const msDia = 1000 * 60 * 60 * 24;
    const items: VencimentoItem[] = [];

    allPersistedPrograms.forEach(({ meta, state }) => {
      const lotes = (state.lotes ?? [])
        .filter((l) => !!l.validadeLote && (l.quantidade ?? 0) > 0)
        .map((l) => ({
          validadeLote: l.validadeLote as string,
          quantidade: Number(l.quantidade ?? 0),
        }));

      const fallbackLotes =
        lotes.length > 0
          ? lotes
          : (state.movimentos ?? [])
              .filter(
                (mov) =>
                  mov.tipo === "entrada" &&
                  !!mov.validadeLote &&
                  Number(mov.milhas ?? 0) > 0,
              )
              .map((mov) => ({
                validadeLote: mov.validadeLote as string,
                quantidade: Number(mov.milhas ?? 0),
              }));

      fallbackLotes.forEach((lote) => {
        const validade = new Date(`${lote.validadeLote}T00:00:00`);
        if (Number.isNaN(validade.getTime())) return;
        const diasRestantes = Math.ceil((validade.getTime() - hoje.getTime()) / msDia);
        items.push({
          programSlug: meta.slug,
          programName: meta.name,
          programLogo: meta.logo,
          programLogoColor: meta.logoColor,
          data: validade.toLocaleDateString("pt-BR", { timeZone: "UTC" }),
          diasRestantes,
          quantidade: lote.quantidade,
        });
      });
    });

    return items.sort((a, b) => a.diasRestantes - b.diasRestantes);
  }, [allPersistedPrograms]);

  const extratoGlobal = useMemo(() => {
    const items: ExtratoItem[] = [];

    allPersistedPrograms.forEach(({ meta, state }) => {
      (state.movimentos ?? []).forEach((mov) => {
        const tipo: MovimentoTipo = mov.tipo === "saida" ? "saida" : "entrada";
        items.push({
          id: mov.id ?? `${meta.slug}-${mov.data ?? "sem-data"}-${mov.descricao ?? "mov"}`,
          programSlug: meta.slug,
          programName: meta.name,
          programLogo: meta.logo,
          programLogoColor: meta.logoColor,
          data: mov.data ?? "-",
          tipo,
          descricao:
            mov.descricao ??
            (tipo === "entrada" ? "Entrada de milhas" : "Saída de milhas"),
          milhas: Number(mov.milhas ?? 0),
        });
      });
    });

    return items.sort((a, b) => {
      const da = parseBrDate(a.data)?.getTime() ?? 0;
      const db = parseBrDate(b.data)?.getTime() ?? 0;
      return db - da;
    });
  }, [allPersistedPrograms]);

  const analiseEconomia = useMemo(() => {
    const limite = new Date();
    limite.setMonth(limite.getMonth() - economiaPeriodoMeses);
    limite.setHours(0, 0, 0, 0);

    const emissoes: EmissaoEconomiaItem[] = [];
    const compras: CompraPontosItem[] = [];

    allPersistedPrograms.forEach(({ meta, state }) => {
      const custoMilheiroPrograma = Number(state.custoMedioMilheiro ?? 0);

      (state.movimentos ?? []).forEach((mov) => {
        const dataMov = parseBrDate(mov.data);
        if (!dataMov || dataMov < limite) return;

        if (mov.tipo === "saida") {
          const milhas = Math.abs(Number(mov.milhas ?? 0));
          if (milhas <= 0) return;

          const custoMilheiroBase = Number(
            mov.custoMilheiroBase ?? custoMilheiroPrograma ?? 0,
          );
          const taxa = Number(mov.taxas ?? 0);
          const tarifaPagante = Number(mov.tarifaPagante ?? 0);
          const custoMilhas = (milhas / 1000) * custoMilheiroBase;
          const custoReal = custoMilhas + taxa;
          const economiaReal =
            typeof mov.economiaReal === "number"
              ? mov.economiaReal
              : tarifaPagante - custoReal;

          emissoes.push({
            id: mov.id ?? `${meta.slug}-${mov.data ?? "sem-data"}-${milhas}`,
            programName: meta.name,
            programLogo: meta.logo,
            programLogoColor: meta.logoColor,
            data: mov.data ?? "-",
            descricao:
              mov.descricao ??
              (mov.origem && mov.destino
                ? `${mov.origem.toUpperCase()} - ${mov.destino.toUpperCase()}`
                : "Emissão com milhas"),
            milhas,
            tarifaPagante,
            custoReal,
            economiaReal,
          });
        }

        if (mov.tipo === "entrada") {
          const milhas = Number(mov.milhas ?? 0);
          const valorPago = Number(mov.valorPago ?? 0);
          if (milhas <= 0 || valorPago <= 0) return;

          const custoMilheiro = (valorPago / milhas) * 1000;
          compras.push({
            id: mov.id ?? `${meta.slug}-${mov.data ?? "sem-data"}-${milhas}`,
            programName: meta.name,
            programLogo: meta.logo,
            programLogoColor: meta.logoColor,
            data: mov.data ?? "-",
            milhas,
            valorPago,
            custoMilheiro,
            descricao: mov.descricao ?? mov.entradaTipo ?? "Compra de pontos",
          });
        }
      });
    });

    emissoes.sort((a, b) => (parseBrDate(b.data)?.getTime() ?? 0) - (parseBrDate(a.data)?.getTime() ?? 0));
    compras.sort((a, b) => (parseBrDate(b.data)?.getTime() ?? 0) - (parseBrDate(a.data)?.getTime() ?? 0));

    const economiaTotal = emissoes.reduce((acc, item) => acc + item.economiaReal, 0);
    const custoTotalCompras = compras.reduce((acc, item) => acc + item.valorPago, 0);
    const trend: "up" | "down" | "none" =
      economiaTotal > 0 ? "up" : economiaTotal < 0 ? "down" : "none";

    return {
      economiaTotal,
      custoTotalCompras,
      trend,
      emissoes,
      compras,
    };
  }, [allPersistedPrograms, economiaPeriodoMeses]);

  const [emissoesProgramFilter, setEmissoesProgramFilter] = useState<
    "all" | "latam" | "smiles" | "tudoazul" | "livelo" | "esfera"
  >("all");
  const [emissoesSortOrder, setEmissoesSortOrder] = useState<"recentes" | "antigas">(
    "recentes",
  );

  const emissoesFiltradasOrdenadas = useMemo(() => {
    let list = analiseEconomia.emissoes;

    if (emissoesProgramFilter !== "all") {
      list = list.filter((item) => {
        const name = item.programName.toLowerCase();
        switch (emissoesProgramFilter) {
          case "latam":
            return name.includes("latam");
          case "smiles":
            return name.includes("smiles");
          case "tudoazul":
            return (
              name.includes("tudoazul") ||
              name.includes("tudo azul") ||
              name.includes("azul")
            );
          case "livelo":
            return name.includes("livelo");
          case "esfera":
            return name.includes("esfera");
          default:
            return true;
        }
      });
    }

    const sorted = [...list].sort((a, b) => {
      const da = parseBrDate(a.data)?.getTime() ?? 0;
      const db = parseBrDate(b.data)?.getTime() ?? 0;
      return emissoesSortOrder === "recentes" ? db - da : da - db;
    });

    return sorted;
  }, [analiseEconomia.emissoes, emissoesProgramFilter, emissoesSortOrder]);

  useEffect(() => {
    if (activeTab === "vencendo" && vencendoSectionRef.current) {
      vencendoSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [activeTab]);

  useEffect(() => {
    // Evita "tela em branco": se a aba ativa não é permitida para o role atual, volta para a home.
    if (activeTab === "timeline" && !canShowTimeline) setActiveTab("saldo");
    if (activeTab === "insights" && !canShowInsights) setActiveTab("saldo");
  }, [activeTab, canShowInsights, canShowTimeline]);

  const handleDownloadEconomiaPdf = async () => {
    if (!economiaReportRef.current) return;

    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);

    const canvas = await html2canvas(economiaReportRef.current, {
      scale: 2,
      backgroundColor: "#F7F7F8",
      useCORS: true,
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth - 12;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 6;
    pdf.addImage(imgData, "PNG", 6, position, imgWidth, imgHeight);
    heightLeft -= pageHeight - 12;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight + 6;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 6, position, imgWidth, imgHeight);
      heightLeft -= pageHeight - 12;
    }

    const dataArquivo = new Date().toISOString().slice(0, 10);
    pdf.save(`analise-economia-12m-${dataArquivo}.pdf`);
  };

  return (
    <div className="mx-auto min-h-screen max-w-md bg-nubank-bg pb-28">
      <DashboardHeader />

      <BalanceTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        economyTrend={analiseEconomia.trend}
        economyLabel={managerMode && !managerClientId ? "Plano de Ação" : "R$"}
        canShowInsights={canShowInsights}
        canShowTimeline={canShowTimeline}
      />

      {managerClientId && (
        <div className="px-5 pb-3">
          <div className="inline-flex flex-col rounded-full bg-primary/10 px-4 py-2 text-xs font-semibold text-primary">
            <span>
              {role === "cs"
                ? "Visualizando como CS (supervisão)"
                : "Visualizando como gestor"}
            </span>
            {managerClientName && (
              <span className="max-w-[220px] truncate text-[10px] font-medium text-primary/90">
                {managerClientName}
              </span>
            )}
          </div>
        </div>
      )}

      {activeTab === "saldo" && (
        <>
          <div className="px-5 pb-3">
            <div className="flex items-center gap-2">
              {managerMode && !managerClientId ? (
                <>
                  <div className="relative inline-block">
                    <button
                      type="button"
                      onClick={() => setIsClientesAtivosOpen((prev) => !prev)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-nubank-border bg-white px-3 py-1.5 text-xs font-semibold text-nubank-text shadow-nubank transition-colors hover:bg-white/90 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      <Plus size={14} />
                      {linkedClientIds.length} clientes ativos
                    </button>
                    {isClientesAtivosOpen && (
                      <div className="absolute left-0 z-20 mt-2 w-80 rounded-2xl border border-nubank-border bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-nubank-text-secondary dark:text-slate-400">
                          Clientes vinculados (ativos)
                        </p>
                        {(() => {
                          const vinculados = resumoClientes.filter((c) => linkedClientIds.includes(c.clienteId));
                          return vinculados.length > 0 ? (
                          <ul className="mb-3 max-h-32 space-y-1 overflow-y-auto text-xs">
                            {vinculados.map((c) => (
                              <li key={c.clienteId} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 bg-muted/50">
                                <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
                                  <span className="truncate">{c.nome}</span>
                                  <span className="text-muted-foreground tabular-nums shrink-0">{c.milhas.toLocaleString("pt-BR")} pts</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await desvincular(c.clienteId);
                                      toast.success("Cliente desvinculado.");
                                    } catch (err: unknown) {
                                      toast.error(getErrorMessage(err));
                                    }
                                  }}
                                  disabled={isDesvincularLoading}
                                  className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50 disabled:opacity-50"
                                >
                                  Remover
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mb-3 text-xs text-muted-foreground">Nenhum cliente vinculado ainda.</p>
                        );
                        })()}
                        <div className="border-t border-nubank-border dark:border-slate-600 pt-2">
                          <p className="mb-1.5 text-[11px] font-medium text-nubank-text-secondary dark:text-slate-400">Vincular novo cliente</p>
                          <p className="mb-1.5 text-[10px] text-muted-foreground">Peça o ID da conta do cliente (menu ☰ na conta dele) e cole abaixo.</p>
                          <div className="flex gap-2">
                            <Input
                              placeholder="UUID do cliente"
                              value={vincularIdInput}
                              onChange={(e) => setVincularIdInput(e.target.value)}
                              className="h-9 text-xs font-mono"
                            />
                            <Button
                              size="sm"
                              className="h-9 shrink-0"
                              disabled={!vincularIdInput.trim() || isVincularLoading}
                              onClick={async () => {
                                const id = vincularIdInput.trim();
                                if (!id) return;
                                try {
                                  await vincular(id);
                                  setVincularIdInput("");
                                  setIsClientesAtivosOpen(false);
                                  toast.success("Cliente vinculado. Agora ele entra nos cálculos dos cards.");
                                } catch (err: unknown) {
                                  toast.error(getErrorMessage(err));
                                }
                              }}
                            >
                              {isVincularLoading ? "..." : "Vincular"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate("/gestor?tab=demandas&status=pendente")}
                    className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 shadow-nubank transition-colors hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200 dark:hover:bg-amber-900/50"
                  >
                    Demandas Abertas {demandasPendentes > 0 ? `(${demandasPendentes})` : ""}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate("/gestor?tab=demandas&status=em_andamento")}
                    className="inline-flex items-center gap-1.5 rounded-full border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 shadow-nubank transition-colors hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-200 dark:hover:bg-blue-900/50"
                  >
                    Demandas em Andamento{" "}
                    {demandasEmAndamento > 0 ? `(${demandasEmAndamento})` : ""}
                  </button>
                </>
              ) : (
                <>
                  <div
                    className={`grid w-full items-center gap-2 ${
                      !managerMode || !!managerClientId ? "grid-cols-3" : "grid-cols-1"
                    }`}
                  >
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setIsAddProgramMenuOpen((prev) => !prev)}
                        className="inline-flex h-9 w-full items-center justify-center gap-1 rounded-full border border-nubank-border bg-white px-2 text-[11px] font-semibold whitespace-nowrap text-nubank-text shadow-nubank transition-colors hover:bg-white/90 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        <Plus size={12} />
                      </button>

                      {isAddProgramMenuOpen && (
                        <div className="absolute left-0 z-20 mt-2 w-72 rounded-2xl border border-nubank-border bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                          <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-nubank-text-secondary dark:text-slate-400">
                            Selecione os programas
                          </p>
                          <div className="space-y-1">
                            {AVAILABLE_PROGRAM_OPTIONS.map((option) => (
                              <label
                                key={option.programId}
                                className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-2 py-2 text-left text-xs text-nubank-text transition-colors hover:bg-primary/5 dark:text-slate-200 dark:hover:bg-slate-700"
                              >
                                <input
                                  type="checkbox"
                                  checked={programDefs.some(
                                    (program) => program.programId === option.programId,
                                  )}
                                  onChange={() => handleToggleProgramCard(option)}
                                  className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                                />
                                <span
                                  className="inline-flex h-6 w-6 items-center justify-center overflow-hidden text-[10px] font-semibold"
                                  style={{ color: option.logoColor }}
                                >
                                  {optionLogoImages[option.programId] ? (
                                    <img
                                      src={optionLogoImages[option.programId]}
                                      alt={`Logo ${option.name}`}
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    option.logo
                                  )}
                                </span>
                                <span>{option.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {(!managerMode || !!managerClientId) && (
                      <>
                        <button
                          type="button"
                          onClick={() => setIsDemandDialogOpen(true)}
                          className="inline-flex h-9 w-full items-center justify-center rounded-full border border-transparent bg-primary px-2 text-[11px] font-semibold whitespace-nowrap text-primary-foreground shadow-nubank transition-colors hover:bg-primary/90"
                        >
                          Solicitar Cotação
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!canEditActionPlan) return;
                            setIsActionPlanDialogOpen(true);
                          }}
                          disabled={!canEditActionPlan}
                          className={`inline-flex h-9 w-full items-center justify-center gap-1 rounded-full border border-nubank-border bg-transparent px-2 text-[11px] font-semibold whitespace-nowrap text-nubank-text shadow-nubank transition-colors hover:bg-white/90 dark:border-slate-700 dark:bg-transparent dark:text-slate-200 dark:hover:bg-slate-700 ${
                            !canEditActionPlan ? "cursor-not-allowed opacity-60" : ""
                          }`}
                        >
                          {actionPlanSelectedPrograms.length > 1 ? (
                            <span className="inline-flex items-center gap-1">
                              {actionPlanButtonIcons.map((program) =>
                                program.iconSrc ? (
                                  <span key={`action-plan-icon-${program.key}`} className="inline-flex h-4 w-4">
                                    {ACTION_PLAN_AIRLINE_BY_KEY[program.key] ? (
                                      <AirlineLogo airline={ACTION_PLAN_AIRLINE_BY_KEY[program.key]} size={16} />
                                    ) : (
                                      <img
                                        src={program.iconSrc}
                                        alt={`Programa ${program.label}`}
                                        className="h-4 w-4 bg-transparent object-contain"
                                      />
                                    )}
                                  </span>
                                ) : (
                                  <span
                                    key={`action-plan-icon-${program.key}`}
                                    className="inline-flex h-4 w-4 items-center justify-center text-[8px] font-bold leading-none text-current"
                                  >
                                    {program.fallbackIcon}
                                  </span>
                                ),
                              )}
                              {actionPlanButtonOverflowCount > 0 && (
                                <span className="inline-flex h-4 min-w-4 items-center justify-center text-[9px] font-semibold leading-none text-current">
                                  +{actionPlanButtonOverflowCount}
                                </span>
                              )}
                            </span>
                          ) : actionPlanSelectedPrograms[0]?.iconSrc ? (
                            <>
                              {ACTION_PLAN_AIRLINE_BY_KEY[actionPlanSelectedPrograms[0].key] ? (
                                <AirlineLogo
                                  airline={ACTION_PLAN_AIRLINE_BY_KEY[actionPlanSelectedPrograms[0].key]}
                                  size={16}
                                />
                              ) : (
                                <img
                                  src={actionPlanSelectedPrograms[0].iconSrc}
                                  alt={`Programa ${actionPlanSelectedPrograms[0].label}`}
                                  className="h-4 w-4 bg-transparent object-contain"
                                />
                              )}
                              {canEditActionPlan && (
                                <span className="truncate">{actionPlanSelectedPrograms[0].label}</span>
                              )}
                            </>
                          ) : (
                            <>
                              {canEditActionPlan ? (
                                <span className="truncate">
                                  {actionPlanSelectedPrograms[0]?.label ?? "Plano de Ação"}
                                </span>
                              ) : null}
                            </>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {managerMode && !managerClientId ? (
            <div className="grid grid-cols-2 gap-3 px-5">
              <div
                className={`relative col-span-2 cursor-default rounded-2xl border-2 p-4 shadow-nubank ${
                  gestorScore >= 600
                    ? "border-emerald-500/60 bg-emerald-500/5 dark:bg-emerald-500/10"
                    : gestorScore >= 300
                      ? "border-amber-500/60 bg-amber-500/5 dark:bg-amber-500/10"
                      : "border-red-500/50 bg-red-500/5 dark:bg-red-500/10"
                }`}
              >
                <p className="text-[11px] font-medium text-muted-foreground">Score de desempenho do gestor</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">
                  <span
                    className={
                      gestorScore >= 600
                        ? "text-emerald-600 dark:text-emerald-400"
                        : gestorScore >= 300
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-red-600 dark:text-red-400"
                    }
                  >
                    {gestorScore}
                  </span>
                  <span className="text-muted-foreground font-normal text-sm"> / 1.000</span>
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Avaliação da economia trazida para todos os clientes sob gestão
                </p>
              </div>
              <div className="relative cursor-default rounded-2xl border border-nubank-border bg-white p-4 shadow-nubank dark:border-slate-700 dark:bg-slate-800">
                <p className="text-[11px] font-medium text-muted-foreground">Economia total gerada</p>
                <p className="mt-2 text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {gestorKpis.economiaTotalGestao.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                    maximumFractionDigits: 0,
                    minimumFractionDigits: 0,
                  })}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">sob gestão (todos os clientes)</p>
              </div>
              <div className="relative cursor-default rounded-2xl border border-nubank-border bg-white p-4 shadow-nubank dark:border-slate-700 dark:bg-slate-800">
                <p className="text-[11px] font-medium text-muted-foreground">Economia média gerada</p>
                <p className="mt-2 text-lg font-semibold tabular-nums">
                  {gestorKpis.roiMedio.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                    maximumFractionDigits: 0,
                    minimumFractionDigits: 0,
                  })}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">consolidado (todos os clientes)</p>
              </div>
              <div
                className={`relative col-span-2 rounded-2xl border border-nubank-border bg-white p-4 shadow-nubank dark:border-slate-700 dark:bg-slate-800 ${
                  clientesComVencendo90d.length > 0 ? "cursor-pointer" : "cursor-default"
                }`}
                onClick={() => {
                  if (clientesComVencendo90d.length === 0) return;
                  setIsClientesVencendoOpen((prev) => !prev);
                }}
                role={clientesComVencendo90d.length > 0 ? "button" : undefined}
                tabIndex={clientesComVencendo90d.length > 0 ? 0 : undefined}
                onKeyDown={(event) => {
                  if (clientesComVencendo90d.length === 0) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setIsClientesVencendoOpen((prev) => !prev);
                  }
                }}
              >
                <p className="text-[11px] font-medium text-muted-foreground">Clientes com milhas vencendo &lt;90 dias</p>
                <p className="mt-2 text-lg font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                  {gestorKpis.clientesComVencendo90d}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {clientesComVencendo90d.length > 0
                    ? "clique para ver os clientes e abrir a conta"
                    : "clientes com pontos a vencer nos próximos 90 dias"}
                </p>
                {isClientesVencendoOpen && clientesComVencendo90d.length > 0 && (
                  <div className="mt-3 rounded-xl border border-nubank-border bg-white/80 p-2 dark:border-slate-600 dark:bg-slate-700/30">
                    <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-nubank-text-secondary dark:text-slate-400">
                      Clientes com vencimento próximo
                    </p>
                    <ul className="max-h-36 space-y-1 overflow-y-auto">
                      {clientesComVencendo90d.map((client) => (
                        <li key={client.clienteId}>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setIsClientesVencendoOpen(false);
                              handleOpenManagerClient(client.clienteId);
                            }}
                            className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-white/80 dark:hover:bg-slate-600/50"
                          >
                            <span className="truncate">{client.nome}</span>
                            <span className="shrink-0 font-semibold text-amber-700 dark:text-amber-300">
                              {client.pontosVencendo90d.toLocaleString("pt-BR")} pts
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <section className="px-5 pb-1">
                <h2 className="section-label-lg text-lg">Meus programas</h2>
              </section>
              <div className="grid grid-cols-2 gap-1.5 px-5 pb-2">
                {visiblePrograms.map((prog) => (
                  <ProgramCard
                    key={prog.programId}
                    {...prog}
                    managerClientId={managerClientId}
                    managerClientName={managerClientName}
                    onLogoImageChange={(imageDataUrl) =>
                      handleProgramLogoChange(prog.programId, imageDataUrl)
                    }
                  />
                ))}
              </div>

              {!showAll && programs.length > 4 && (
                <button
                  onClick={() => setShowAll(true)}
                  className="mx-auto mt-1.5 flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold text-nubank-text-secondary transition-colors hover:bg-white/80 hover:text-nubank-text"
                >
                  <ChevronDown size={18} strokeWidth={2} />
                  Ver todos
                </button>
              )}
            </>
          )}

          <div className="mt-5">
            <DestinationCarousel
              origins={enabledOrigins}
              onDestinationClick={handleSearchEmissionFromDestinationCard}
            />
          </div>

          <div className="mt-5">
            <BonusOffersSection />
          </div>

        </>
      )}

      {activeTab === "vencendo" && (
        <div ref={vencendoSectionRef} className="space-y-2.5 px-5 py-3">
          {managerMode && !managerClientId ? (
            <>
              <p className="section-label">
                Próximos vencimentos (todos os clientes)
              </p>
              {(vencimentosTodosClientes ?? []).length === 0 ? (
                <div className="rounded-[16px] bg-white p-8 text-center text-sm text-nubank-text-secondary shadow-nubank">
                  Nenhum vencimento nos próximos dias na carteira.
                </div>
              ) : (
                <div className="space-y-2">
                  {(vencimentosTodosClientes ?? []).slice(0, 200).map((item, idx) => (
                    <button
                      key={`${item.clienteId}-${item.programId}-${item.data}-${idx}`}
                      type="button"
                      onClick={() => {
                        const q = new URLSearchParams(searchParams);
                        q.set("clientId", item.clienteId);
                        navigate(`/?${q.toString()}`);
                      }}
                      className="flex w-full flex-col gap-1.5 rounded-[16px] bg-white px-5 py-4 text-left shadow-nubank transition-all duration-300 ease-out hover:shadow-nubank-hover dark:bg-card dark:hover:bg-muted/50"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-nubank-text">{item.clienteNome}</span>
                        <span
                          className={
                            item.diasRestantes <= 30
                              ? "font-semibold text-red-600 dark:text-red-400"
                              : item.diasRestantes <= 60
                                ? "font-semibold text-amber-600 dark:text-amber-400"
                                : "text-muted-foreground"
                          }
                        >
                          {item.diasRestantes} dias
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{item.programName}</span>
                        <span>
                          {item.quantidade.toLocaleString("pt-BR")} pts · {item.data}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {vencimentosGlobais.length === 0 ? (
                <div className="rounded-2xl border border-nubank-border bg-white p-6 text-center text-sm text-nubank-text-secondary shadow-nubank">
                  Nenhum vencimento encontrado nos programas registrados.
                </div>
              ) : (
                <div className="space-y-2">
                {vencimentosGlobais.map((item) => (
                  <div
                    key={`${item.programSlug}-${item.data}-${item.quantidade}`}
                    className="rounded-2xl border border-nubank-border bg-white p-5 text-nubank-text shadow-nubank"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold ring-1 ring-black/10"
                          style={{
                            backgroundColor: `${item.programLogoColor}1f`,
                            color: item.programLogoColor,
                          }}
                        >
                          {item.programLogo}
                        </span>
                        <div>
                          <p className="text-xs font-semibold text-nubank-text">
                            {item.programName}
                          </p>
                          <p className="text-[11px] text-nubank-text-secondary">{item.data}</p>
                        </div>
                      </div>
                      <p className="text-xs font-semibold text-nubank-text">
                        {item.quantidade.toLocaleString("pt-BR")} milhas
                      </p>
                    </div>
                    <p className="mt-2 text-[11px] font-medium text-nubank-text-secondary">
                      {item.diasRestantes < 0
                        ? `Venceu há ${Math.abs(item.diasRestantes)} dias`
                        : `Vence em ${item.diasRestantes} dias`}
                    </p>
                  </div>
                ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === "extrato" && (
        <div className="space-y-2 px-5 py-2">
          {extratoGlobal.length === 0 && (
            <div className="rounded-2xl border border-nubank-border bg-white p-6 text-center text-sm text-nubank-text-secondary shadow-nubank">
              Nenhuma entrada ou saída registrada ainda.
            </div>
          )}
          {extratoGlobal.map((item) => (
            <div
              key={`${item.programSlug}-${item.id}`}
              className="flex items-center gap-4 rounded-2xl border border-nubank-border bg-white p-5 shadow-nubank"
            >
              <span
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ring-1 ring-black/10"
                style={{
                  backgroundColor: `${item.programLogoColor}1f`,
                  color: item.programLogoColor,
                }}
              >
                {item.programLogo}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-nubank-text">
                  {item.descricao}
                </p>
                <p className="text-[11px] text-nubank-text-secondary">
                  {item.programName} • {item.data}
                </p>
              </div>
              <div className="text-right">
                <p
                  className={`text-xs font-semibold ${
                    item.tipo === "entrada" ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {item.tipo === "entrada" ? "+" : "-"}
                  {Math.abs(item.milhas).toLocaleString("pt-BR")}
                </p>
                <p className="text-[10px] text-nubank-text-secondary">
                  {item.tipo === "entrada" ? "Entrada" : "Saída"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "economia" && (
        <div className="space-y-3 px-5">
          {managerMode && !managerClientId ? (
            <div className="space-y-3">
              <p className="text-[11px] font-medium text-muted-foreground">
                Selecione o programa para ver os clientes no plano de ação
              </p>
              <div className="flex flex-wrap gap-2">
                {ACTION_PLAN_PROGRAM_LABELS.map(([key, label]) => {
                  const clients = planosAcaoPorPrograma[key] ?? [];
                  const iconSrc = ACTION_PLAN_PROGRAM_ICON_BY_KEY[key];
                  const airlineCode = ACTION_PLAN_AIRLINE_BY_KEY[key];
                  const isSelected = selectedPlanoProgramKey === key;
                  return (
                    <button
                      key={`gestor-plan-select-${key}`}
                      type="button"
                      onClick={() => setSelectedPlanoProgramKey(isSelected ? null : key)}
                      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                        isSelected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-nubank-border bg-white text-nubank-text hover:bg-white/90 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                      }`}
                    >
                      {iconSrc ? (
                        <span className="inline-flex h-4 w-4 items-center justify-center">
                          {airlineCode ? (
                            <AirlineLogo airline={airlineCode} size={14} />
                          ) : (
                            <img src={iconSrc} alt="" className="h-3.5 w-3.5 bg-transparent object-contain" />
                          )}
                        </span>
                      ) : null}
                      {label}
                      <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] tabular-nums dark:bg-white/10">
                        {clients.length}
                      </span>
                    </button>
                  );
                })}
              </div>
              {selectedPlanoProgramKey && (() => {
                const key = selectedPlanoProgramKey;
                const label = ACTION_PLAN_PROGRAM_LABELS.find(([k]) => k === key)?.[1] ?? key;
                const clients = planosAcaoPorPrograma[key] ?? [];
                const iconSrc = ACTION_PLAN_PROGRAM_ICON_BY_KEY[key];
                const airlineCode = ACTION_PLAN_AIRLINE_BY_KEY[key];
                return (
                  <div className="rounded-2xl border border-nubank-border bg-white p-4 shadow-nubank">
                    <div className="flex items-center gap-2">
                      {iconSrc ? (
                        <span className="inline-flex h-5 w-5 items-center justify-center">
                          {airlineCode ? (
                            <AirlineLogo airline={airlineCode} size={18} />
                          ) : (
                            <img src={iconSrc} alt={`Logo ${label}`} className="h-4.5 w-4.5 bg-transparent object-contain" />
                          )}
                        </span>
                      ) : null}
                      <p className="text-sm font-semibold text-nubank-text">{label}</p>
                      <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-nubank-text-secondary">
                        {clients.length} cliente{clients.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Clientes com {label} selecionado no plano de ação
                    </p>
                    {clients.length === 0 ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Nenhum cliente com este programa no plano de ação.
                      </p>
                    ) : (
                      <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                        {clients.map((client) => (
                          <li key={`${key}-${client.clienteId}`}>
                            <button
                              type="button"
                              onClick={() => handleOpenManagerClient(client.clienteId)}
                              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-white/90"
                            >
                              <span className="truncate">{client.nome}</span>
                              <span className="shrink-0 text-[11px] font-semibold text-nubank-text-secondary">Abrir</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : (
          <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-full border border-nubank-border bg-white p-1 shadow-nubank">
              {[
                { label: "1M", value: 1 as const },
                { label: "6M", value: 6 as const },
                { label: "12M", value: 12 as const },
              ].map((opcao) => {
                const active = economiaPeriodoMeses === opcao.value;
                return (
                  <button
                    key={opcao.value}
                    type="button"
                    onClick={() => setEconomiaPeriodoMeses(opcao.value)}
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
                      active
                        ? "bg-slate-900 text-white"
                        : "text-nubank-text-secondary hover:bg-primary/5"
                    }`}
                  >
                    {opcao.label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={handleDownloadEconomiaPdf}
              className="inline-flex items-center gap-1 rounded-full border border-nubank-border bg-white px-3 py-1.5 text-xs font-semibold text-nubank-text shadow-nubank transition-colors hover:bg-white/90"
            >
              <Download size={14} />
              Baixar PDF
            </button>
          </div>
          <div ref={economiaReportRef} className="space-y-3">
            <div className="rounded-2xl border border-nubank-border bg-white p-4 shadow-nubank">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-nubank-text">
                  Economia total das emissões (últimos {economiaPeriodoMeses}{" "}
                  {economiaPeriodoMeses === 1 ? "mês" : "meses"})
                </p>
                {analiseEconomia.trend === "up" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    <ArrowUpRight size={14} />
                    Economia
                  </span>
                )}
                {analiseEconomia.trend === "down" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                    <ArrowDownRight size={14} />
                    Prejuízo
                  </span>
                )}
              </div>
              <p
                className={`mt-2 text-xl font-bold ${
                  analiseEconomia.economiaTotal >= 0
                    ? "text-emerald-700"
                    : "text-red-700"
                }`}
              >
                {analiseEconomia.economiaTotal.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
              </p>
              <p className="mt-1 text-[11px] text-nubank-text-secondary">
                Custo de compra de pontos no período:{" "}
                {analiseEconomia.custoTotalCompras.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
              </p>
            </div>

            <div className="rounded-2xl border border-nubank-border bg-white p-4 shadow-nubank">
              <p className="text-xs font-semibold text-nubank-text">
                Total de emissões realizadas
              </p>
              <p className="mt-2 text-2xl font-bold text-nubank-text">
                {analiseEconomia.emissoes.length.toLocaleString("pt-BR")}
              </p>
              <p className="mt-1 text-[11px] text-nubank-text-secondary">
                Considerando apenas o período selecionado acima.
              </p>
            </div>

            <div className="rounded-2xl border border-nubank-border bg-white p-4 shadow-nubank">
              <p className="text-xs font-semibold text-nubank-text">
                Passagens emitidas que geraram economia/prejuízo
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1 font-semibold ${
                      emissoesProgramFilter === "all"
                        ? "bg-nubank-primary text-white"
                        : "bg-nubank-bg text-nubank-text-secondary"
                    }`}
                    onClick={() => setEmissoesProgramFilter("all")}
                  >
                    Ver todos
                  </button>
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1 font-semibold ${
                      emissoesProgramFilter === "latam"
                        ? "bg-nubank-primary text-white"
                        : "bg-nubank-bg text-nubank-text-secondary"
                    }`}
                    onClick={() => setEmissoesProgramFilter("latam")}
                  >
                    LATAM Pass
                  </button>
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1 font-semibold ${
                      emissoesProgramFilter === "smiles"
                        ? "bg-nubank-primary text-white"
                        : "bg-nubank-bg text-nubank-text-secondary"
                    }`}
                    onClick={() => setEmissoesProgramFilter("smiles")}
                  >
                    Smiles
                  </button>
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1 font-semibold ${
                      emissoesProgramFilter === "tudoazul"
                        ? "bg-nubank-primary text-white"
                        : "bg-nubank-bg text-nubank-text-secondary"
                    }`}
                    onClick={() => setEmissoesProgramFilter("tudoazul")}
                  >
                    TudoAzul
                  </button>
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1 font-semibold ${
                      emissoesProgramFilter === "livelo"
                        ? "bg-nubank-primary text-white"
                        : "bg-nubank-bg text-nubank-text-secondary"
                    }`}
                    onClick={() => setEmissoesProgramFilter("livelo")}
                  >
                    Livelo
                  </button>
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1 font-semibold ${
                      emissoesProgramFilter === "esfera"
                        ? "bg-nubank-primary text-white"
                        : "bg-nubank-bg text-nubank-text-secondary"
                    }`}
                    onClick={() => setEmissoesProgramFilter("esfera")}
                  >
                    Esfera
                  </button>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1 font-semibold ${
                      emissoesSortOrder === "recentes"
                        ? "bg-nubank-primary text-white"
                        : "bg-nubank-bg text-nubank-text-secondary"
                    }`}
                    onClick={() => setEmissoesSortOrder("recentes")}
                  >
                    Mais recentes
                  </button>
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1 font-semibold ${
                      emissoesSortOrder === "antigas"
                        ? "bg-nubank-primary text-white"
                        : "bg-nubank-bg text-nubank-text-secondary"
                    }`}
                    onClick={() => setEmissoesSortOrder("antigas")}
                  >
                    Mais antigas
                  </button>
                </div>
              </div>
              {emissoesFiltradasOrdenadas.length === 0 && (
                <p className="mt-3 text-xs text-nubank-text-secondary">
                  Nenhuma emissão encontrada para os filtros selecionados.
                </p>
              )}
            <div className="mt-3 space-y-2">
              {emissoesFiltradasOrdenadas.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-nubank-border bg-white/80 p-3"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ring-1 ring-black/10"
                      style={{
                        backgroundColor: `${item.programLogoColor}1f`,
                        color: item.programLogoColor,
                      }}
                    >
                      {item.programLogo}
                    </span>
                    <p className="text-[11px] font-semibold text-nubank-text">
                      {item.programName} • {item.data}
                    </p>
                  </div>
                  <p className="mt-1 text-xs font-medium text-nubank-text">
                    {item.descricao}
                  </p>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-nubank-text-secondary">
                    <span>{item.milhas.toLocaleString("pt-BR")} milhas</span>
                    <span>
                      Tarifa:{" "}
                      {item.tarifaPagante.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px]">
                    <span className="text-nubank-text-secondary">
                      Custo real:{" "}
                      {item.custoReal.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </span>
                    <span
                      className={
                        item.economiaReal >= 0
                          ? "font-semibold text-emerald-700"
                          : "font-semibold text-red-700"
                      }
                    >
                      {item.economiaReal >= 0 ? "Economia" : "Prejuízo"}:{" "}
                      {Math.abs(item.economiaReal).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-nubank-border bg-white p-4 shadow-nubank">
            <p className="text-xs font-semibold text-nubank-text">
              Pontos comprados e custos (últimos {economiaPeriodoMeses}{" "}
              {economiaPeriodoMeses === 1 ? "mês" : "meses"})
            </p>
            {analiseEconomia.compras.length === 0 && (
              <p className="mt-3 text-xs text-nubank-text-secondary">
                Nenhuma compra de pontos registrada no período selecionado.
              </p>
            )}
            <div className="mt-3 space-y-2">
              {analiseEconomia.compras.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-nubank-border bg-white/80 p-3"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ring-1 ring-black/10"
                      style={{
                        backgroundColor: `${item.programLogoColor}1f`,
                        color: item.programLogoColor,
                      }}
                    >
                      {item.programLogo}
                    </span>
                    <p className="text-[11px] font-semibold text-nubank-text">
                      {item.programName} • {item.data}
                    </p>
                  </div>
                  <p className="mt-1 text-xs font-medium text-nubank-text">
                    {item.descricao}
                  </p>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-nubank-text-secondary">
                    <span>{item.milhas.toLocaleString("pt-BR")} milhas</span>
                    <span>
                      Custo:{" "}
                      {item.valorPago.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] font-semibold text-amber-700">
                    Custo por milheiro:{" "}
                    {item.custoMilheiro.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </p>
                </div>
              ))}
            </div>
          </div>
          </div>
          </>
          )}
        </div>
      )}

      {activeTab === "timeline" && canShowTimeline && advancedClientId && (
        <ClientTimelineSection
          enabled={true}
          clienteId={advancedClientId}
        />
      )}

      {activeTab === "insights" && canShowInsights && advancedClientId && (
        <ClientInsightsSection enabled={true} clienteId={advancedClientId} />
      )}

      {activeTab === "sugestoes" && (
        <SmartRedemptionSuggestions
          clientId={managerClientId ?? user?.id ?? null}
        />
      )}

      <Dialog open={isDemandDialogOpen} onOpenChange={setIsDemandDialogOpen}>
        <DialogContent className="flex max-h-[85dvh] w-[calc(100vw-1.5rem)] max-w-md flex-col gap-0 overflow-hidden p-4 pt-11 sm:p-5 sm:pt-12">
          <DialogHeader className="shrink-0 space-y-1.5 pr-6 text-left">
            <DialogTitle>Solicitar demanda</DialogTitle>
            <DialogDescription>
              Envie uma solicitação para o seu gestor.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-3 min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain pr-1 [-webkit-overflow-scrolling:touch]">
            <div className="space-y-3 pb-1">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={demandType === "emissao" ? "default" : "outline"}
                onClick={() => setDemandType("emissao")}
              >
                Emissão
              </Button>
              <Button
                type="button"
                size="sm"
                variant={demandType === "outros" ? "default" : "outline"}
                onClick={() => setDemandType("outros")}
              >
                Outros
              </Button>
            </div>

            {demandType === "emissao" ? (
              <div className="space-y-2">
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">Tipo de emissão</p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={demandaEscopo === "nacional" ? "default" : "outline"}
                      onClick={() => setDemandaEscopo("nacional")}
                    >
                      Nacional
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={demandaEscopo === "internacional" ? "default" : "outline"}
                      onClick={() => setDemandaEscopo("internacional")}
                    >
                      Internacional
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">Gestor responsável</p>
                  <select
                    value={demandaGestorId}
                    onChange={(event) => setDemandaGestorId(event.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Selecione</option>
                    {gestoresDisponiveisEmissao.map((gestor) => (
                      <option key={gestor.id} value={gestor.id}>
                        {gestor.nome} ({gestor.perfil === "nacional" ? "Nacional" : "Internacional"})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Origem"
                    value={demandaOrigem}
                    onChange={(event) => setDemandaOrigem(event.target.value)}
                  />
                  <Input
                    placeholder="Destino"
                    value={demandaDestino}
                    onChange={(event) => setDemandaDestino(event.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <p className="text-[11px] text-muted-foreground">Data de ida</p>
                    <DatePickerField
                      value={demandaDataIda}
                      onChange={(ymd) => {
                        setDemandaDataIda(ymd);
                        if (demandaDataVolta && demandaDataVolta < ymd) setDemandaDataVolta("");
                      }}
                      placeholder="Escolher data"
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] text-muted-foreground">
                      (Opcional) Data de volta
                    </p>
                    <DatePickerField
                      value={demandaDataVolta}
                      onChange={setDemandaDataVolta}
                      placeholder="Escolher data"
                      disabled={
                        demandaDataIda
                          ? { before: parseYmdToLocalDate(demandaDataIda)! }
                          : undefined
                      }
                    />
                  </div>
                </div>
                {demandaDiasViagem !== null && (
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Duração estimada da viagem:{" "}
                    <span className="text-foreground">
                      {demandaDiasViagem} {demandaDiasViagem === 1 ? "dia" : "dias"}
                    </span>
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <p className="text-[11px] text-muted-foreground">Número de passageiros</p>
                    <select
                      value={demandaPassageiros}
                      onChange={(event) => setDemandaPassageiros(Number(event.target.value))}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {Array.from({ length: 9 }, (_, idx) => idx + 1).map((value) => (
                        <option key={`pax-${value}`} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] text-muted-foreground">Classe do voo</p>
                    <select
                      value={demandaClasse}
                      onChange={(event) => setDemandaClasse(event.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Selecione</option>
                      <option value="economica">Econômica</option>
                      <option value="premium-economy">Premium Economy</option>
                      <option value="executiva">Executiva</option>
                      <option value="primeira-classe">Primeira Classe</option>
                    </select>
                  </div>
                </div>
                <Input
                  placeholder="Bagagem despachada (quantidade / detalhes)"
                  value={demandaBagagemDescricao}
                  onChange={(event) => setDemandaBagagemDescricao(event.target.value)}
                />
                <Input
                  placeholder="Seleção de assento (quantidade / detalhes)"
                  value={demandaAssentoDescricao}
                  onChange={(event) => setDemandaAssentoDescricao(event.target.value)}
                />
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">Flexibilidade de datas</p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={demandaFlexDatas === "sim" ? "default" : "outline"}
                      onClick={() => setDemandaFlexDatas("sim")}
                    >
                      Sim
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={demandaFlexDatas === "nao" ? "default" : "outline"}
                      onClick={() => setDemandaFlexDatas("nao")}
                    >
                      Não
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] text-muted-foreground">
                  Essa demanda será direcionada ao gestor Nacional.
                  {gestoresNacionais[0] ? ` (${gestoresNacionais[0].nome})` : ""}
                </p>
                <Textarea
                  placeholder="Descreva sua demanda..."
                  value={demandaOutrosDetalhes}
                  onChange={(event) => setDemandaOutrosDetalhes(event.target.value)}
                />
              </div>
            )}
            </div>
          </div>

          <div className="mt-3 shrink-0 border-t border-nubank-border pt-3">
            <Button
              type="button"
              className="w-full"
              onClick={handleSubmitDemand}
              disabled={demandSubmitting}
            >
              {demandSubmitting ? "Enviando..." : "Enviar demanda"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showPlanoAcaoPermissionHelp} onOpenChange={setShowPlanoAcaoPermissionHelp}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Como liberar o salvamento do Plano de Ação</DialogTitle>
            <DialogDescription>
              O gestor só pode salvar o plano do cliente se o Supabase permitir (policy) e se o cliente estiver vinculado em &quot;Clientes ativos&quot;.
            </DialogDescription>
          </DialogHeader>
          <ol className="list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
            <li>Abra o Supabase do seu projeto → SQL Editor → New query.</li>
            <li>Cole o SQL abaixo (botão &quot;Copiar SQL&quot;) e clique em Run.</li>
            <li>Confirme que este cliente está na lista &quot;Clientes ativos&quot; (vincule pelo UUID se precisar).</li>
          </ol>
          <pre className="max-h-64 overflow-auto rounded border bg-muted/50 p-2 text-[11px] font-mono whitespace-pre-wrap break-all">
            {PERFIS_GESTOR_UPDATE_SQL}
          </pre>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowPlanoAcaoPermissionHelp(false)}
            >
              Fechar
            </Button>
            <Button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(PERFIS_GESTOR_UPDATE_SQL);
                  toast.success("SQL copiado. Cole no Supabase SQL Editor e execute.");
                } catch {
                  toast.error("Não foi possível copiar.");
                }
              }}
            >
              Copiar SQL
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isActionPlanDialogOpen && canEditActionPlan}
        onOpenChange={(open) => {
          if (!canEditActionPlan) return;
          setIsActionPlanDialogOpen(open);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Plano de Ação</DialogTitle>
            <DialogDescription>
              Programas prioritários para acumular pontos e destinos das suas demandas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {actionPlanError ? (
              <p className="text-xs text-destructive">{actionPlanError}</p>
            ) : null}

            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-xs font-semibold text-foreground">
                Programas disponíveis
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Clique em Adicionar para incluir no plano de ação.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {ACTION_PLAN_PROGRAM_LABELS.map(([key, label]) => {
                  const added = actionPlanProgramKeys.includes(key);
                  if (added) return null;
                  const iconSrc = ACTION_PLAN_PROGRAM_ICON_BY_KEY[key];
                  const airlineCode = ACTION_PLAN_AIRLINE_BY_KEY[key];
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-2 py-1.5"
                    >
                      <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-xs font-semibold text-foreground">
                        {iconSrc ? (
                          <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
                            {airlineCode ? (
                              <AirlineLogo airline={airlineCode} size={14} />
                            ) : (
                              <img
                                src={iconSrc}
                                alt=""
                                className="h-3.5 w-3.5 bg-transparent object-contain"
                              />
                            )}
                          </span>
                        ) : null}
                        <span className="truncate">{label}</span>
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 shrink-0 gap-1 px-2 text-[11px]"
                        disabled={actionPlanSaving}
                        onClick={() => void toggleActionPlanProgram(key)}
                      >
                        <Plus size={12} />
                        Adicionar
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-xs font-semibold text-foreground">
                Adicionados no plano de ação
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Programas prioritários para este cliente. Remova se quiser tirar do plano.
              </p>
              {actionPlanProgramKeys.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Nenhum programa adicionado ainda.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {actionPlanProgramKeys.map((key) => {
                    const label = ACTION_PLAN_PROGRAM_LABELS.find(([k]) => k === key)?.[1] ?? key;
                    const iconSrc = ACTION_PLAN_PROGRAM_ICON_BY_KEY[key];
                    const airlineCode = ACTION_PLAN_AIRLINE_BY_KEY[key];
                    return (
                      <li
                        key={key}
                        className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-2 py-1.5"
                      >
                        <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-xs font-semibold text-primary">
                          {iconSrc ? (
                            <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
                              {airlineCode ? (
                                <AirlineLogo airline={airlineCode} size={14} />
                              ) : (
                                <img
                                  src={iconSrc}
                                  alt=""
                                  className="h-3.5 w-3.5 bg-transparent object-contain"
                                />
                              )}
                            </span>
                          ) : null}
                          <span className="truncate">{label}</span>
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 shrink-0 gap-1 px-2 text-[11px] text-muted-foreground hover:text-destructive"
                          disabled={actionPlanSaving}
                          onClick={() => void toggleActionPlanProgram(key)}
                        >
                          <X size={12} />
                          Remover
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-xs font-semibold text-foreground">
                Destinos solicitados em demanda
              </p>
              {actionPlanDemands.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Você ainda não possui demandas de emissão com destino informado.
                </p>
              ) : (
                <div className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">
                  {actionPlanDemands.map((item) => (
                    <div
                      key={`action-plan-demand-${item.id}`}
                      className="rounded-lg border border-border bg-background p-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-foreground">
                          {item.origem ? `${item.origem} -> ${item.destino}` : item.destino}
                        </p>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {DEMAND_STATUS_LABELS[item.status] ?? item.status}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Solicitada em{" "}
                        {new Date(item.createdAt).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <CsatClientePrompt />
      <NpsClientePrompt />

      <BottomNav
        activeItem={activeNav}
        onItemChange={(item) => {
          if (item === "passagens") {
            navigate("/search-flights");
            return;
          }
          if (item === "vender") {
            if (role === "cs") {
              navigate("/cs");
              return;
            }
            navigate(managerClientId ? `/cliente?clientId=${managerClientId}` : "/cliente");
            return;
          }
          setActiveNav(item);
        }}
        showClientSelector={managerMode}
        clients={clientsForBottomNav}
        selectedClientId={managerClientId}
        onClientSelect={(clientId) => {
          if (managerMode && user?.id && typeof window !== "undefined") {
            const key = `${MANAGER_ACCESSED_CLIENTS_PREFIX}${user.id}`;
            const raw = window.localStorage.getItem(key);
            let list: Array<{ id: string; name?: string }> = [];
            if (raw) {
              try {
                list = JSON.parse(raw);
                if (!Array.isArray(list)) list = [];
              } catch {
                list = [];
              }
            }
            const existing = list.find((c) => c.id === clientId);
            if (!existing) {
              const name = clientsForBottomNav.find((c) => c.id === clientId)?.name;
              list.push({ id: clientId, name });
              window.localStorage.setItem(key, JSON.stringify(list));
              setAccessedClientsVersion((v) => v + 1);
            }
          }
          const query = new URLSearchParams(searchParams);
          query.set("clientId", clientId);
          navigate(`/?${query.toString()}`);
        }}
        onBackToMyAccount={
          managerMode
            ? () => {
                const query = new URLSearchParams(searchParams);
                query.delete("clientId");
                const q = query.toString();
                navigate(q ? `/?${q}` : homePathForRole(role));
              }
            : undefined
        }
        onRemoveClient={
          managerMode && managerClientId
            ? async (clientId) => {
                try {
                  await desvincular(clientId);
                  toast.success("Cliente desvinculado.");
                  const query = new URLSearchParams(searchParams);
                  query.delete("clientId");
                  navigate(
                    query.toString() ? `/?${query.toString()}` : homePathForRole(role),
                  );
                } catch (err: unknown) {
                  toast.error(getErrorMessage(err));
                }
              }
            : undefined
        }
      />
    </div>
  );
};

export default Index;
