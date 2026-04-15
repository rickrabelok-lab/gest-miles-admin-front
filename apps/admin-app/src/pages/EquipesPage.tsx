import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAccessScope } from "@/hooks/useAccessScope";
import { canManageEquipesGlobally, canViewGlobalEquipesList } from "@/lib/accessScope";
import {
  createEquipe,
  formatSupabaseError,
  listEquipeCsLinks,
  listEquipeGestorLinks,
  listEquipes,
  listPerfis,
  type Equipe,
} from "@/lib/adminApi";
import { listSubscriptionsAdmin, type SubscriptionView } from "@/services/subscriptionsAdmin";

function pickRawString(raw: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function pickNumberFromRaw(raw: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim()) {
      const cleaned = v.replace(/[^\d.,-]/g, "").replace(",", ".");
      const n = Number(cleaned);
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

function planLabelFromRaw(raw: Record<string, unknown>): string {
  const p = (pickRawString(raw, ["plan", "plano", "price_id", "product_name", "tier"]) ?? "").toLowerCase();
  if (p.includes("enterprise") || p.includes("ent")) return "⭐ Enterprise";
  if (p.includes("pro")) return "Pro";
  return "Básico";
}

function initialsFromNome(nome: string): string {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  if (p.length >= 2) return `${p[0]![0]!}${p[1]![0]!}`.toUpperCase();
  return (nome.trim().slice(0, 2) || "EQ").toUpperCase();
}

function formatBrl(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatMesAnoPt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const s = d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function shortUuid(id: string): string {
  if (id.length <= 22) return id;
  return `${id.slice(0, 8)}…`;
}

export type EquipeListRow = {
  equipe: Equipe;
  nGestores: number;
  nCs: number;
  nClientes: number;
  mrr: number;
  planLabel: string;
};

export function buildEquipeListRows(params: {
  equipes: Equipe[];
  perfis: Array<{ usuario_id: string; role: string; equipe_id: string | null }>;
  gestorLinks: Array<{ equipe_id: string; gestor_id: string }>;
  csLinks: Array<{ equipe_id: string; cs_id: string }>;
  subscriptions: SubscriptionView[];
}): EquipeListRow[] {
  const { equipes, perfis, gestorLinks, csLinks, subscriptions } = params;
  const gestoresPorEquipe = new Map<string, Set<string>>();
  for (const l of gestorLinks) {
    const s = gestoresPorEquipe.get(l.equipe_id) ?? new Set();
    s.add(l.gestor_id);
    gestoresPorEquipe.set(l.equipe_id, s);
  }
  const csPorEquipe = new Map<string, Set<string>>();
  for (const l of csLinks) {
    const s = csPorEquipe.get(l.equipe_id) ?? new Set();
    s.add(l.cs_id);
    csPorEquipe.set(l.equipe_id, s);
  }

  const mrrPorEquipe = new Map<string, number>();
  const planPorEquipe = new Map<string, string>();
  for (const r of subscriptions) {
    if (!r.isActive) continue;
    const eid = pickRawString(r.raw, ["equipe_id", "team_id", "equipeId"]);
    if (!eid) continue;
    const amt = pickNumberFromRaw(r.raw, ["amount", "valor", "mrr", "valor_mensal", "monthly_amount", "price"]);
    mrrPorEquipe.set(eid, (mrrPorEquipe.get(eid) ?? 0) + amt);
    if (!planPorEquipe.has(eid)) planPorEquipe.set(eid, planLabelFromRaw(r.raw));
  }

  return equipes.map((equipe) => {
    const nGestores = gestoresPorEquipe.get(equipe.id)?.size ?? 0;
    const nCs = csPorEquipe.get(equipe.id)?.size ?? 0;
    const nClientes = perfis.filter(
      (p) => p.equipe_id === equipe.id && (p.role === "cliente" || p.role === "cliente_gestao"),
    ).length;
    return {
      equipe,
      nGestores,
      nCs,
      nClientes,
      mrr: mrrPorEquipe.get(equipe.id) ?? 0,
      planLabel: planPorEquipe.get(equipe.id) ?? "Básico",
    };
  });
}

function countDistinctMembros(params: {
  gestorLinks: Array<{ equipe_id: string; gestor_id: string }>;
  csLinks: Array<{ equipe_id: string; cs_id: string }>;
  perfis: Array<{ usuario_id: string; role: string; equipe_id: string | null }>;
  equipeIds: Set<string>;
}): number {
  const seen = new Set<string>();
  for (const l of params.gestorLinks) {
    if (params.equipeIds.has(l.equipe_id)) seen.add(l.gestor_id);
  }
  for (const l of params.csLinks) {
    if (params.equipeIds.has(l.equipe_id)) seen.add(l.cs_id);
  }
  for (const p of params.perfis) {
    if (p.role === "admin_equipe" && p.equipe_id && params.equipeIds.has(p.equipe_id)) seen.add(p.usuario_id);
  }
  return seen.size;
}

const COLOR_PRESETS = [
  { id: "purple", from: "#6A00A3", to: "#B56CFF" },
  { id: "blue", from: "#1d4ed8", to: "#3b82f6" },
  { id: "green", from: "#16A34A", to: "#4ADE80" },
  { id: "amber", from: "#D97706", to: "#FBBF24" },
  { id: "pink", from: "#DB2777", to: "#F472B6" },
  { id: "red", from: "#DC2626", to: "#F87171" },
  { id: "teal", from: "#0891B2", to: "#22D3EE" },
] as const;

export default function EquipesPage() {
  const navigate = useNavigate();
  const { scope } = useAccessScope();
  const canViewEquipes = canViewGlobalEquipesList(scope);
  const canManageEquipes = canManageEquipesGlobally(scope);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [rows, setRows] = useState<EquipeListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [nomeNova, setNomeNova] = useState("");
  const [colorIdx, setColorIdx] = useState(0);
  const [planoNova, setPlanoNova] = useState<"basico" | "pro" | "enterprise">("basico");
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [eqFlat, perfis, eg, ec, subsRes] = await Promise.all([
        listEquipes(),
        listPerfis(),
        listEquipeGestorLinks(),
        listEquipeCsLinks(),
        listSubscriptionsAdmin(),
      ]);
      setEquipes(eqFlat);
      const built = buildEquipeListRows({
        equipes: eqFlat,
        perfis,
        gestorLinks: eg,
        csLinks: ec,
        subscriptions: subsRes.available ? subsRes.rows : [],
      });
      setRows(built);
      setMembroTotal(
        countDistinctMembros({
          gestorLinks: eg,
          csLinks: ec,
          perfis,
          equipeIds: new Set(eqFlat.map((e) => e.id)),
        }),
      );
    } catch (e) {
      setError(formatSupabaseError(e));
      setRows([]);
      setMembroTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canViewEquipes) {
      setLoading(false);
      return;
    }
    void load();
  }, [canViewEquipes, load]);

  const kpis = useMemo(() => {
    const totalEquipes = equipes.length;
    let totalClientes = 0;
    let totalMrr = 0;
    for (const r of rows) {
      totalClientes += r.nClientes;
      totalMrr += r.mrr;
    }
    return { totalEquipes, totalClientes, totalMrr };
  }, [equipes.length, rows]);

  const [membroTotal, setMembroTotal] = useState(0);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.equipe.nome.toLowerCase().includes(q) || r.equipe.id.toLowerCase().includes(q));
  }, [rows, search]);

  const gradientForEquipe = (id: string) => {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * 13) % COLOR_PRESETS.length;
    return COLOR_PRESETS[h] ?? COLOR_PRESETS[0]!;
  };

  if (!canViewEquipes) {
    return (
      <div className="table-card" style={{ maxWidth: 560 }}>
        <div className="tc-header">
          <div className="tc-title">Equipes</div>
        </div>
        <p style={{ fontSize: 13, color: "var(--t2)", padding: "16px 20px 20px", lineHeight: 1.55, margin: 0 }}>
          A listagem global de equipes não está disponível para o seu perfil (âmbito de equipe). Perfis{" "}
          <strong>administrador global</strong>, <strong>admin master</strong> ou <strong>admin geral</strong> (consulta) acedem a esta vista.
        </p>
      </div>
    );
  }

  return (
    <div className="eq-page-root" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="page-hdr" style={{ alignItems: "flex-start" }}>
        <div>
          <div className="page-title" style={{ fontSize: 22, letterSpacing: "-0.5px", fontWeight: 900 }}>
            Equipes
          </div>
          <p style={{ fontSize: 12, color: "var(--t3)", marginTop: 3, maxWidth: 480 }}>
            Gerencie grupos de gestão, membros e permissões
          </p>
        </div>
        {canManageEquipes ? (
          <button type="button" className="btn-primary" onClick={() => setModalOpen(true)}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <line x1="6.5" y1="1" x2="6.5" y2="12" />
              <line x1="1" y1="6.5" x2="12" y2="6.5" />
            </svg>
            Nova equipe
          </button>
        ) : null}
      </div>

      {error ? <p style={{ fontSize: 13, color: "var(--err)" }}>{error}</p> : null}
      {!loading && !error && rows.length === 0 ? (
        <p
          style={{
            fontSize: 12,
            color: "var(--t2)",
            margin: 0,
            padding: "10px 14px",
            background: "#FFF8E6",
            border: "1px solid #F5E0A8",
            borderRadius: 10,
            lineHeight: 1.5,
            maxWidth: 720,
          }}
        >
          <strong>Nenhuma equipa visível com esta sessão.</strong> Se na base de dados existem linhas em{" "}
          <code style={{ fontSize: 11 }}>public.equipes</code> (ex.: equipa do João Carvalho) e aqui aparece tudo a zero, o mais provável são{" "}
          <strong>políticas RLS</strong> em <code style={{ fontSize: 11 }}>equipes</code> que não incluem o teu{" "}
          <code style={{ fontSize: 11 }}>perfis.role</code>. No Supabase SQL Editor executa o patch do repositório{" "}
          <code style={{ fontSize: 11 }}>apps/admin-app/sql/patch-equipes-rls-select-admin-panel.sql</code> e confirma também{" "}
          <code style={{ fontSize: 11 }}>patch-is-legacy-platform-admin-admin-master.sql</code> se usas <code style={{ fontSize: 11 }}>admin_master</code>.
        </p>
      ) : null}

      <div className="kpi-grid" style={{ marginBottom: 0 }}>
        <div className="kpi-card purple">
          <div className="kpi-label">Total de equipes</div>
          <div className="kpi-value">{kpis.totalEquipes}</div>
          <div className="kpi-sub">grupos de gestão</div>
        </div>
        <div className="kpi-card blue">
          <div className="kpi-label">Total de membros</div>
          <div className="kpi-value">{membroTotal}</div>
          <div className="kpi-sub">gestores + CS + admins de equipe</div>
        </div>
        <div className="kpi-card green">
          <div className="kpi-label">Clientes gerenciados</div>
          <div className="kpi-value">{kpis.totalClientes}</div>
          <div className="kpi-sub">perfis cliente na base</div>
        </div>
        <div className="kpi-card amber">
          <div className="kpi-label">MRR total</div>
          <div className="kpi-value" style={{ fontSize: kpis.totalMrr > 999999 ? 18 : 28 }}>
            {formatBrl(kpis.totalMrr)}
          </div>
          <div className="kpi-sub">soma assinaturas ativas com equipe_id</div>
        </div>
      </div>

      <div className="table-card eq-table-card">
        <div className="eq-toolbar">
          <div className="eq-search-wrap">
            <svg className="eq-search-ic" width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <circle cx="6" cy="6" r="4" />
              <line x1="9.5" y1="9.5" x2="12.5" y2="12.5" />
            </svg>
            <input
              className="eq-search-in"
              placeholder="Pesquisar equipe..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Pesquisar equipe"
            />
          </div>
          <button type="button" className="btn-outline eq-filter-btn" disabled title="Em breve">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
              <line x1="1" y1="3" x2="11" y2="3" />
              <line x1="3" y1="6" x2="9" y2="6" />
              <line x1="5" y1="9" x2="7" y2="9" />
            </svg>
            Filtros
          </button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="am-table eq-am-table">
            <thead>
              <tr>
                <th>Equipe</th>
                <th>Gestores</th>
                <th>CS</th>
                <th>Clientes</th>
                <th>MRR</th>
                <th>Criada em</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ fontSize: 13, color: "var(--t3)", padding: "20px 16px" }}>
                    A carregar…
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ fontSize: 13, color: "var(--t3)", padding: "20px 16px" }}>
                    Nenhuma equipe encontrada.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => {
                  const g = gradientForEquipe(r.equipe.id);
                  const href = `/equipes/${encodeURIComponent(r.equipe.id)}`;
                  return (
                    <tr
                      key={r.equipe.id}
                      className="eq-row-click"
                      onClick={() => navigate(href)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") navigate(href);
                      }}
                      tabIndex={0}
                      role="link"
                      aria-label={`Abrir ${r.equipe.nome}`}
                    >
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div
                            className="eq-team-av"
                            style={{
                              background: `linear-gradient(135deg, ${g.from}, ${g.to})`,
                            }}
                          >
                            {initialsFromNome(r.equipe.nome)}
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)" }}>{r.equipe.nome}</div>
                            <div style={{ fontSize: 10.5, color: "var(--t3)", fontFamily: "monospace", marginTop: 1 }}>{shortUuid(r.equipe.id)}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span style={{ fontWeight: 700 }}>{r.nGestores}</span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 700 }}>{r.nCs}</span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: "var(--p)" }}>{r.nClientes}</span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 800, color: "var(--ok)" }}>{formatBrl(r.mrr)}</span>
                      </td>
                      <td>
                        <span style={{ fontSize: 12.5, color: "var(--t2)" }}>{formatMesAnoPt(r.equipe.created_at)}</span>
                      </td>
                      <td>
                        <span className="badge badge-ok">Ativa</span>
                      </td>
                      <td>
                        <div
                          style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <Link to={href} className="eq-btn-sm eq-btn-sm-p" onClick={(e) => e.stopPropagation()}>
                            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                              <circle cx="5.5" cy="5.5" r="4.5" />
                              <line x1="5.5" y1="3.5" x2="5.5" y2="5.5" />
                              <circle cx="5.5" cy="7.5" r=".5" fill="currentColor" />
                            </svg>
                            {canManageEquipes ? "Gerenciar" : "Ver"}
                          </Link>
                          {canManageEquipes ? (
                            <button type="button" className="ic-btn" title="Editar" aria-label="Editar" onClick={() => navigate(href)}>
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                                <path d="M8.5 1.5L10.5 3.5 4 10H2V8L8.5 1.5Z" />
                              </svg>
                            </button>
                          ) : null}
                          <button type="button" className="ic-btn danger" title="Desativar" aria-label="Desativar" disabled>
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                              <circle cx="6" cy="6" r="5" />
                              <line x1="3.5" y1="3.5" x2="8.5" y2="8.5" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="eq-table-footer">
          <span style={{ fontSize: 12, color: "var(--t3)" }}>
            Mostrando {filteredRows.length} de {rows.length} equipe{rows.length === 1 ? "" : "s"}
          </span>
          {canManageEquipes ? (
            <button type="button" className="eq-footer-link" onClick={() => setModalOpen(true)}>
              + Nova equipe →
            </button>
          ) : null}
        </div>
      </div>

      {modalOpen && canManageEquipes ? (
        <div className="eq-modal-overlay" role="presentation" onClick={() => !pending && setModalOpen(false)}>
          <div
            className="eq-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="eq-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="eq-modal-h">
              <h2 id="eq-modal-title" style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
                Nova equipe
              </h2>
              <button type="button" className="eq-modal-x" aria-label="Fechar" disabled={pending} onClick={() => setModalOpen(false)}>
                ×
              </button>
            </div>
            <div className="eq-modal-body">
              <div className="eq-config-field">
                <label className="eq-config-lbl">Nome da equipe *</label>
                <input className="eq-config-in" value={nomeNova} onChange={(e) => setNomeNova(e.target.value)} placeholder="Ex.: Equipe Sul" />
              </div>
              <div className="eq-config-field">
                <label className="eq-config-lbl">Cor da equipe</label>
                <div className="eq-color-row">
                  {COLOR_PRESETS.map((c, i) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`eq-color-chip${i === colorIdx ? " selected" : ""}`}
                      style={{ background: `linear-gradient(135deg, ${c.from}, ${c.to})` }}
                      aria-label={c.id}
                      onClick={() => setColorIdx(i)}
                    />
                  ))}
                </div>
              </div>
              <div className="eq-config-field" style={{ marginBottom: 0 }}>
                <label className="eq-config-lbl">Plano</label>
                <select
                  className="eq-config-in eq-select"
                  value={planoNova}
                  onChange={(e) => setPlanoNova(e.target.value as typeof planoNova)}
                >
                  <option value="basico">Básico</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <p style={{ fontSize: 11, color: "var(--t3)", marginTop: 10, lineHeight: 1.45 }}>
                A equipa é o topo da hierarquia; gestores, CS e admins de equipa definem-se na ficha da equipa após criar. Cor e plano são só indicadores
                visuais aqui — no Supabase grava-se o nome da equipa.
              </p>
            </div>
            <div className="eq-modal-ft">
              <button type="button" className="btn-outline" disabled={pending} onClick={() => setModalOpen(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={pending || nomeNova.trim().length < 2}
                onClick={async () => {
                  setPending(true);
                  setError(null);
                  try {
                    const id = await createEquipe({ nome: nomeNova.trim() });
                    setNomeNova("");
                    setModalOpen(false);
                    await load();
                    navigate(`/equipes/${encodeURIComponent(id)}`);
                  } catch (e) {
                    setError(formatSupabaseError(e));
                  } finally {
                    setPending(false);
                  }
                }}
              >
                Criar equipe
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
