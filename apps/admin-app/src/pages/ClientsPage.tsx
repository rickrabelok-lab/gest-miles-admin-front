import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  formatSupabaseError,
  gestoresNaEquipe,
  listEquipeGestorLinks,
  listEquipes,
  listGestores,
  listPerfis,
  moveClientToEquipe,
  setGestoresForClient,
  updateUser,
  deleteUser,
  type Equipe,
  type Perfil,
} from "@/lib/adminApi";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;
const TICKET_PRO_MENSAL_EST = 2467;

type ChipFilter = "todos" | "sem_equipe" | "ativos" | "inativos";
type SortKey = "recent" | "oldest" | "potencial";

/** Contas diretas B2C: só `cliente` e sem equipa de gestão atribuída. */
function isB2cClienteRow(p: Perfil): boolean {
  return p.role === "cliente" && (p.equipe_id ?? "").toString().trim() === "";
}

function primaryDisplay(p: Perfil): string {
  const n = p.nome_completo?.trim();
  if (n) return n;
  return p.usuario_id;
}

function userInitials(display: string): string {
  const t = display.trim();
  if (t.includes("@")) {
    const local = t.split("@")[0] ?? "";
    return local.slice(0, 2).toUpperCase() || "??";
  }
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  return t.slice(0, 2).toUpperCase() || "?";
}

function providerLabel(display: string): string {
  if (!display.includes("@")) return "Conta";
  const part = display.split("@")[1]?.split(".")[0] ?? "";
  if (!part) return "Conta";
  return part.charAt(0).toUpperCase() + part.slice(1);
}

function shortId(id: string): string {
  return `${id.slice(0, 6)}…`;
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diff = Date.now() - t;
  return Math.floor(diff / 86400000);
}

type Potencial = "alto" | "medio" | "baixo";

