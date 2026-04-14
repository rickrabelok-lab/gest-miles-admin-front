import { useMemo, useState } from "react";

import { useAssinaturasAdmin } from "@/hooks/useAssinaturasAdmin";
import type { SubscriptionView } from "@/services/subscriptionsAdmin";

function pickRawString(raw: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function planClassFromRaw(raw: Record<string, unknown>): "plan-basic" | "plan-pro" | "plan-ent" {
  const p = pickRawString(raw, ["plan", "plano", "price_id", "product_name", "tier"]).toLowerCase();
  if (p.includes("enterprise") || p.includes("ent")) return "plan-ent";
  if (p.includes("pro")) return "plan-pro";
  return "plan-basic";
}

function planLabelFromRaw(raw: Record<string, unknown>): string {
  const explicit = pickRawString(raw, ["plan", "plano", "product_name", "tier"]);
  if (explicit) return explicit;
  const c = planClassFromRaw(raw);
  if (c === "plan-ent") return "⭐ Enterprise";
  if (c === "plan-pro") return "Pro";
  return "Básico";
}

function statusBadge(r: SubscriptionView) {
  const s = r.status.toLowerCase();
  if (r.isExpired || s.includes("cancel") || s.includes("ended")) {
    return <span className="badge badge-err">Inativa</span>;
  }
  if (r.isActive) {
    if (s.includes("trial") || s === "trialing") return <span className="badge badge-info">Trial</span>;
    return <span className="badge badge-ok">Ativa</span>;
  }
  if (s.includes("past") || s.includes("inad")) return <span className="badge badge-warn">Inadimplente</span>;
  return <span className="badge badge-off">{r.status}</span>;
}

export default function AssinaturasPage() {
  const { rows, available, loading, error, extend30, refetch } = useAssinaturasAdmin();
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.label.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const nTotal = rows.length;
  const nActive = rows.filter((r) => r.isActive).length;
  const nInactive = rows.filter((r) => !r.isActive || r.isExpired).length;
  const nRenewSoon = rows.filter((r) => r.daysRemaining != null && r.daysRemaining <= 30 && r.daysRemaining >= 0).length;
  const nTrial = rows.filter((r) => r.status.toLowerCase().includes("trial")).length;
  const nInadimpl = rows.filter(
    (r) => r.status.toLowerCase().includes("past_due") || r.status.toLowerCase().includes("inad"),
  ).length;

  const chartMonths = ["Ago", "Set", "Out", "Nov", "Dez", "Jan", "Fev", "Mar"];
  const chartHeights = [38, 52, 61, 68, 75, 82, 88, 100];
  const chartOpacities = [0.5, 0.55, 0.6, 0.65, 0.75, 0.82, 0.88, 1];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="page-hdr" style={{ alignItems: "flex-start" }}>
        <div>
          <div className="page-title" style={{ fontSize: 22, letterSpacing: "-0.6px" }}>
            Assinaturas & Receita
          </div>
          <p style={{ fontSize: 12, color: "var(--t3)", marginTop: 3, maxWidth: 520, lineHeight: 1.45 }}>
            Controle financeiro completo — B2B, receita, despesas e base de clientes. Dados da tabela{" "}
            <code style={{ fontSize: 11 }}>subscriptions</code> no Supabase.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button type="button" className="btn-outline" disabled={loading} onClick={() => void refetch()}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
              <path d="M2 9.5V11h3M12 5V2H9" />
              <path d="M2 7a5 5 0 0 1 9-2.2M11 6a5 5 0 0 1-9 2.2" />
            </svg>
            Sincronizar Stripe
          </button>
          <button type="button" className="btn-outline" disabled title="Em breve">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
              <path d="M2 9.5V11h1.5L11 3.5 9.5 2 2 9.5Z" />
              <line x1="7.5" y1="3.5" x2="9.5" y2="5.5" />
            </svg>
            Exportar CSV
          </button>
          <button type="button" className="btn-primary" disabled title="Em breve">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <line x1="6.5" y1="1" x2="6.5" y2="12" />
              <line x1="1" y1="6.5" x2="12" y2="6.5" />
            </svg>
            Nova assinatura
          </button>
        </div>
      </div>

      {error ? <p style={{ fontSize: 13, color: "var(--err)" }}>{error}</p> : null}
      {!available && !loading ? (
        <p style={{ fontSize: 13, color: "var(--t2)" }}>
          Tabela <code>subscriptions</code> não disponível ou sem permissão (RLS).
        </p>
      ) : null}

      {available ? (
        <>
          <div>
            <div className="kpi-section-title">Receita</div>
            <div className="kpi-grid" style={{ marginBottom: 0 }}>
              <div className="kpi-card purple">
                <div className="kpi-label">MRR</div>
                <div className="kpi-value" style={{ fontSize: 26 }}>
                  —
                </div>
                <div className="kpi-sub">receita mensal recorrente (ligue valores na tabela / Stripe)</div>
                <div className="kpi-delta delta-flat">—</div>
              </div>
              <div className="kpi-card blue">
                <div className="kpi-label">ARR</div>
                <div className="kpi-value" style={{ fontSize: 26 }}>
                  —
                </div>
                <div className="kpi-sub">receita anual recorrente</div>
                <div className="kpi-delta delta-flat">—</div>
              </div>
              <div className="kpi-card green">
                <div className="kpi-label">Assinaturas ativas</div>
                <div className="kpi-value" style={{ fontSize: 26 }}>
                  {loading ? "—" : nActive}
                </div>
                <div className="kpi-sub">na base subscriptions</div>
                <div className="kpi-delta delta-up">↑ {nTotal ? `${Math.round((nActive / nTotal) * 100)}% do total` : "—"}</div>
              </div>
              <div className="kpi-card amber">
                <div className="kpi-label">Renovação ≤ 30 dias</div>
                <div className="kpi-value" style={{ fontSize: 26 }}>
                  {loading ? "—" : nRenewSoon}
                </div>
                <div className="kpi-sub">com fim de período próximo</div>
                <div className="kpi-delta delta-flat">—</div>
              </div>
            </div>
          </div>

          <div>
            <div className="kpi-section-title">Clientes & Saúde</div>
            <div className="kpi-grid" style={{ marginBottom: 0 }}>
              <div className="kpi-card green">
                <div className="kpi-label">Ativas / válidas</div>
                <div className="kpi-value" style={{ fontSize: 26, color: "var(--ok)" }}>
                  {loading ? "—" : nActive}
                </div>
                <div className="kpi-sub">de {loading ? "—" : nTotal} assinaturas totais</div>
                <div className="kpi-delta delta-up">{nTotal ? `${((nActive / nTotal) * 100).toFixed(1)}% com acesso` : "—"}</div>
              </div>
              <div className="kpi-card red">
                <div className="kpi-label">Inativas / encerradas</div>
                <div className="kpi-value" style={{ fontSize: 26, color: "var(--err)" }}>
                  {loading ? "—" : nInactive}
                </div>
                <div className="kpi-sub">expiradas ou canceladas</div>
                <div className="kpi-delta delta-dn">{nInactive ? "Requer atenção" : "—"}</div>
              </div>
              <div className="kpi-card amber">
                <div className="kpi-label">Churn rate</div>
                <div className="kpi-value" style={{ fontSize: 26, color: "var(--warn)" }}>
                  —
                </div>
                <div className="kpi-sub">últimos 30 dias (histórico na BD)</div>
                <div className="kpi-delta delta-flat">— Abaixo da média</div>
              </div>
              <div className="kpi-card blue">
                <div className="kpi-label">LTV médio</div>
                <div className="kpi-value" style={{ fontSize: 26 }}>
                  —
                </div>
                <div className="kpi-sub">lifetime value estimado</div>
                <div className="kpi-delta delta-flat">—</div>
              </div>
            </div>
          </div>

          <div className="assin-two-col">
            <div className="assin-scard">
              <div className="assin-scard-h">
                <div className="tc-title">
                  <div className="tc-icon">
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#8A05BE" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                      <polyline points="1,10 4,6.5 7,8.5 10,3 13,5" />
                    </svg>
                  </div>
                  Evolução do MRR
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ok)" }}>+R$ — este mês</span>
              </div>
              <div style={{ padding: "16px 20px" }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 80, marginBottom: 8 }}>
                  {chartHeights.map((h, i) => (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <div
                        style={{
                          width: "100%",
                          height: `${h}%`,
                          minHeight: 4,
                          borderRadius: "4px 4px 0 0",
                          background: "linear-gradient(to top, #6A00A3, #B56CFF)",
                          opacity: chartOpacities[i],
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div className="chart-labels">
                  {chartMonths.map((m, i) => (
                    <span key={m} className="chart-label" style={i === chartMonths.length - 1 ? { color: "var(--p)", fontWeight: 700 } : undefined}>
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="assin-scard">
              <div className="assin-scard-h">
                <div className="tc-title">
                  <div className="tc-icon">
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#8A05BE" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                      <rect x="1.5" y="2.5" width="10" height="8" rx="1.5" />
                      <line x1="4.5" y1="5.5" x2="8.5" y2="5.5" />
                      <line x1="4.5" y1="7.5" x2="6.5" y2="7.5" />
                    </svg>
                  </div>
                  Receita × Despesa — consolidado
                </div>
              </div>
              <div style={{ padding: "14px 16px 8px", borderBottom: "1px solid #F7F7F7" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ok)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>
                  Entradas
                </div>
                <p style={{ fontSize: 12, color: "var(--t3)", marginBottom: 8 }}>Resumo por plano quando houver colunas de valor na tabela.</p>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 4px", borderTop: "1px solid #F5F5F5" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)" }}>Total receita</span>
                  <span style={{ fontSize: 14, fontWeight: 900, color: "var(--ok)" }}>—</span>
                </div>
              </div>
              <div style={{ padding: "10px 16px 8px", borderBottom: "1px solid #F7F7F7" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--err)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>
                  Saídas
                </div>
                <p style={{ fontSize: 12, color: "var(--t3)" }}>Taxas e custos quando integrados ao painel.</p>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 4px", borderTop: "1px solid #F5F5F5" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)" }}>Total despesas</span>
                  <span style={{ fontSize: 14, fontWeight: 900, color: "var(--err)" }}>—</span>
                </div>
              </div>
              <div style={{ padding: "12px 16px", background: "var(--ok-bg)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ok)" }}>Lucro líquido</span>
                <span style={{ fontSize: 18, fontWeight: 900, color: "var(--ok)" }}>—</span>
              </div>
            </div>
          </div>

          <div className="assin-scard">
            <div className="assin-scard-h">
              <div className="tc-title">
                <div className="tc-icon">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#8A05BE" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <rect x="2" y="2" width="9" height="9" rx="2" />
                    <path d="M5 6h3M6.5 4.5v3" />
                  </svg>
                </div>
                Receita B2B por empresa de gestão
              </div>
              <span style={{ fontSize: 11, color: "var(--t3)" }}>
                Total: <strong style={{ color: "var(--t1)" }}>—</strong>
              </span>
            </div>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #F5F5F5", fontSize: 12, color: "var(--t3)" }}>
              Agrupamento por equipe quando <code>equipe_id</code> existir nas linhas.
            </div>
            <table className="am-table">
              <thead>
                <tr>
                  <th>Empresa de gestão</th>
                  <th>Plano</th>
                  <th>Clientes ativos</th>
                  <th>Clientes inativos</th>
                  <th>MRR</th>
                  <th>Próx. cobrança</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={8} style={{ padding: 16, color: "var(--t3)", fontSize: 13 }}>
                    Pré-visualização: ligue receita por equipe na API para preencher esta tabela.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="assin-scard">
            <div className="assin-scard-h">
              <div className="tc-title">
                <div className="tc-icon">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#8A05BE" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <rect x="1.5" y="2" width="10" height="9" rx="1.5" />
                    <path d="M4.5 1v2" />
                    <path d="M8.5 1v2" />
                    <line x1="1.5" y1="6" x2="11.5" y2="6" />
                  </svg>
                </div>
                Todas as assinaturas
              </div>
              <div style={{ position: "relative" }}>
                <svg
                  style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="#9B9B9B"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <circle cx="5.5" cy="5.5" r="3.5" />
                  <line x1="8.5" y1="8.5" x2="11" y2="11" />
                </svg>
                <input
                  placeholder="Buscar assinatura…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    height: 32,
                    borderRadius: 8,
                    border: "1.5px solid var(--bd)",
                    background: "var(--bg)",
                    padding: "0 10px 0 28px",
                    fontSize: 12,
                    fontFamily: "inherit",
                    color: "var(--t1)",
                    width: 200,
                  }}
                />
              </div>
            </div>

            <div className="assin-tabs">
              <div className="assin-tab assin-tab-active">
                Todas <span className="assin-tab-count assin-tab-count-p">{nTotal}</span>
              </div>
              <div className="assin-tab">
                Ativas <span className="assin-tab-count assin-tab-count-ok">{nActive}</span>
              </div>
              <div className="assin-tab">
                Inativas <span className="assin-tab-count assin-tab-count-off">{nInactive}</span>
              </div>
              <div className="assin-tab">
                Inadimplentes <span className="assin-tab-count assin-tab-count-warn">{nInadimpl}</span>
              </div>
              <div className="assin-tab">
                Trial <span className="assin-tab-count assin-tab-count-ok">{nTrial}</span>
              </div>
            </div>

            {!loading && filtered.length === 0 ? (
              <p style={{ padding: "16px 20px", fontSize: 13, color: "var(--t3)" }}>Nenhum dado encontrado.</p>
            ) : null}

            <div style={{ overflowX: "auto" }}>
              <table className="am-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Gestor</th>
                    <th>Plano</th>
                    <th>Valor/mês</th>
                    <th>Início</th>
                    <th>Próx. cobr.</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i} style={{ borderTop: "1px solid #f1f5f9" }}>
                          <td colSpan={8} style={{ padding: 12 }}>
                            <div style={{ height: 14, borderRadius: 6, background: "#e2e8f0" }} />
                          </td>
                        </tr>
                      ))
                    : filtered.map((r) => {
                        const emailLine = pickRawString(r.raw, ["email", "customer_email", "user_email"]);
                        const nomeLine = r.label.includes("@") ? r.label : r.label;
                        const subLine = r.label.includes("@") ? "" : emailLine || "";
                        const planClass = planClassFromRaw(r.raw);
                        const valor = pickRawString(r.raw, ["amount", "valor", "price", "mrr", "valor_mensal"]);
                        const inicio =
                          pickRawString(r.raw, ["created_at", "starts_at", "start_at", "data_inicio"]) || "—";
                        const planLbl = planLabelFromRaw(r.raw);
                        return (
                          <tr key={r.id}>
                            <td>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--t1)" }}>{nomeLine}</div>
                              {subLine ? (
                                <div style={{ fontSize: 11, color: "var(--t3)" }}>{subLine}</div>
                              ) : r.label.includes("@") ? (
                                <div style={{ fontSize: 11, color: "var(--t3)" }}>{r.label}</div>
                              ) : null}
                            </td>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <div
                                  style={{
                                    width: 22,
                                    height: 22,
                                    borderRadius: "50%",
                                    background: "linear-gradient(135deg,#6A00A3,#B56CFF)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: 9,
                                    fontWeight: 800,
                                    color: "white",
                                  }}
                                >
                                  —
                                </div>
                                <span style={{ fontSize: 12.5, color: "var(--t2)" }}>—</span>
                              </div>
                            </td>
                            <td>
                              <span className={planClass === "plan-ent" ? "plan-ent" : planClass === "plan-pro" ? "plan-pro" : "plan-basic"}>{planLbl}</span>
                            </td>
                            <td>
                              <span style={{ fontWeight: 700, color: "var(--p)" }}>{valor ? valor : "—"}</span>
                            </td>
                            <td>
                              <span style={{ fontSize: 12, color: "var(--t3)" }}>{inicio.length > 18 ? inicio.slice(0, 16) + "…" : inicio}</span>
                            </td>
                            <td>
                              {r.isExpired ? (
                                <span style={{ fontSize: 12.5, color: "var(--err)", fontWeight: 600 }}>Vencida</span>
                              ) : r.endsAt ? (
                                <span style={{ fontSize: 12.5, color: "var(--t2)" }}>{r.endsAt.toLocaleDateString("pt-BR")}</span>
                              ) : (
                                <span style={{ fontSize: 12.5, color: "var(--t3)" }}>—</span>
                              )}
                            </td>
                            <td>{statusBadge(r)}</td>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end", flexWrap: "wrap" }}>
                                <span className="ic-btn" title="Em breve" aria-hidden>
                                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                                    <path d="M8.5 1.5L10.5 3.5 4 10H2V8L8.5 1.5Z" />
                                  </svg>
                                </span>
                                <span className="ic-btn" title="Em breve" aria-hidden>
                                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                                    <rect x="1.5" y="2.5" width="9" height="7" rx="1.5" />
                                    <line x1="1.5" y1="5" x2="10.5" y2="5" />
                                  </svg>
                                </span>
                                {typeof r.raw.id === "string" ? (
                                  <button
                                    type="button"
                                    className="ic-btn ic-btn-live"
                                    style={{
                                      borderColor: r.isExpired ? "rgba(22,163,74,0.2)" : undefined,
                                      background: r.isExpired ? "var(--ok-bg)" : undefined,
                                      color: r.isExpired ? "var(--ok)" : undefined,
                                      width: "auto",
                                      minWidth: 28,
                                      padding: "0 9px",
                                      fontSize: 11,
                                      fontWeight: 700,
                                    }}
                                    disabled={busyId === r.id}
                                    title="+30 dias"
                                    onClick={async () => {
                                      setBusyId(r.id);
                                      try {
                                        await extend30(r.id);
                                      } catch (e) {
                                        alert(e instanceof Error ? e.message : String(e));
                                      } finally {
                                        setBusyId(null);
                                      }
                                    }}
                                  >
                                    {busyId === r.id ? "…" : r.isExpired ? "Reativar" : "+30 dias"}
                                  </button>
                                ) : (
                                  <span style={{ fontSize: 11, color: "var(--t3)" }}>Sem id</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                </tbody>
              </table>
            </div>

            <div
              style={{
                padding: "12px 16px",
                borderTop: "1px solid #F7F7F7",
                background: "#FAFAFA",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 12, color: "var(--t3)" }}>
                Mostrando {filtered.length} de {nTotal} assinaturas
                {search.trim() ? " (filtradas)" : ""}
              </span>
              <span style={{ fontSize: 12, color: "var(--t3)" }}>1–{filtered.length} de {nTotal}</span>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
