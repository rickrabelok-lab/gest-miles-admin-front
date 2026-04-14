import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useAdminEquipe } from "@/context/AdminEquipeContext";
import { useAccessScope } from "@/hooks/useAccessScope";
import { formatSupabaseError, listEquipes, listPerfis } from "@/lib/adminApi";
import { supabase } from "@/lib/supabase";
import {
  computeDashboardKpisEscopoFromPerfis,
  computeEquipeRoleCountsByEquipeId,
  type DashboardKpisEscopo,
} from "@/services/adminDashboardScoped";
import { listSubscriptionsAdmin } from "@/services/subscriptionsAdmin";

const PREVIEW_EQUIPES_NA_TABELA = 8;

export default function DashboardPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { scope } = useAccessScope();
  const { selectedEquipeId, equipeIdsFiltro, equipes, setSelectedEquipeId, equipeSelectionLocked } = useAdminEquipe();
  const [kpis, setKpis] = useState<{
    escopo: DashboardKpisEscopo | null;
    globais: { perfis: number; equipes: number } | null;
    subs: { active: number; expired: number; available: boolean } | null;
  }>({ escopo: null, globais: null, subs: null });
  const [contagemPorEquipe, setContagemPorEquipe] = useState<ReturnType<typeof computeEquipeRoleCountsByEquipeId> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const equipeNome = selectedEquipeId ? equipes.find((e) => e.id === selectedEquipeId)?.nome : null;
  /** KPIs por equipe só fazem sentido com uma equipe escolhida no filtro. */
  const showEquipeKpis = Boolean(selectedEquipeId);
  const equipeKpiTitle = equipeNome?.trim() || (selectedEquipeId ? "Equipe" : "");
  const showGlobal = scope?.kind === "global_admin";

  const reload = () => {
    void (async () => {
      setLoading(true);
      setErr(null);
      try {
        const [p, e, subRes, perfisAll, equipesList] = await Promise.all([
          supabase.from("perfis").select("usuario_id", { count: "exact", head: true }),
          supabase.from("equipes").select("id", { count: "exact", head: true }),
          listSubscriptionsAdmin().catch(() => ({ rows: [], available: false as const })),
          listPerfis(),
          listEquipes(),
        ]);
        if (p.error) throw p.error;
        if (e.error) throw e.error;
        const escopo = computeDashboardKpisEscopoFromPerfis(perfisAll, equipeIdsFiltro, equipesList);
        setContagemPorEquipe(computeEquipeRoleCountsByEquipeId(perfisAll));
        const active = subRes.rows.filter((r) => r.isActive).length;
        const expired = subRes.rows.filter((r) => r.isExpired).length;
        setKpis({
          escopo,
          globais: { perfis: p.count ?? 0, equipes: e.count ?? 0 },
          subs: { active, expired, available: subRes.available },
        });
      } catch (e) {
        setContagemPorEquipe(null);
        setErr(formatSupabaseError(e));
      } finally {
        setLoading(false);
      }
    })();
  };

  useEffect(() => {
    reload();
  }, [equipeIdsFiltro.join(",")]);

  useEffect(() => {
    const id = location.hash.replace(/^#/, "");
    if (!id) return;
    const t = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => window.clearTimeout(t);
  }, [location.hash]);

  const u = kpis.escopo?.total_users ?? 0;
  const c = kpis.escopo?.total_clientes ?? 0;
  const g = kpis.escopo?.total_gestores ?? 0;
  const csCount = kpis.escopo?.total_cs ?? 0;
  const adminEquipeCount = kpis.escopo?.total_admin_equipe ?? 0;
  const globU = kpis.globais?.perfis ?? 0;
  const globE = kpis.globais?.equipes ?? 0;
  const subsA = kpis.subs?.active ?? 0;
  const errLogs = 3;

  return (
    <>
      <div className="page-hdr">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-meta">
            <span>Filtrando por:</span>
            {selectedEquipeId && equipeNome ? (
              <span className="filter-chip">
                {equipeNome}
                {!equipeSelectionLocked ? (
                  <button
                    type="button"
                    className="x"
                    aria-label="Remover filtro da equipe"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedEquipeId(null);
                    }}
                  >
                    ×
                  </button>
                ) : null}
              </span>
            ) : (
              <span className="filter-chip">Todas as equipes</span>
            )}
            {selectedEquipeId ? (
              <span style={{ color: "var(--t3)" }}>· UUID: {selectedEquipeId}</span>
            ) : null}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn-outline" onClick={() => reload()} disabled={loading}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
              <path d="M1 8V11h3M12 5V2H9" />
              <path d="M2 7a5 5 0 0 1 9-2.2M11 6a5 5 0 0 1-9 2.2" />
            </svg>
            Atualizar
          </button>
          <button type="button" className="btn-primary" onClick={() => navigate("/equipes")}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
              <path d="M2 9.5V11h1.5L11 3.5 9.5 2 2 9.5Z" />
            </svg>
            Exportar
          </button>
        </div>
      </div>

      {err ? <p className="mb-4 text-sm text-red-600">{err}</p> : null}

      {showEquipeKpis ? (
        <>
          <div className="kpi-section-title">{equipeKpiTitle}</div>
          <div className="kpi-grid">
            <div className="kpi-card purple">
              <div className="kpi-label">Utilizadores</div>
              <div className="kpi-value">{loading ? "—" : u}</div>
              <div className="kpi-sub">perfis com equipe_id</div>
              <div className="kpi-delta delta-up">↑ +12 este mês</div>
            </div>
            <div className="kpi-card blue">
              <div className="kpi-label">Clientes</div>
              <div className="kpi-value">{loading ? "—" : c}</div>
              <div className="kpi-sub">roles cliente + cliente_gestao</div>
              <div className="kpi-delta delta-up">↑ +8 este mês</div>
            </div>
            <div className="kpi-card green">
              <div className="kpi-label">Gestores</div>
              <div className="kpi-value">{loading ? "—" : g}</div>
              <div className="kpi-sub">role gestor na equipe</div>
              <div className="kpi-delta delta-flat">— Sem mudança</div>
            </div>
            <div className="kpi-card teal">
              <div className="kpi-label">CS</div>
              <div className="kpi-value">{loading ? "—" : csCount}</div>
              <div className="kpi-sub">role cs na equipe</div>
              <div className="kpi-delta delta-flat">—</div>
            </div>
            <div className="kpi-card violet">
              <div className="kpi-label">Admin equipe</div>
              <div className="kpi-value">{loading ? "—" : adminEquipeCount}</div>
              <div className="kpi-sub">role admin_equipe</div>
              <div className="kpi-delta delta-flat">—</div>
            </div>
            <div className="kpi-card amber">
              <div className="kpi-label">MRR (est.)</div>
              <div className="kpi-value" style={{ fontSize: 22 }}>
                R$ —
              </div>
              <div className="kpi-sub">com base nas assinaturas</div>
              <div className="kpi-delta delta-up">↑ +R$ 0</div>
            </div>
          </div>
        </>
      ) : null}

      {showGlobal ? (
        <>
          <div className="kpi-section-title">Global (toda a base)</div>
          <div className="kpi-grid" style={{ marginBottom: 24 }}>
            <div className="kpi-card purple">
              <div className="kpi-label">Utilizadores globais</div>
              <div className="kpi-value">{loading ? "—" : globU}</div>
              <div className="kpi-sub">toda a base de usuários</div>
              <div className="kpi-delta delta-up">↑ +15 este mês</div>
            </div>
            <div className="kpi-card blue">
              <div className="kpi-label">Equipes globais</div>
              <div className="kpi-value">{loading ? "—" : globE}</div>
              <div className="kpi-sub">toda a base</div>
              <div className="kpi-delta delta-flat">— Sem mudança</div>
            </div>
            <div className="kpi-card green">
              <div className="kpi-label">Assinaturas ativas</div>
              <div className="kpi-value">{loading || !kpis.subs?.available ? "—" : subsA}</div>
              <div className="kpi-sub">planos ativos via Stripe</div>
              <div className="kpi-delta delta-up">↑ +2 este mês</div>
            </div>
            <div className="kpi-card red">
              <div className="kpi-label">Erros nos logs</div>
              <div className="kpi-value" style={{ color: "var(--err)" }}>
                {errLogs}
              </div>
              <div className="kpi-sub">últimas 24h</div>
              <div className="kpi-delta delta-dn">↑ Atenção necessária</div>
            </div>
          </div>
        </>
      ) : null}

      <div className="two-col">
        <div className="table-card">
          <div className="tc-header">
            <div className="tc-title">
              <div className="tc-icon">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#8A05BE" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                  <rect x="1.5" y="2" width="10" height="9" rx="1.5" />
                  <line x1="4.5" y1="1" x2="4.5" y2="3.5" />
                  <line x1="8.5" y1="1" x2="8.5" y2="3.5" />
                </svg>
              </div>
              Equipes cadastradas
            </div>
            <button type="button" className="tc-link" onClick={() => navigate("/equipes")}>
              Ver todas →
            </button>
          </div>
          <table className="am-table">
            <thead>
              <tr>
                <th>Equipe</th>
                <th>Clientes</th>
                <th>Gestores</th>
                <th>CS</th>
                <th>Admin equipe</th>
                <th>MRR</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {equipes.slice(0, PREVIEW_EQUIPES_NA_TABELA).map((eq) => {
                const row = contagemPorEquipe?.[eq.id] ?? {
                  clientes: 0,
                  gestores: 0,
                  cs: 0,
                  admin_equipe: 0,
                };
                const cell = (n: number) => (loading || contagemPorEquipe == null ? "—" : n);
                return (
                  <tr key={eq.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 7,
                            background: "linear-gradient(135deg,#6A00A3,#B56CFF)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 10,
                            fontWeight: 800,
                            color: "white",
                            flexShrink: 0,
                          }}
                        >
                          {eq.nome
                            .split(/\s+/)
                            .slice(0, 2)
                            .map((w) => w[0])
                            .join("")
                            .toUpperCase()
                            .slice(0, 2) || "?"}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--t1)" }}>{eq.nome}</div>
                          <div style={{ fontSize: 11, color: "var(--t3)" }}>—</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 700 }}>{cell(row.clientes)}</span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 700 }}>{cell(row.gestores)}</span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 700 }}>{cell(row.cs)}</span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 700 }}>{cell(row.admin_equipe)}</span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 700, color: "var(--ok)" }}>R$ —</span>
                    </td>
                    <td>
                      <span className="badge badge-ok">Ativa</span>
                    </td>
                  </tr>
                );
              })}
              {equipes.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", color: "var(--t3)", fontSize: 13 }}>
                    Nenhuma equipe listada
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>

          <div style={{ padding: "16px 20px", borderTop: "1px solid #F5F5F5" }}>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                color: "var(--t3)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                marginBottom: 10,
              }}
            >
              MRR — Últimos 6 meses
            </div>
            <div className="chart-bar-group">
              <div className="chart-bar" style={{ height: "45%" }} />
              <div className="chart-bar" style={{ height: "58%" }} />
              <div className="chart-bar" style={{ height: "62%" }} />
              <div className="chart-bar" style={{ height: "71%" }} />
              <div className="chart-bar" style={{ height: "85%" }} />
              <div className="chart-bar" style={{ height: "100%", opacity: 1 }} />
            </div>
            <div className="chart-labels">
              <span className="chart-label">Out</span>
              <span className="chart-label">Nov</span>
              <span className="chart-label">Dez</span>
              <span className="chart-label">Jan</span>
              <span className="chart-label">Fev</span>
              <span className="chart-label">Mar</span>
            </div>
          </div>
        </div>

        <div className="side-stats">
          <div className="side-stat-card">
            <div className="side-stat-title">Saúde do sistema</div>
            <div className="mini-stat">
              <span className="mini-stat-label">Uptime</span>
              <span className="mini-stat-value" style={{ color: "var(--ok)" }}>
                99,9%
              </span>
            </div>
            <div className="mini-stat">
              <span className="mini-stat-label">Capacidade BD</span>
              <div style={{ flex: 1, margin: "0 12px" }}>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: "34%" }} />
                </div>
              </div>
              <span className="mini-stat-value">34%</span>
            </div>
            <div className="mini-stat">
              <span className="mini-stat-label">Taxa de erro (24h)</span>
              <span className="mini-stat-value" style={{ color: "var(--warn)" }}>
                0.3%
              </span>
            </div>
            <div className="mini-stat">
              <span className="mini-stat-label">Latência média</span>
              <span className="mini-stat-value">124ms</span>
            </div>
          </div>

          <div className="activity-card">
            <div className="tc-header" style={{ padding: "13px 16px" }}>
              <div className="tc-title" style={{ fontSize: 12.5 }}>
                <div className="tc-icon">
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="#8A05BE" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <circle cx="5.5" cy="5.5" r="4.5" />
                    <line x1="5.5" y1="3.5" x2="5.5" y2="5.5" />
                    <circle cx="5.5" cy="7.5" r=".5" fill="#8A05BE" />
                  </svg>
                </div>
                Atividade recente
              </div>
              <Link to="/logs" className="tc-link" style={{ fontSize: 11 }}>
                Ver logs →
              </Link>
            </div>

            <div className="act-item">
              <div className="act-icon-wrap" style={{ background: "var(--ok-bg)" }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                  <circle cx="6" cy="4" r="2.5" />
                  <path d="M1 11c0-2.5 2.2-4 5-4s5 1.5 5 4" />
                </svg>
              </div>
              <div>
                <div className="act-msg">
                  <strong>Novo usuário</strong> registrado na equipe
                </div>
                <div className="act-time">há 12 minutos</div>
              </div>
            </div>
            <div className="act-item">
              <div className="act-icon-wrap" style={{ background: "var(--ps)" }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#8A05BE" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                  <rect x="1" y="2.5" width="10" height="7" rx="1.5" />
                  <line x1="1" y1="5" x2="11" y2="5" />
                </svg>
              </div>
              <div>
                <div className="act-msg">
                  Assinatura <strong>Pro Plan</strong> ativada
                </div>
                <div className="act-time">há 1 hora</div>
              </div>
            </div>
            <div className="act-item">
              <div className="act-icon-wrap" style={{ background: "var(--warn-bg)" }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                  <path d="M6 1L1 10.5h10L6 1Z" />
                  <line x1="6" y1="5" x2="6" y2="7.5" />
                  <circle cx="6" cy="9" r=".5" fill="#D97706" />
                </svg>
              </div>
              <div>
                <div className="act-msg">
                  <strong>Aviso</strong> no módulo de Logs
                </div>
                <div className="act-time">há 3 horas</div>
              </div>
            </div>
            <div className="act-item">
              <div className="act-icon-wrap" style={{ background: "#F0F0F0" }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#6B6B6B" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                  <circle cx="6" cy="4.5" r="2.5" />
                  <path d="M1 11c0-2.5 2.2-4 5-4s5 1.5 5 4" />
                </svg>
              </div>
              <div>
                <div className="act-msg">
                  Gestor <strong>adicionado</strong> à equipe
                </div>
                <div className="act-time">ontem</div>
              </div>
            </div>
          </div>

          <div className="side-stat-card">
            <div className="side-stat-title">Acesso rápido</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Link
                to="/users"
                className="flex items-center gap-2 border border-[#ECECEC] bg-[#FAFAFA] px-2.5 py-[7px] rounded-lg transition hover:border-[#8A05BE]"
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#8A05BE" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                  <circle cx="6.5" cy="4.5" r="2.5" />
                  <path d="M1 12c0-2.5 2.5-4 5.5-4s5.5 1.5 5.5 4" />
                  <line x1="10" y1="4" x2="10" y2="8" />
                  <line x1="8" y1="6" x2="12" y2="6" />
                </svg>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--t1)" }}>Criar novo usuário</span>
                <svg style={{ marginLeft: "auto" }} width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="#9B9B9B" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
                  <polyline points="3,2 8,5.5 3,9" />
                </svg>
              </Link>
              <Link
                to="/equipes"
                className="flex items-center gap-2 border border-[#ECECEC] bg-[#FAFAFA] px-2.5 py-[7px] rounded-lg transition hover:border-[#8A05BE]"
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#8A05BE" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                  <rect x="1.5" y="2" width="10" height="9" rx="1.5" />
                  <line x1="4.5" y1="1" x2="4.5" y2="3.5" />
                  <line x1="8.5" y1="1" x2="8.5" y2="3.5" />
                </svg>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--t1)" }}>Nova equipe</span>
                <svg style={{ marginLeft: "auto" }} width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="#9B9B9B" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
                  <polyline points="3,2 8,5.5 3,9" />
                </svg>
              </Link>
              <Link
                to="/logs"
                className="flex items-center gap-2 border border-[#ECECEC] bg-[#FAFAFA] px-2.5 py-[7px] rounded-lg transition hover:border-[#8A05BE]"
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#8A05BE" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                  <rect x="2" y="2" width="9" height="9" rx="1.5" />
                  <line x1="4.5" y1="5" x2="8.5" y2="5" />
                  <line x1="4.5" y1="7.5" x2="7" y2="7.5" />
                </svg>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--t1)" }}>Ver logs de erro</span>
                <span
                  style={{
                    marginLeft: "auto",
                    background: "var(--err-bg)",
                    color: "var(--err)",
                    fontSize: 9.5,
                    fontWeight: 700,
                    padding: "1px 6px",
                    borderRadius: 20,
                  }}
                >
                  3
                </span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
