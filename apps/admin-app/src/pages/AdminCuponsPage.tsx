import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  type Cupom,
  type CupomStatus,
  type CupomTipo,
  type CuponsState,
  type PlanoCupom,
  computeKpis,
  exportCuponsCsv,
  gerarCodigoCupom,
  loadCuponsState,
  newCupomId,
  planosLabel,
  saveCuponsState,
  statusVisual,
} from "@/services/adminCuponsStore";

type StatusFilter = "todos" | "ativos" | "expirados" | "pausados";
type TipoFilter = "todos" | CupomTipo;

interface FormDraft {
  tipo: CupomTipo;
  codigo: string;
  valor: number;
  planos: PlanoCupom[];
  maxUsosStr: string;
  expiradoEm: string;
  descricaoInterna: string;
  ativarImediato: boolean;
}

function emptyDraft(): FormDraft {
  return {
    tipo: "percentual",
    codigo: "",
    valor: 30,
    planos: ["basico", "pro", "enterprise"],
    maxUsosStr: "",
    expiradoEm: "",
    descricaoInterna: "",
    ativarImediato: true,
  };
}

function cupomToDraft(c: Cupom): FormDraft {
  return {
    tipo: c.tipo,
    codigo: c.codigo,
    valor: c.valor,
    planos: [...c.planos],
    maxUsosStr: c.maxUsos == null ? "" : String(c.maxUsos),
    expiradoEm: c.expiradoEm ? c.expiradoEm.slice(0, 10) : "",
    descricaoInterna: c.descricaoInterna ?? "",
    ativarImediato: c.status === "ativo",
  };
}