function b2cActivity(createdAt: string | null | undefined): {
  days: number | null;
  ultimoLabel: string;
  ultimoWarn: boolean;
  cadastroStr: string;
  potencial: Potencial;
  potPct: number;
  status: "ativo" | "inativo";
  inativoMeta?: string;
} {
  const d = daysSince(createdAt);
  const cadastroStr = createdAt
    ? new Date(createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "—";

  if (d === null) {
    return {
      days: null,
      ultimoLabel: "—",
      ultimoWarn: false,
      cadastroStr,
      potencial: "baixo",
      potPct: 18,
      status: "inativo",
      inativoMeta: undefined,
    };
  }

  let ultimoLabel = "";
  if (d === 0) ultimoLabel = "Hoje";
  else if (d === 1) ultimoLabel = "há 1 dia";
  else ultimoLabel = `há ${d} dias`;

  let potencial: Potencial = "baixo";
  let potPct = 18;
  if (d < 7) {
    potencial = "alto";
    potPct = 72;
  } else if (d < 30) {
    potencial = "medio";
    potPct = 45;
  }

  const status: "ativo" | "inativo" = d > 30 ? "inativo" : "ativo";
  const ultimoWarn = d > 30;
  const inativoMeta = d > 30 ? `Inativo há ${d} dias` : undefined;

  return {
    days: d,
    ultimoLabel,
    ultimoWarn,
    cadastroStr,
    potencial,
    potPct,
    status,
    inativoMeta,
  };
}

function hashGradient(s: string, inactive: boolean): string {
  if (inactive) return "linear-gradient(135deg,#6B7280,#D1D5DB)";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const palette = [
    "linear-gradient(135deg,#6A00A3,#B56CFF)",
    "linear-gradient(135deg,#D97706,#FBBF24)",
    "linear-gradient(135deg,#16A34A,#4ADE80)",
    "linear-gradient(135deg,#2563EB,#38BDF8)",
    "linear-gradient(135deg,#DB2777,#F472B6)",
  ];
  return palette[h % palette.length]!;
}

function formatRevenueEst(count: number): string {
  const v = count * TICKET_PRO_MENSAL_EST;
  if (v >= 1000) return `R$ ${(v / 1000).toFixed(1).replace(".", ",")}k`;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
}

export default function ClientsPage() {
  const navigate = useNavigate();
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [allGestores, setAllGestores] = useState<Perfil[]>([]);
  const [equipeGestorLinks, setEquipeGestorLinks] = useState<Array<{ equipe_id: string; gestor_id: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [chip, setChip] = useState<ChipFilter>("todos");
  const [sort, setSort] = useState<SortKey>("recent");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetBulk, setSheetBulk] = useState(false);
  const [sheetTargetIds, setSheetTargetIds] = useState<string[]>([]);
  const [convEquipeId, setConvEquipeId] = useState("");
  const [convGestorId, setConvGestorId] = useState("");
  const [convRole, setConvRole] = useState<"cliente" | "cliente_gestao">("cliente_gestao");
  const [convObs, setConvObs] = useState("");
  const [convBusy, setConvBusy] = useState(false);

  const clientes = useMemo(() => perfis.filter(isB2cClienteRow), [perfis]);

  const equipesOrdenadas = useMemo(
    () => [...equipes].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [equipes],
  );

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter((c) => {
      const n = (c.nome_completo ?? "").toLowerCase();
      return n.includes(q) || c.usuario_id.toLowerCase().includes(q);
    });
  }, [clientes, search]);

  const chipFiltered = useMemo(() => {
    if (chip === "todos" || chip === "sem_equipe") return searched;
    return searched.filter((c) => {
      const a = b2cActivity(c.created_at);
      if (chip === "ativos") return a.status === "ativo";
      if (chip === "inativos") return a.status === "inativo";
      return true;
    });
  }, [searched, chip]);

  const sorted = useMemo(() => {
    const copy = [...chipFiltered];
    const potOrder = (p: Potencial) => (p === "alto" ? 0 : p === "medio" ? 1 : 2);
    copy.sort((a, b) => {
      if (sort === "potencial") {
        return potOrder(b2cActivity(a.created_at).potencial) - potOrder(b2cActivity(b.created_at).potencial);
      }
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (sort === "recent") return tb - ta;
      return ta - tb;
    });
    return copy;
  }, [chipFiltered, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sorted.slice(start, start + PAGE_SIZE);
  }, [sorted, currentPage]);

  useEffect(() => {
    setPage(1);
  }, [search, chip, sort]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const novosMes = useMemo(
    () => clientes.filter((c) => c.created_at && new Date(c.created_at).getFullYear() === y && new Date(c.created_at).getMonth() === m).length,
    [clientes, y, m],
  );

  const kpiTotal = clientes.length;
  const kpiSemEquipe = kpiTotal;
  const kpiConverted30 = 0;

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [e, p, gs, eg] = await Promise.all([
        listEquipes(),
        listPerfis({ role: "cliente", equipeIdIsNull: true }),
        listGestores(),
        listEquipeGestorLinks(),
      ]);
      setEquipes(e);
      setPerfis(p.filter(isB2cClienteRow));
      setAllGestores(gs);
      setEquipeGestorLinks(eg);
    } catch (err) {
      setError(formatSupabaseError(err));
    } finally {
      setLoading(false);
      window.dispatchEvent(new CustomEvent("gm:admin-b2c-clientes-updated"));
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const gestoresDaEquipe = useMemo(
    () => (convEquipeId.trim() ? gestoresNaEquipe(convEquipeId.trim(), allGestores, equipeGestorLinks) : []),
    [convEquipeId, allGestores, equipeGestorLinks],
  );

  const openConvert = (ids: string[], bulk: boolean) => {
    setSheetTargetIds(ids);
    setSheetBulk(bulk);
    setConvEquipeId("");
    setConvGestorId("");
    setConvRole("cliente_gestao");
    setConvObs("");
    setSheetOpen(true);
  };

  const runConversion = async () => {
    if (!convEquipeId.trim()) {
      alert("Selecione uma equipe.");
      return;
    }
    if (convRole === "cliente_gestao" && !convGestorId.trim()) {
      alert("Selecione um gestor para carteira (cliente_gestão).");
      return;
    }
    setConvBusy(true);
    try {
      for (const id of sheetTargetIds) {
        const p = perfis.find((x) => x.usuario_id === id);
        if (!p) continue;
        if (convRole === "cliente_gestao") {
          await moveClientToEquipe({ clienteId: id, equipeId: convEquipeId.trim() });
          if (convGestorId.trim()) {
            await setGestoresForClient({ clienteId: id, gestorIds: [convGestorId.trim()] });
          }
        } else {
          await updateUser({
            usuario_id: id,
            nome_completo: p.nome_completo ?? "Cliente",
            role: "cliente",
            equipe_id: convEquipeId.trim(),
            previousRole: p.role,
          });
        }
      }
      await refresh();
      setSelected(new Set());
      setSheetOpen(false);
    } catch (err) {
      alert(formatSupabaseError(err));
    } finally {
      setConvBusy(false);
    }
  };

  const runDelete = async (ids: string[]) => {
    if (!window.confirm(`Remover ${ids.length} utilizador(es) da base? Esta ação não pode ser desfeita.`)) return;
    setConvBusy(true);
    try {
      for (const id of ids) {
        await deleteUser(id);
      }
      await refresh();
      setSelected(new Set());
      setSheetOpen(false);
    } catch (err) {
      alert(formatSupabaseError(err));
    } finally {
      setConvBusy(false);
    }
  };

  const exportCsv = () => {
    const header = ["usuario_id", "nome", "cadastro", "potencial", "status"];
    const lines = sorted.map((c) => {
      const a = b2cActivity(c.created_at);
      return [c.usuario_id, `"${(c.nome_completo ?? "").replace(/"/g, '""')}"`, a.cadastroStr, a.potencial, a.status].join(",");
    });
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `usuarios-b2c-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const allOnPage = pageRows.length > 0 && pageRows.every((r) => selected.has(r.usuario_id));
  const someOnPage = pageRows.some((r) => selected.has(r.usuario_id));

  const toggleSelectAllPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPage) {
        pageRows.forEach((r) => next.delete(r.usuario_id));
      } else {
        pageRows.forEach((r) => next.add(r.usuario_id));
      }
      return next;
    });
  };

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const headerCheckboxState = allOnPage ? true : someOnPage ? "indeterminate" : false;

  return (
    <div className="gm-b2c-page">
      <div className="gm-b2c-page-hdr">
        <div>
          <div className="gm-b2c-title">Usuários B2C</div>
          <div className="gm-b2c-sub">Clientes sem equipe de gestão — autônomos na plataforma</div>
        </div>
        <div className="gm-b2c-hdr-actions">
          <button type="button" className="btn-outline" onClick={exportCsv}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
              <path d="M2 9.5V11h1.5L11 3.5 9.5 2 2 9.5Z" />
            </svg>
            Exportar
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              if (!selected.size) {
                alert("Selecione pelo menos um utilizador na tabela para converter em lote.");
                return;
              }
              openConvert([...selected], true);
            }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6.5 1a5.5 5.5 0 1 0 0 11A5.5 5.5 0 0 0 6.5 1Z" />
              <line x1="6.5" y1="4" x2="6.5" y2="9" />
              <line x1="4" y1="6.5" x2="9" y2="6.5" />
            </svg>
            Converter em lote
          </button>
        </div>
      </div>

      <div className="gm-info-banner">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" aria-hidden style={{ flexShrink: 0, marginTop: 1 }}>
          <circle cx="8" cy="8" r="6.5" />
          <line x1="8" y1="5.5" x2="8" y2="8" />
          <circle cx="8" cy="10.5" r=".7" fill="#2563EB" />
        </svg>
        <p>
          Usuários com <code>role: cliente</code> e <strong>sem equipe_id</strong> — fora das equipes de gestão. Não inclui{" "}
          <code>cliente_gestao</code>, CS, gestores nem admins. Use <strong>&quot;Converter para gestão&quot;</strong> para associar a uma
          equipe ou promover a <code>cliente_gestao</code>.
        </p>
      </div>

      <div className="gm-b2c-kpi-grid">
        <div className="gm-b2c-kpi pu">
          <div className="gm-b2c-kpi-label">Total B2C</div>
          <div className="gm-b2c-kpi-value">{kpiTotal}</div>
          <div className="gm-b2c-kpi-sub">usuários autônomos</div>
          <div className={cn("gm-b2c-kpi-delta", novosMes > 0 ? "am" : "flat")}>
            {novosMes > 0 ? `↑ +${novosMes} este mês` : "— Sem novos este mês"}
          </div>
        </div>
        <div className="gm-b2c-kpi am">
          <div className="gm-b2c-kpi-label">Sem equipe</div>
          <div className="gm-b2c-kpi-value" style={{ color: "var(--warn)" }}>
            {kpiSemEquipe}
          </div>
          <div className="gm-b2c-kpi-sub">aguardando atribuição</div>
          <div className="gm-b2c-kpi-delta am">⚠ Oportunidade</div>
        </div>
        <div className="gm-b2c-kpi gr">
          <div className="gm-b2c-kpi-label">Convertidos (30d)</div>
          <div className="gm-b2c-kpi-value">{kpiConverted30}</div>
          <div className="gm-b2c-kpi-sub">B2C → gestão ativa</div>
          <div className="gm-b2c-kpi-delta flat">— Nenhum ainda</div>
        </div>
        <div className="gm-b2c-kpi bl">
          <div className="gm-b2c-kpi-label">Potencial de receita</div>
          <div className="gm-b2c-kpi-value" style={{ fontSize: 20 }}>
            {formatRevenueEst(kpiTotal)}
          </div>
          <div className="gm-b2c-kpi-sub">se convertidos ao plano Pro</div>
          <div className="gm-b2c-kpi-delta up">↑ Estimativa mensal</div>
        </div>
      </div>

      <div className="gm-b2c-card">
        <div className="gm-b2c-toolbar">
          <div className="gm-b2c-search-wrap">
            <svg className="gm-b2c-search-ic" width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
              <circle cx="6" cy="6" r="4" />
              <line x1="9.5" y1="9.5" x2="12.5" y2="12.5" />
            </svg>
            <input
              className="gm-b2c-search-in"
              placeholder="Pesquisar por e-mail ou nome..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Pesquisar"
            />
          </div>

          <button type="button" className={cn("gm-b2c-chip", chip === "todos" && "on")} onClick={() => setChip("todos")}>
            Todos ({clientes.length})
          </button>
          <button type="button" className={cn("gm-b2c-chip", chip === "sem_equipe" && "on")} onClick={() => setChip("sem_equipe")}>
            Sem equipe
          </button>
          <button type="button" className={cn("gm-b2c-chip", chip === "ativos" && "on")} onClick={() => setChip("ativos")}>
            Ativos recentes
          </button>
          <button type="button" className={cn("gm-b2c-chip", chip === "inativos" && "on")} onClick={() => setChip("inativos")}>
            Inativos +30d
          </button>

          <div className="gm-b2c-sort">
            <span className="gm-b2c-sort-lbl">Ordenar por:</span>
            <select className="gm-b2c-sort-sel" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Ordenar por">
              <option value="recent">Mais recentes</option>
              <option value="oldest">Mais antigos</option>
              <option value="potencial">Potencial alto</option>
            </select>
          </div>
        </div>

        {selected.size > 0 ? (
          <div className="gm-b2c-bulk">
            <span className="gm-b2c-bulk-count">
              {selected.size} selecionado{selected.size !== 1 ? "s" : ""}
            </span>
            <button type="button" className="btn-primary h-7 px-3 text-xs" onClick={() => openConvert([...selected], true)}>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
                <path d="M1 5.5L4 8.5 10 2" />
              </svg>
              Converter para gestão
            </button>
            <button type="button" className="btn-outline h-7 px-3 text-xs" onClick={() => openConvert([...selected], true)}>
              Atribuir equipe
            </button>
            <button
              type="button"
              className="btn-outline ml-auto h-7 border-[var(--err-bd)] px-3 text-xs text-[var(--err)] hover:text-[var(--err)]"
              onClick={() => void runDelete([...selected])}
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
                <circle cx="5.5" cy="5.5" r="4.5" />
                <line x1="3" y1="3" x2="8" y2="8" />
              </svg>
              Remover
            </button>
          </div>
        ) : null}

        {error ? <p className="px-4 py-2 text-sm text-destructive">{error}</p> : null}

        {!loading && sorted.length === 0 ? (
          <div className="gm-b2c-empty">
            <div className="gm-b2c-empty-ic">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                <circle cx="12" cy="8" r="3.5" />
                <path d="M4 20c0-4 3.5-6.5 8-6.5s8 2.5 8 6.5" />
              </svg>
            </div>
            <div className="gm-b2c-empty-t">Nenhum usuário B2C</div>
            <div className="gm-b2c-empty-s">Todos os clientes já estão em equipes de gestão.</div>
          </div>
        ) : (
          <>
            <table className="gm-b2c-table">
              <thead>
                <tr>
                  <th>
                    <div className="flex justify-center">
                      <Checkbox
                        checked={headerCheckboxState}
                        onCheckedChange={() => toggleSelectAllPage()}
                        className="gm-b2c-cb border-[#ECECEC] data-[state=checked]:bg-[#8A05BE] data-[state=checked]:border-[#8A05BE]"
                        aria-label="Selecionar todos na página"
                      />
                    </div>
                  </th>
                  <th>Usuário</th>
                  <th>Role</th>
                  <th>Equipe</th>
                  <th>Potencial</th>
                  <th>Cadastro</th>
                  <th>Último acesso</th>
                  <th>Status</th>
                  <th className="text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={9}>
                          <Skeleton className="h-12 w-full" />
                        </td>
                      </tr>
                    ))
                  : pageRows.map((c) => {
                      const display = primaryDisplay(c);
                      const act = b2cActivity(c.created_at);
                      const initials = userInitials(display);
                      const grad = hashGradient(c.usuario_id, act.status === "inativo");
                      const potColor =
                        act.potencial === "alto"
                          ? "var(--p)"
                          : act.potencial === "medio"
                            ? "var(--warn)"
                            : "var(--t3)";
                      const fillBg =
                        act.potencial === "alto"
                          ? "linear-gradient(90deg,#6A00A3,#B56CFF)"
                          : act.potencial === "medio"
                            ? "linear-gradient(90deg,#D97706,#FBBF24)"
                            : "#9B9B9B";
                      const isSel = selected.has(c.usuario_id);
                      return (
                        <tr key={c.usuario_id} className={cn(isSel && "selected", act.status === "inativo" && "inativo-row")}>
                          <td>
                            <Checkbox
                              checked={isSel}
                              onCheckedChange={() => toggleRow(c.usuario_id)}
                              className="gm-b2c-cb border-[#ECECEC] data-[state=checked]:bg-[#8A05BE] data-[state=checked]:border-[#8A05BE]"
                              aria-label={`Selecionar ${display}`}
                            />
                          </td>
                          <td>
                            <div className="gm-b2c-user-cell">
                              <div className="gm-b2c-av" style={{ background: grad }}>
                                {initials}
                              </div>
                              <div>
                                <div className="gm-b2c-email">{display}</div>
                                {act.inativoMeta ? (
                                  <div className="gm-b2c-meta" style={{ color: "var(--warn)" }}>
                                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
                                      <path d="M5 1L1 8.5h8L5 1Z" />
                                      <line x1="5" y1="4" x2="5" y2="6.5" />
                                    </svg>
                                    {act.inativoMeta}
                                  </div>
                                ) : (
                                  <div className="gm-b2c-meta">
                                    <span>{providerLabel(display)}</span>
                                    <span className="gm-b2c-meta-dot" />
                                    <span>ID: {shortId(c.usuario_id)}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="gm-b2c-role">cliente</span>
                          </td>
                          <td>
                            <span style={{ fontSize: "12.5px", color: "var(--t3)", fontStyle: "italic" }}>— Sem equipe (B2C)</span>
                          </td>
                          <td>
                            <div className="gm-b2c-pot">
                              <div className="gm-b2c-pot-bar">
                                <div
                                  className="gm-b2c-pot-fill"
                                  style={{ width: `${act.potPct}%`, background: fillBg }}
                                />
                              </div>
                              <span className="gm-b2c-pot-lbl" style={{ color: potColor }}>
                                {act.potencial === "alto" ? "Alto" : act.potencial === "medio" ? "Médio" : "Baixo"}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span style={{ fontSize: "12.5px", color: "var(--t2)" }}>{act.cadastroStr}</span>
                          </td>
                          <td>
                            <span
                              style={{
                                fontSize: "12.5px",
                                color: act.ultimoWarn ? "var(--warn)" : "var(--t2)",
                                fontWeight: act.ultimoWarn ? 600 : 400,
                              }}
                            >
                              {act.ultimoLabel}
                            </span>
                          </td>
                          <td>
                            <span className={cn("gm-b2c-badge", act.status === "ativo" ? "ok" : "warn")}>
                              {act.status === "ativo" ? "Ativo" : "Inativo"}
                            </span>
                          </td>
                          <td>
                            <div className="gm-b2c-act">
                              <button
                                type="button"
                                className={cn("gm-b2c-btn-convert", act.status === "inativo" && "warn")}
                                onClick={() => openConvert([c.usuario_id], false)}
                              >
                                <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
                                  <path d="M1 5.5L4 8.5 10 2" />
                                </svg>
                                Converter
                              </button>
                              <button
                                type="button"
                                className="gm-b2c-ic-btn"
                                title="Ver perfil"
                                onClick={() => navigate(`/contas/${encodeURIComponent(c.usuario_id)}?voltar=${encodeURIComponent("/clients")}`)}
                              >
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                                  <circle cx="6" cy="4.5" r="2.5" />
                                  <path d="M1 11c0-2.5 2.2-4 5-4s5 1.5 5 4" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                className="gm-b2c-ic-btn danger"
                                title="Remover"
                                onClick={() => void runDelete([c.usuario_id])}
                              >
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                                  <line x1="1" y1="1" x2="11" y2="11" />
                                  <line x1="11" y1="1" x2="1" y2="11" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>

            {!loading && sorted.length > 0 ? (
              <div className="gm-b2c-pag">
                <span className="gm-b2c-pag-info">
                  {Math.min((currentPage - 1) * PAGE_SIZE + 1, sorted.length)}–{Math.min(currentPage * PAGE_SIZE, sorted.length)} de {sorted.length}{" "}
                  usuários B2C
                </span>
                <div className="gm-b2c-pag-btns">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((pn) => (
                    <button
                      key={pn}
                      type="button"
                      className={cn("gm-b2c-pag-btn", pn === currentPage && "on")}
                      onClick={() => setPage(pn)}
                    >
                      {pn}
                    </button>
                  ))}
                </div>
                <span className="gm-b2c-pag-info">
                  Linhas por página: <strong>{PAGE_SIZE}</strong>
                </span>
              </div>
            ) : null}
          </>
        )}
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="flex h-full w-full max-w-[440px] flex-col gap-0 border-l p-0 shadow-[-8px_0_48px_rgba(0,0,0,0.12)] sm:max-w-[440px]"
        >
          <SheetHeader className="border-b border-[#ECECEC] px-6 pb-4 pt-6 text-left">
            <SheetTitle className="text-base font-extrabold">
              {sheetBulk ? `Converter ${sheetTargetIds.length} usuários para gestão` : "Converter para gestão"}
            </SheetTitle>
            <SheetDescription>Associe este utilizador a uma equipe de gestão</SheetDescription>
          </SheetHeader>

          {sheetBulk ? (
            <div className="mx-6 mt-4 rounded-lg border border-[var(--warn-bd)] bg-[#FFFBEB] px-3 py-2 text-sm text-[var(--warn)]">
              Esta ação será aplicada a todos os {sheetTargetIds.length} utilizadores selecionados.
            </div>
          ) : null}

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
            {sheetTargetIds.length === 1 ? (
              (() => {
                const p = perfis.find((x) => x.usuario_id === sheetTargetIds[0]);
                if (!p) return null;
                const display = primaryDisplay(p);
                const act = b2cActivity(p.created_at);
                return (
                  <div className="rounded-[10px] bg-[#FAFAFA] p-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white"
                        style={{ background: hashGradient(p.usuario_id, act.status === "inativo") }}
                      >
                        {userInitials(display)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{display}</div>
                        <span className={cn("gm-b2c-badge mt-1 inline-flex", act.status === "ativo" ? "ok" : "warn")}>
                          {act.status === "ativo" ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="flex flex-wrap gap-1">
                {sheetTargetIds.slice(0, 12).map((id) => {
                  const p = perfis.find((x) => x.usuario_id === id);
                  const display = p ? primaryDisplay(p) : id;
                  return (
                    <div
                      key={id}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-[#ECECEC] bg-[#FAFAFA] text-[10px] font-bold"
                      title={display}
                    >
                      {userInitials(display)}
                    </div>
                  );
                })}
                {sheetTargetIds.length > 12 ? <span className="self-center text-xs text-muted-foreground">+{sheetTargetIds.length - 12}</span> : null}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="gm-b2c-equipe">Selecionar equipe *</Label>
              <select
                id="gm-b2c-equipe"
                className="h-10 w-full rounded-[9px] border border-[#ECECEC] bg-white px-3 text-sm focus:border-[#8A05BE] focus:outline-none focus:ring-[3px] focus:ring-[rgba(138,5,190,0.08)]"
                value={convEquipeId}
                onChange={(e) => {
                  setConvEquipeId(e.target.value);
                  setConvGestorId("");
                }}
              >
                <option value="">— Escolher —</option>
                {equipesOrdenadas.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gm-b2c-gestor">Atribuir gestor *</Label>
              <select
                id="gm-b2c-gestor"
                className="h-10 w-full rounded-[9px] border border-[#ECECEC] bg-white px-3 text-sm focus:border-[#8A05BE] focus:outline-none focus:ring-[3px] focus:ring-[rgba(138,5,190,0.08)] disabled:opacity-50"
                disabled={!convEquipeId.trim() || convRole !== "cliente_gestao"}
                value={convGestorId}
                onChange={(e) => setConvGestorId(e.target.value)}
              >
                <option value="">— Escolher —</option>
                {gestoresDaEquipe.map((g) => (
                  <option key={g.usuario_id} value={g.usuario_id}>
                    {g.nome_completo ?? g.usuario_id}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <span className="text-sm font-medium">Papel após conversão *</span>
              <button
                type="button"
                onClick={() => setConvRole("cliente")}
                className={cn(
                  "w-full rounded-[9px] border p-3 text-left text-sm transition-colors",
                  convRole === "cliente" ? "border-2 border-[#8A05BE] bg-[rgba(138,5,190,0.04)]" : "border border-[#ECECEC] bg-white",
                )}
              >
                <div className="font-semibold">cliente</div>
                <div className="text-xs text-muted-foreground">Acesso básico à plataforma</div>
              </button>
              <button
                type="button"
                onClick={() => setConvRole("cliente_gestao")}
                className={cn(
                  "relative w-full rounded-[9px] border p-3 text-left text-sm transition-colors",
                  convRole === "cliente_gestao" ? "border-2 border-[#8A05BE] bg-[rgba(138,5,190,0.04)]" : "border border-[#ECECEC] bg-white",
                )}
              >
                <span className="absolute right-3 top-3 rounded-full bg-[var(--ps)] px-2 py-0.5 text-[10px] font-bold text-[var(--p)]">Recomendado</span>
                <div className="font-semibold">cliente_gestao ✓</div>
                <div className="text-xs text-muted-foreground">Carteira gerenciada</div>
              </button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gm-b2c-obs">Observações (opcional)</Label>
              <Textarea id="gm-b2c-obs" className="min-h-[80px] resize-y rounded-[9px]" value={convObs} onChange={(e) => setConvObs(e.target.value)} placeholder="Notas internas…" />
            </div>
          </div>

          <SheetFooter className="mt-auto border-t border-[#ECECEC] bg-[#FAFAFA] px-6 py-4">
            <div className="flex w-full gap-3">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setSheetOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                className="btn-primary flex-1 shadow-[0_2px_10px_rgba(138,5,190,0.2)]"
                disabled={convBusy}
                onClick={() => void runConversion()}
              >
                {convBusy ? "…" : "Confirmar conversão"}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