function parseMaxUsos(s: string): number | null {
  const t = s.trim();
  if (t === "" || t === "0") return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function draftToNewCupom(d: FormDraft): Cupom {
  const max = parseMaxUsos(d.maxUsosStr);
  const exp =
    d.expiradoEm.trim() === "" ? null : new Date(`${d.expiradoEm}T23:59:59.000Z`).toISOString();
  return {
    id: newCupomId(),
    codigo: d.codigo.trim().toUpperCase(),
    tipo: d.tipo,
    valor: Number(d.valor) || 0,
    planos: d.planos.length ? d.planos : ["basico"],
    maxUsos: max,
    totalUsos: 0,
    status: d.ativarImediato ? "ativo" : "pausado",
    descricaoInterna: d.descricaoInterna.trim() || undefined,
    expiradoEm: exp,
    criadoEm: new Date().toISOString(),
    totalDescontoGerado: 0,
  };
}

function applyDraftToCupom(c: Cupom, d: FormDraft): Cupom {
  const max = parseMaxUsos(d.maxUsosStr);
  const exp =
    d.expiradoEm.trim() === "" ? null : new Date(`${d.expiradoEm}T23:59:59.000Z`).toISOString();
  return {
    ...c,
    codigo: d.codigo.trim().toUpperCase(),
    tipo: d.tipo,
    valor: Number(d.valor) || 0,
    planos: d.planos.length ? d.planos : ["basico"],
    maxUsos: max,
    status: d.ativarImediato ? "ativo" : "pausado",
    descricaoInterna: d.descricaoInterna.trim() || undefined,
    expiradoEm: exp,
  };
}

function formatDatePt(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function brlFromCentavos(c: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(
    c / 100,
  );
}

function matchesFilters(
  c: Cupom,
  visual: CupomStatus,
  q: string,
  sf: StatusFilter,
  tf: TipoFilter,
): boolean {
  if (q.trim() && !c.codigo.toLowerCase().includes(q.trim().toLowerCase())) return false;
  if (tf !== "todos" && c.tipo !== tf) return false;
  if (sf === "todos") return true;
  if (sf === "ativos") return visual === "ativo";
  if (sf === "expirados") return visual === "expirado" || visual === "esgotado";
  if (sf === "pausados") return visual === "pausado";
  return true;
}

function togglePlano(planos: PlanoCupom[], p: PlanoCupom): PlanoCupom[] {
  const set = new Set(planos);
  if (set.has(p)) set.delete(p);
  else set.add(p);
  const order: PlanoCupom[] = ["basico", "pro", "enterprise"];
  return order.filter((x) => set.has(x));
}

function usagePct(c: Cupom): number {
  if (c.maxUsos == null || c.maxUsos === 0) return 100;
  return Math.min(100, Math.round((c.totalUsos / c.maxUsos) * 100));
}

function IconCopy({ className }: { className?: string }) {
  return (
    <svg className={className} width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <rect x="1" y="3" width="6" height="7" rx="1" />
      <path d="M3 3V2a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H8" />
    </svg>
  );
}

function IconEdit({ className }: { className?: string }) {
  return (
    <svg className={className} width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <path d="M7.5 1.5L9.5 3.5 3.5 9.5H1.5V7.5L7.5 1.5Z" />
    </svg>
  );
}

function IconPause({ className }: { className?: string }) {
  return (
    <svg className={className} width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <rect x="2" y="2" width="2.5" height="7" rx="1" />
      <rect x="6.5" y="2" width="2.5" height="7" rx="1" />
    </svg>
  );
}

function IconPencilBtn({ className }: { className?: string }) {
  return (
    <svg className={className} width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <path d="M2 9.5V11h1.5L11 3.5 9.5 2 2 9.5Z" />
    </svg>
  );
}

function IconPlus({ className }: { className?: string }) {
  return (
    <svg className={className} width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <line x1="6.5" y1="1" x2="6.5" y2="12" />
      <line x1="1" y1="6.5" x2="12" y2="6.5" />
    </svg>
  );
}

function IconRefresh({ className }: { className?: string }) {
  return (
    <svg className={className} width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <path d="M1 6a5 5 0 0 1 9-3M10 5a5 5 0 0 1-9 3" />
      <polyline points="7,1 9,3 7,5" />
      <polyline points="4,6 2,8 4,10" />
    </svg>
  );
}

function IconCreate({ className }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 7.5V10h2.5L10 4.5 7.5 2 2 7.5Z" />
    </svg>
  );
}

export default function AdminCuponsPage() {
  const [state, setState] = useState<CuponsState>(() => loadCuponsState());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [tipoFilter, setTipoFilter] = useState<TipoFilter>("todos");
  const [createDraft, setCreateDraft] = useState<FormDraft>(() => emptyDraft());

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<FormDraft>(() => emptyDraft());

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const persist = useCallback((next: CuponsState) => {
    setState(next);
    saveCuponsState(next);
  }, []);

  const kpis = useMemo(() => computeKpis(state), [state]);

  const filtered = useMemo(() => {
    return state.cupons
      .map((c) => ({ c, visual: statusVisual(c) }))
      .filter(({ c, visual }) => matchesFilters(c, visual, search, statusFilter, tipoFilter))
      .sort((a, b) => a.c.codigo.localeCompare(b.c.codigo));
  }, [state.cupons, search, statusFilter, tipoFilter]);

  const editingCupom = editId ? state.cupons.find((x) => x.id === editId) : undefined;

  const exportCsv = useCallback(() => {
    const csv = exportCuponsCsv(state);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cupons-gestmiles-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state]);

  const copyCode = useCallback((codigo: string) => {
    void navigator.clipboard.writeText(codigo);
  }, []);

  const openEdit = useCallback((c: Cupom) => {
    setEditId(c.id);
    setEditDraft(cupomToDraft(c));
    setEditOpen(true);
  }, []);

  const closeEdit = useCallback(() => {
    setEditOpen(false);
    setEditId(null);
  }, []);

  const pauseCupom = useCallback(
    (id: string) => {
      persist({
        ...state,
        cupons: state.cupons.map((c) => (c.id === id ? { ...c, status: "pausado" as const } : c)),
      });
    },
    [state, persist],
  );

  const reativarCupom = useCallback(
    (id: string) => {
      persist({
        ...state,
        cupons: state.cupons.map((c) => (c.id === id ? { ...c, status: "ativo" as const } : c)),
      });
    },
    [state, persist],
  );

  const duplicateCupom = useCallback(
    (c: Cupom) => {
      const novo: Cupom = {
        ...c,
        id: newCupomId(),
        codigo: gerarCodigoCupom(),
        totalUsos: 0,
        totalDescontoGerado: 0,
        status: "ativo",
        expiradoEm: null,
        criadoEm: new Date().toISOString(),
      };
      persist({ ...state, cupons: [...state.cupons, novo] });
    },
    [state, persist],
  );

  const removeCupom = useCallback(
    (id: string) => {
      persist({
        ...state,
        cupons: state.cupons.filter((c) => c.id !== id),
        usos: state.usos.filter((u) => u.cupomId !== id),
      });
      closeEdit();
      setDeleteOpen(false);
      setDeleteTargetId(null);
    },
    [state, persist, closeEdit],
  );

  const submitCreate = useCallback(() => {
    const code = createDraft.codigo.trim();
    if (!code) return;
    if (state.cupons.some((c) => c.codigo.toUpperCase() === code.toUpperCase())) return;
    const novo = draftToNewCupom(createDraft);
    persist({ ...state, cupons: [...state.cupons, novo] });
    setCreateDraft(emptyDraft());
  }, [createDraft, state, persist]);

  const submitEdit = useCallback(() => {
    if (!editId || !editingCupom) return;
    const code = editDraft.codigo.trim();
    if (!code) return;
    const clash = state.cupons.some(
      (c) => c.id !== editId && c.codigo.toUpperCase() === code.toUpperCase(),
    );
    if (clash) return;
    persist({
      ...state,
      cupons: state.cupons.map((c) => (c.id === editId ? applyDraftToCupom(c, editDraft) : c)),
    });
    closeEdit();
  }, [editId, editingCupom, editDraft, state, persist, closeEdit]);

  const previewMeta = (d: FormDraft) => {
    const planosTxt = planosLabel(d.planos.length ? d.planos : (["basico"] as PlanoCupom[]));
    const max = parseMaxUsos(d.maxUsosStr);
    const usosTxt = max == null ? "Usos ilimitados" : `Até ${max} usos`;
    const expTxt =
      d.expiradoEm.trim() === "" ? "Sem expiração" : `Expira ${formatDatePt(`${d.expiradoEm}T12:00:00.000Z`)}`;
    return `${planosTxt} · ${usosTxt} · ${expTxt}`;
  };

  const previewValor = (d: FormDraft) => {
    if (d.tipo === "percentual") return `${d.valor}% OFF`;
    if (d.tipo === "fixo") return `R$ ${d.valor} DE DESCONTO`;
    return `+${d.valor} DIAS GRÁTIS`;
  };

  const previewDisponiveis = (d: FormDraft) => {
    const max = parseMaxUsos(d.maxUsosStr);
    if (max == null) return "∞";
    return String(Math.max(0, max));
  };

  const renderFormFields = (
    draft: FormDraft,
    setDraft: Dispatch<SetStateAction<FormDraft>>,
    idPrefix: string,
  ) => (
    <>
      <div className="gm-cup-field">
        <label className="gm-cup-flabel" htmlFor={`${idPrefix}-tipo`}>
          Tipo de promoção
        </label>
        <div className="gm-cup-type-selector" role="group" aria-label="Tipo de promoção">
          <button
            type="button"
            className={cn("gm-cup-type-btn", draft.tipo === "percentual" && "gm-cup-type-btn--pct")}
            onClick={() => setDraft((p) => ({ ...p, tipo: "percentual" }))}
          >
            <span className="gm-cup-type-icon">%</span>
            <span className="gm-cup-type-label">% desconto</span>
          </button>
          <button
            type="button"
            className={cn("gm-cup-type-btn", draft.tipo === "fixo" && "gm-cup-type-btn--fix")}
            onClick={() => setDraft((p) => ({ ...p, tipo: "fixo" }))}
          >
            <span className="gm-cup-type-icon">R$</span>
            <span className="gm-cup-type-label">Valor fixo</span>
          </button>
          <button
            type="button"
            className={cn("gm-cup-type-btn", draft.tipo === "trial" && "gm-cup-type-btn--trial")}
            onClick={() => setDraft((p) => ({ ...p, tipo: "trial" }))}
          >
            <span className="gm-cup-type-icon">🎁</span>
            <span className="gm-cup-type-label">Trial grátis</span>
          </button>
        </div>
      </div>

      <div className="gm-cup-field">
        <label className="gm-cup-flabel" htmlFor={`${idPrefix}-codigo`}>
          Código do cupom
        </label>
        <div className="gm-cup-code-row">
          <input
            id={`${idPrefix}-codigo`}
            className="gm-cup-finput gm-cup-finput--code"
            placeholder="Ex: LAUNCH30"
            value={draft.codigo}
            onChange={(e) => setDraft((p) => ({ ...p, codigo: e.target.value }))}
            autoComplete="off"
          />
          <button
            type="button"
            className="gm-cup-btn-sm gm-cup-btn-sm-o gm-cup-btn-gen"
            onClick={() => setDraft((p) => ({ ...p, codigo: gerarCodigoCupom() }))}
          >
            <IconRefresh />
            Gerar
          </button>
        </div>
      </div>

      <div className="gm-cup-field">
        <label className="gm-cup-flabel" htmlFor={`${idPrefix}-valor`}>
          {draft.tipo === "trial" ? "Dias de trial extra" : "Valor do desconto"}
        </label>
        <div className={cn("gm-cup-prefix-wrap", draft.tipo === "trial" && "gm-cup-prefix-wrap--trial")}>
          {draft.tipo === "percentual" ? <span className="gm-cup-prefix-tag">%</span> : null}
          {draft.tipo === "fixo" ? <span className="gm-cup-prefix-tag">R$</span> : null}
          {draft.tipo === "trial" ? <span className="gm-cup-prefix-tag">+</span> : null}
          <input
            id={`${idPrefix}-valor`}
            className={cn(
              "gm-cup-finput",
              draft.tipo === "percentual" && "gm-cup-finput--with-prefix",
              draft.tipo === "fixo" && "gm-cup-finput--with-prefix",
              draft.tipo === "trial" && "gm-cup-finput--trial-mid",
            )}
            type="number"
            min={1}
            max={draft.tipo === "percentual" ? 100 : undefined}
            value={draft.valor || ""}
            onChange={(e) => setDraft((p) => ({ ...p, valor: Number(e.target.value) || 0 }))}
            placeholder={draft.tipo === "percentual" ? "30" : draft.tipo === "fixo" ? "200" : "14"}
          />
          {draft.tipo === "trial" ? <span className="gm-cup-suffix-dias">dias</span> : null}
        </div>
      </div>

      <div className="gm-cup-field">
        <span className="gm-cup-flabel">Planos aplicáveis</span>
        <div className="gm-cup-plan-checks">
          {(
            [
              ["basico", "📦 Básico"],
              ["pro", "🚀 Pro"],
              ["enterprise", "🏆 Enterprise"],
            ] as const
          ).map(([pid, label]) => (
            <button
              key={pid}
              type="button"
              className={cn("gm-cup-plan-check", draft.planos.includes(pid) && "checked")}
              onClick={() => setDraft((p) => ({ ...p, planos: togglePlano(p.planos, pid) }))}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="gm-cup-fgrid2">
        <div className="gm-cup-field gm-cup-field--mb0">
          <label className="gm-cup-flabel" htmlFor={`${idPrefix}-max`}>
            Máx. de usos
          </label>
          <input
            id={`${idPrefix}-max`}
            className="gm-cup-finput"
            type="number"
            min={0}
            placeholder="0 = ilimitado"
            value={draft.maxUsosStr}
            onChange={(e) => setDraft((p) => ({ ...p, maxUsosStr: e.target.value }))}
          />
        </div>
        <div className="gm-cup-field gm-cup-field--mb0">
          <label className="gm-cup-flabel" htmlFor={`${idPrefix}-exp`}>
            Data de expiração
          </label>
          <input
            id={`${idPrefix}-exp`}
            className="gm-cup-finput"
            type="date"
            value={draft.expiradoEm}
            onChange={(e) => setDraft((p) => ({ ...p, expiradoEm: e.target.value }))}
          />
        </div>
      </div>

      <div className="gm-cup-field">
        <label className="gm-cup-flabel" htmlFor={`${idPrefix}-desc`}>
          Descrição interna
        </label>
        <input
          id={`${idPrefix}-desc`}
          className="gm-cup-finput"
          placeholder="Ex: Lançamento da plataforma — Abril/2026"
          value={draft.descricaoInterna}
          onChange={(e) => setDraft((p) => ({ ...p, descricaoInterna: e.target.value }))}
        />
      </div>

      <div className="gm-cup-field gm-cup-field--mb0">
        <div className="gm-cup-toggle-row">
          <div>
            <div className="gm-cup-toggle-title">Ativar imediatamente</div>
            <div className="gm-cup-toggle-sub">Cupom disponível assim que salvo</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={draft.ativarImediato}
            className={cn("gm-cup-toggle", draft.ativarImediato ? "on" : "off")}
            onClick={() => setDraft((p) => ({ ...p, ativarImediato: !p.ativarImediato }))}
          />
        </div>
      </div>
    </>
  );

  return (
    <div className="gm-cup-page">
      <div className="gm-cup-page-head">
        <div>
          <div className="gm-cup-title">Cupons & Promoções</div>
          <div className="gm-cup-sub">
            Crie descontos, trials estendidos e promoções para atrair e reter clientes
          </div>
        </div>
        <div className="gm-cup-head-actions">
          <button type="button" className="gm-cup-btn-o" onClick={exportCsv}>
            <IconPencilBtn />
            Exportar CSV
          </button>
          <button
            type="button"
            className="gm-cup-btn-p"
            onClick={() => {
              setCreateDraft(emptyDraft());
              document.getElementById("gm-cup-create-anchor")?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            <IconPlus />
            Novo cupom
          </button>
        </div>
      </div>

      <div className="gm-cup-kpi4">
        <div className="gm-cup-kpi gm-cup-kpi--pu">
          <div className="gm-cup-kl">Cupons ativos</div>
          <div className="gm-cup-kv">{kpis.ativos}</div>
          <div className="gm-cup-ks">de {kpis.totalCadastrados} cadastrados</div>
        </div>
        <div className="gm-cup-kpi gm-cup-kpi--gr">
          <div className="gm-cup-kl">Usos este mês</div>
          <div className="gm-cup-kv">{kpis.usosMes}</div>
          <div className="gm-cup-ks">cupons aplicados</div>
          <div className="gm-cup-kd gm-cup-kd-up">
            {kpis.deltaUsos >= 0 ? "↑ +" : "↓ "}
            {Math.abs(kpis.deltaUsos)} vs mês anterior
          </div>
        </div>
        <div className="gm-cup-kpi gm-cup-kpi--am">
          <div className="gm-cup-kl">Desconto concedido</div>
          <div className="gm-cup-kv gm-cup-kv--sm">{brlFromCentavos(kpis.descontoMesCentavos)}</div>
          <div className="gm-cup-ks">total de descontos este mês</div>
        </div>
        <div className="gm-cup-kpi gm-cup-kpi--bl">
          <div className="gm-cup-kl">Mais usado</div>
          <div className="gm-cup-kv gm-cup-kv--mono">{kpis.maisUsadoCodigo}</div>
          <div className="gm-cup-ks">
            {kpis.maisUsadoUsos} usos · {kpis.maisUsadoTipo}
          </div>
        </div>
      </div>

      <div className="gm-cup-g21">
        <div className="gm-cup-col-left">
          <div className="gm-cup-card">
            <div className="gm-cup-toolbar">
              <div className="gm-cup-search-wrap">
                <svg className="gm-cup-search-ic" width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                  <circle cx="6" cy="6" r="4" />
                  <line x1="9.5" y1="9.5" x2="12.5" y2="12.5" />
                </svg>
                <input
                  className="gm-cup-search-in"
                  placeholder="Buscar código..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Buscar código"
                />
              </div>
              <select
                className="gm-cup-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                aria-label="Filtrar por status"
              >
                <option value="todos">Todos os status</option>
                <option value="ativos">Ativos</option>
                <option value="expirados">Expirados</option>
                <option value="pausados">Pausados</option>
              </select>
              <select
                className="gm-cup-select"
                value={tipoFilter}
                onChange={(e) => setTipoFilter(e.target.value as TipoFilter)}
                aria-label="Filtrar por tipo"
              >
                <option value="todos">Todos os tipos</option>
                <option value="percentual">% desconto</option>
                <option value="fixo">R$ fixo</option>
                <option value="trial">Trial grátis</option>
              </select>
            </div>

            <table className="gm-cup-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Tipo</th>
                  <th>Desconto</th>
                  <th>Planos</th>
                  <th>Usos</th>
                  <th>Validade</th>
                  <th>Status</th>
                  <th className="gm-cup-th-actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ c, visual }) => {
                  const dim = visual === "pausado";
                  const dimExp = visual === "expirado" || visual === "esgotado";
                  const rowOp = dim ? 0.6 : dimExp ? 0.5 : 1;
                  const pctW = usagePct(c);
                  const barClass =
                    c.tipo === "fixo"
                      ? "gm-cup-usage-fill--fix"
                      : c.tipo === "trial"
                        ? "gm-cup-usage-fill--trial"
                        : dim || dimExp
                          ? "gm-cup-usage-fill--muted"
                          : "gm-cup-usage-fill--pct";
                  const usosLabel =
                    c.maxUsos == null ? `${c.totalUsos} / ∞` : `${c.totalUsos} / ${c.maxUsos}`;

                  return (
                    <tr key={c.id} style={{ opacity: rowOp }}>
                      <td>
                        <button
                          type="button"
                          className={cn("gm-cup-code", dim || dimExp ? "gm-cup-code--muted" : undefined)}
                          onClick={() => copyCode(c.codigo)}
                        >
                          {c.codigo}
                          <IconCopy />
                        </button>
                      </td>
                      <td>
                        <span
                          className={cn(
                            "gm-cup-type",
                            c.tipo === "percentual" && "gm-cup-type-pct",
                            c.tipo === "fixo" && "gm-cup-type-fix",
                            c.tipo === "trial" && "gm-cup-type-trial",
                          )}
                        >
                          {c.tipo === "percentual" ? "% desconto" : c.tipo === "fixo" ? "R$ fixo" : "Trial grátis"}
                        </span>
                      </td>
                      <td>
                        {c.tipo === "percentual" ? (
                          <span className={cn("gm-cup-desc-pct", dim || dimExp ? "gm-cup-txt-muted" : undefined)}>
                            {c.valor}%
                          </span>
                        ) : c.tipo === "fixo" ? (
                          <span className={cn("gm-cup-desc-fix", dim || dimExp ? "gm-cup-txt-muted" : undefined)}>
                            R$ {c.valor}
                          </span>
                        ) : (
                          <span className={cn("gm-cup-desc-trial", dim || dimExp ? "gm-cup-txt-muted" : undefined)}>
                            +{c.valor} dias
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={cn("gm-cup-planos", dim || dimExp ? "gm-cup-txt-muted" : undefined)}>
                          {planosLabel(c.planos)}
                        </span>
                      </td>
                      <td>
                        <div className={cn("gm-cup-usos-num", dim || dimExp ? "gm-cup-txt-muted" : undefined)}>{usosLabel}</div>
                        <div className="gm-cup-usage-bar">
                          <div className={cn("gm-cup-usage-fill", barClass)} style={{ width: `${pctW}%` }} />
                        </div>
                      </td>
                      <td>
                        {c.expiradoEm ? (
                          <span
                            className={cn(
                              "gm-cup-val-date",
                              visual === "expirado" || visual === "esgotado" ? "gm-cup-val-date--err" : undefined,
                              dim && "gm-cup-txt-muted",
                            )}
                          >
                            {formatDatePt(c.expiradoEm)}
                          </span>
                        ) : (
                          <span className="gm-cup-val-nolimit">Sem limite</span>
                        )}
                      </td>
                      <td>
                        <span
                          className={cn(
                            "gm-cup-badge",
                            visual === "ativo" && "gm-cup-badge-ok",
                            visual === "pausado" && "gm-cup-badge-warn",
                            (visual === "expirado" || visual === "esgotado") && "gm-cup-badge-err",
                          )}
                        >
                          {visual === "ativo"
                            ? "Ativo"
                            : visual === "pausado"
                              ? "Pausado"
                              : visual === "esgotado"
                                ? "Esgotado"
                                : "Expirado"}
                        </span>
                      </td>
                      <td>
                        <div className="gm-cup-actions">
                          {visual === "expirado" || visual === "esgotado" ? (
                            <button type="button" className="gm-cup-btn-sm gm-cup-btn-sm-o" onClick={() => duplicateCupom(c)}>
                              Duplicar
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="gm-cup-ic-btn gm-cup-ic-copy"
                                title="Copiar código"
                                onClick={() => copyCode(c.codigo)}
                              >
                                <IconCopy />
                              </button>
                              {visual === "pausado" ? (
                                <button
                                  type="button"
                                  className="gm-cup-btn-sm gm-cup-btn-reativar"
                                  onClick={() => reativarCupom(c.id)}
                                >
                                  Reativar
                                </button>
                              ) : (
                                <>
                                  <button type="button" className="gm-cup-ic-btn" title="Editar" onClick={() => openEdit(c)}>
                                    <IconEdit />
                                  </button>
                                  <button
                                    type="button"
                                    className="gm-cup-ic-btn gm-cup-ic-err"
                                    title="Pausar"
                                    onClick={() => pauseCupom(c.id)}
                                  >
                                    <IconPause />
                                  </button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="gm-cup-table-foot">
              <span className="gm-cup-foot-count">{state.cupons.length} cupons cadastrados</span>
              <button
                type="button"
                className="gm-cup-foot-link"
                onClick={() => {
                  setCreateDraft(emptyDraft());
                  document.getElementById("gm-cup-create-anchor")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                + Novo cupom →
              </button>
            </div>
          </div>
        </div>

        <div id="gm-cup-create-anchor" className="gm-cup-col-right">
          <div className="gm-cup-card">
            <div className="gm-cup-card-h">
              <div className="gm-cup-card-ti">
                <div className="gm-cup-card-ic">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#8A05BE" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <line x1="6.5" y1="1" x2="6.5" y2="12" />
                    <line x1="1" y1="6.5" x2="12" y2="6.5" />
                  </svg>
                </div>
                Criar cupom
              </div>
            </div>
            <div className="gm-cup-card-body">{renderFormFields(createDraft, setCreateDraft, "create")}</div>

            <div className="gm-cup-preview-wrap">
              <div className="gm-cup-preview">
                <div className="gm-cup-preview-label">Prévia do cupom</div>
                <div className="gm-cup-preview-code">{(createDraft.codigo || "SEUCODIGO").toUpperCase()}</div>
                <div className="gm-cup-preview-value">{previewValor(createDraft)}</div>
                <div className="gm-cup-preview-meta">{previewMeta(createDraft)}</div>
                <div className="gm-cup-perfs">
                  <div className="gm-cup-perf">
                    <div className="gm-cup-perf-val">0</div>
                    <div className="gm-cup-perf-lbl">Usos</div>
                  </div>
                  <div className="gm-cup-perf">
                    <div className="gm-cup-perf-val">R$0</div>
                    <div className="gm-cup-perf-lbl">Desconto dado</div>
                  </div>
                  <div className="gm-cup-perf">
                    <div className="gm-cup-perf-val">{previewDisponiveis(createDraft)}</div>
                    <div className="gm-cup-perf-lbl">Disponíveis</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="gm-cup-form-actions">
              <button type="button" className="gm-cup-btn-o gm-cup-btn-flex1" onClick={() => setCreateDraft(emptyDraft())}>
                Cancelar
              </button>
              <button type="button" className="gm-cup-btn-p gm-cup-btn-flex2" onClick={submitCreate}>
                <IconCreate />
                Criar cupom
              </button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={(o) => !o && closeEdit()}>
        <DialogContent className="gm-cup-dialog max-w-[480px] gap-0 p-0">
          <DialogHeader className="gm-cup-dialog-head flex flex-row items-start justify-between space-y-0 border-b border-[#F5F5F5] px-5 py-4">
            <div className="flex flex-1 flex-col gap-1 pr-2 text-left">
              <DialogTitle className="text-left text-base font-bold">
                Editar cupom — {editingCupom?.codigo ?? ""}
              </DialogTitle>
              <button
                type="button"
                className="text-left text-xs font-semibold text-red-600 hover:underline"
                onClick={() => {
                  if (editId) {
                    setDeleteTargetId(editId);
                    setDeleteOpen(true);
                  }
                }}
              >
                Excluir cupom
              </button>
            </div>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto px-5 py-4">{renderFormFields(editDraft, setEditDraft, "edit")}</div>
          <DialogFooter className="gm-cup-form-actions border-t border-[#F5F5F5] !justify-between px-5 py-3">
            <button type="button" className="gm-cup-btn-o" onClick={closeEdit}>
              Cancelar
            </button>
            <button type="button" className="gm-cup-btn-p px-6" onClick={submitEdit}>
              Salvar alterações
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Excluir cupom</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#6B6B6B]">Esta ação não pode ser desfeita. Deseja excluir este cupom?</p>
          <DialogFooter className="gap-2">
            <button type="button" className="gm-cup-btn-o" onClick={() => setDeleteOpen(false)}>
              Voltar
            </button>
            <button
              type="button"
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              onClick={() => deleteTargetId && removeCupom(deleteTargetId)}
            >
              Excluir
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
