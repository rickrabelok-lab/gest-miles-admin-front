import { useCallback, useEffect, useMemo, useState } from "react";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { listSubscriptionsAdmin, type SubscriptionView } from "@/services/subscriptionsAdmin";
import {
  ALL_FEATURE_KEYS,
  DEFAULT_PLANOS,
  FEATURE_LABELS,
  type FeatureKey,
  formatBrlFromCentavos,
  loadPlanosCatalog,
  matchSubscriptionToPlanId,
  newEmptyPlano,
  savePlanosCatalog,
  type PlanoCatalogo,
  type PlanoBadge,
} from "@/services/adminPlanosCatalog";

function pickString(raw: Record<string, unknown>, keys: string[]): string | null {
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

function parseCreated(raw: Record<string, unknown>): Date | null {
  const s = pickString(raw, ["created_at"]);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function hasAll(plan: PlanoCatalogo, keys: FeatureKey[]): boolean {
  return keys.every((k) => plan.funcionalidades.includes(k));
}

function planCardFeatures(plan: PlanoCatalogo): { text: string; ok: boolean }[] {
  const has = (k: FeatureKey) => plan.funcionalidades.includes(k);
  const maxLabel = plan.max_clientes === 0 ? "Clientes ilimitados" : `Até ${plan.max_clientes} clientes`;
  return [
    { text: maxLabel, ok: true },
    { text: plan.id === "basico" ? "CRM Milhas" : "CRM Milhas completo", ok: has("crm_milhas") },
    { text: plan.id === "basico" ? "Emissões básicas" : "Emissões & operacional", ok: has("emissoes") },
    { text: "Link público de captação", ok: has("link_captacao") },
    { text: "Insights avançados", ok: has("insights_avancados") },
    { text: "Suporte prioritário", ok: has("cs_dedicado") },
  ];
}

const MATRIX: { group: string; rows: { label: string; kind: "max" | "feature" | "all"; keys?: FeatureKey[] }[] }[] = [
  {
    group: "Gestão de Clientes",
    rows: [
      { label: "Número máx. de clientes", kind: "max" },
      { label: "CRM de milhas", kind: "feature", keys: ["crm_milhas"] },
      { label: "Carteiras de milhas", kind: "feature", keys: ["crm_milhas"] },
    ],
  },
  {
    group: "Emissões & Operacional",
    rows: [
      { label: "Registro de emissões", kind: "feature", keys: ["emissoes"] },
      { label: "Alertas automáticos", kind: "feature", keys: ["alertas"] },
      { label: "Tarefas e reuniões", kind: "feature", keys: ["tarefas", "reunioes"] },
    ],
  },
  {
    group: "Captação & Marketing",
    rows: [
      { label: "Link público de captação", kind: "feature", keys: ["link_captacao"] },
      { label: "Kanban de leads", kind: "feature", keys: ["kanban_leads"] },
      { label: "White-label B2B", kind: "feature", keys: ["white_label"] },
    ],
  },
  {
    group: "Relatórios & Insights",
    rows: [
      { label: "Dashboard básico", kind: "all" },
      { label: "Insights avançados", kind: "feature", keys: ["insights_avancados"] },
      { label: "Exportação de relatórios", kind: "feature", keys: ["relatorios"] },
    ],
  },
  {
    group: "Suporte & Integrações",
    rows: [
      { label: "Suporte via chat", kind: "all" },
      { label: "Suporte prioritário 24h", kind: "feature", keys: ["cs_dedicado"] },
      { label: "API & Webhooks", kind: "feature", keys: ["api_webhooks"] },
      { label: "Gestor de sucesso dedicado", kind: "feature", keys: ["cs_dedicado"] },
    ],
  },
];

function MatrixCell({
  plan,
  row,
}: {
  plan: PlanoCatalogo;
  row: { label: string; kind: "max" | "feature" | "all"; keys?: FeatureKey[] };
}) {
  if (row.kind === "max") {
    if (plan.max_clientes === 0) return <span className="gm-pl-check-val">∞</span>;
    return <span className="gm-pl-check-lim">{plan.max_clientes}</span>;
  }
  if (row.kind === "all") {
    return (
      <span className="gm-pl-check-yes" aria-label="Incluído">
        ✓
      </span>
    );
  }
  const keys = row.keys ?? [];
  const ok = keys.length === 0 ? true : hasAll(plan, keys);
  return ok ? (
    <span className="gm-pl-check-yes" aria-label="Incluído">
      ✓
    </span>
  ) : (
    <span className="gm-pl-check-no" aria-label="Não incluído">
      —
    </span>
  );
}

/** Entrada em reais inteiros (ex.: 2490) → centavos. */
function reaisInputToCentavos(s: string): number {
  const cleaned = s.replace(/\D/g, "");
  if (!cleaned) return 0;
  return Math.round(Number(cleaned)) * 100;
}

export default function AdminPlanosPage() {
  const [planos, setPlanos] = useState<PlanoCatalogo[]>(() => loadPlanosCatalog());
  const [subs, setSubs] = useState<SubscriptionView[]>([]);
  const [subsOk, setSubsOk] = useState(false);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<PlanoCatalogo | null>(null);

  const reloadSubs = useCallback(async () => {
    const res = await listSubscriptionsAdmin().catch(() => ({ rows: [], available: false as const }));
    setSubs(res.rows);
    setSubsOk(res.available);
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await reloadSubs();
      setLoading(false);
    })();
  }, [reloadSubs]);

  useEffect(() => {
    setPlanos(loadPlanosCatalog());
  }, []);

  const persist = useCallback((next: PlanoCatalogo[]) => {
    setPlanos(next);
    savePlanosCatalog(next);
  }, []);

  const kpis = useMemo(() => {
    const activePlanos = planos.filter((p) => p.status === "ativo");
    const nomes = activePlanos.map((p) => p.nome).join(" · ");

    const countByPlan = new Map<string, number>();
    const mrrByPlan = new Map<string, number>();
    let mrrTotal = 0;
    let assinantesAtivos = 0;
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    let novosMes = 0;
    let mrrNovoMes = 0;

    for (const s of subs) {
      if (!s.isActive) continue;
      assinantesAtivos += 1;
      const pid = matchSubscriptionToPlanId(s.raw as Record<string, unknown>, planos) ?? planos[0]?.id ?? "basico";
      countByPlan.set(pid, (countByPlan.get(pid) ?? 0) + 1);
      const amt = pickNumberFromRaw(s.raw as Record<string, unknown>, ["amount", "valor", "mrr", "valor_mensal", "monthly_amount", "price"]);
      mrrByPlan.set(pid, (mrrByPlan.get(pid) ?? 0) + amt);
      mrrTotal += amt;

      const cr = parseCreated(s.raw as Record<string, unknown>);
      if (cr && cr >= startMonth) {
        novosMes += 1;
        mrrNovoMes += amt;
      }
    }

    if (mrrTotal < 0.01 && subsOk) {
      mrrTotal = 0;
      for (const pl of planos) {
        const c = countByPlan.get(pl.id) ?? 0;
        mrrTotal += (pl.preco_mensal_centavos / 100) * c;
      }
    }

    let popularId = planos[0]?.id ?? "pro";
    let maxC = -1;
    for (const [id, c] of countByPlan) {
      if (c > maxC) {
        maxC = c;
        popularId = id;
      }
    }
    const popular = planos.find((p) => p.id === popularId);
    const popCount = countByPlan.get(popularId) ?? 0;
    const popMrr = mrrByPlan.get(popularId) ?? (popular ? (popular.preco_mensal_centavos / 100) * popCount : 0);

    return {
      planosAtivos: activePlanos.length,
      nomesPlanos: nomes || "—",
      assinantesAtivos,
      novosMes,
      mrrTotal,
      mrrNovoMes,
      popular,
      popCount,
      popMrr,
    };
  }, [planos, subs, subsOk]);

  const openNew = () => {
    const p = newEmptyPlano();
    setDraft(p);
    setModalOpen(true);
  };

  const openEdit = (id: string) => {
    const p = planos.find((x) => x.id === id);
    if (!p) return;
    setDraft({ ...p, funcionalidades: [...p.funcionalidades] });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setDraft(null);
  };

  const saveDraft = () => {
    if (!draft) return;
    const next = planos.some((p) => p.id === draft.id)
      ? planos.map((p) => (p.id === draft.id ? draft : p))
      : [...planos, draft];
    persist(next);
    closeModal();
    void reloadSubs();
  };

  const desativarPlano = (id: string) => {
    if (!window.confirm("Desativar este plano? Continuará visível como inativo.")) return;
    persist(planos.map((p) => (p.id === id ? { ...p, status: "inativo" as const } : p)));
  };

  const removePlano = (id: string) => {
    if (!window.confirm("Remover este plano do catálogo local?")) return;
    persist(planos.filter((p) => p.id !== id));
  };

  const toggleFeature = (key: FeatureKey, on: boolean) => {
    if (!draft) return;
    const set = new Set(draft.funcionalidades);
    if (on) set.add(key);
    else set.delete(key);
    setDraft({ ...draft, funcionalidades: [...set] });
  };

  const pricingUrl = (import.meta.env.VITE_PUBLIC_PRICING_URL as string | undefined)?.trim() || "/precos";

  const orderedPlanos = useMemo(() => {
    const order = ["basico", "pro", "enterprise"];
    return [...planos].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }, [planos]);

  return (
    <div className="gm-pl-page">
      <div className="gm-pl-page-hdr">
        <div>
          <div className="gm-pl-page-title">Planos & Preços</div>
          <div className="gm-pl-page-sub">Crie e gerencie os planos de assinatura da plataforma</div>
        </div>
        <div className="gm-pl-page-actions">
          <button
            type="button"
            className="btn-outline"
            onClick={() => window.open(pricingUrl.startsWith("http") ? pricingUrl : `${window.location.origin}${pricingUrl}`, "_blank", "noopener,noreferrer")}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
              <path d="M10 7.5V11H2V3h3.5" />
              <path d="M8 1h4v4" />
              <line x1="5.5" y1="7.5" x2="12" y2="1" />
            </svg>
            Ver como cliente
          </button>
          <button type="button" className="btn-primary" onClick={openNew}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <line x1="6.5" y1="1" x2="6.5" y2="12" />
              <line x1="1" y1="6.5" x2="12" y2="6.5" />
            </svg>
            Novo plano
          </button>
        </div>
      </div>

      <div className="gm-pl-kpi4">
        <div className="gm-pl-kpi gm-pl-kpi--pu">
          <div className="gm-pl-kl">Planos ativos</div>
          <div className="gm-pl-kv">{loading ? "—" : kpis.planosAtivos}</div>
          <div className="gm-pl-ks">{kpis.nomesPlanos}</div>
        </div>
        <div className="gm-pl-kpi gm-pl-kpi--gr">
          <div className="gm-pl-kl">Assinantes totais</div>
          <div className="gm-pl-kv">{loading || !subsOk ? "—" : kpis.assinantesAtivos}</div>
          <div className="gm-pl-ks">em todos os planos (subscriptions ativas)</div>
          <div className="gm-pl-kd gm-pl-kd-up">↑ +{loading || !subsOk ? "—" : kpis.novosMes} este mês</div>
        </div>
        <div className="gm-pl-kpi gm-pl-kpi--am">
          <div className="gm-pl-kl">MRR total</div>
          <div className={cn("gm-pl-kv", String(Math.round(kpis.mrrTotal)).length >= 6 && "gm-pl-kv--sm")}>
            {loading || !subsOk
              ? "—"
              : kpis.mrrTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 })}
          </div>
          <div className="gm-pl-ks">receita mensal recorrente (est.)</div>
          <div className="gm-pl-kd gm-pl-kd-up">
            ↑
            {loading || !subsOk
              ? " —"
              : ` +${kpis.mrrNovoMes.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 })} novos no mês`}
          </div>
        </div>
        <div className="gm-pl-kpi gm-pl-kpi--bl">
          <div className="gm-pl-kl">Plano mais popular</div>
          <div className="gm-pl-kv gm-pl-kv--name">{kpis.popular?.nome ?? "—"}</div>
          <div className="gm-pl-ks">
            {kpis.popular
              ? `${kpis.popCount} assinantes · ${kpis.popMrr.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 })}/mês`
              : "—"}
          </div>
        </div>
      </div>

      <div className="gm-pl-plans-grid">
        {orderedPlanos.map((plan) => {
          const count = subs.filter((s) => s.isActive && (matchSubscriptionToPlanId(s.raw as Record<string, unknown>, planos) ?? "") === plan.id).length;
          const mrrP =
            subs
              .filter((s) => s.isActive && (matchSubscriptionToPlanId(s.raw as Record<string, unknown>, planos) ?? "") === plan.id)
              .reduce((acc, s) => acc + pickNumberFromRaw(s.raw as Record<string, unknown>, ["amount", "valor", "mrr", "monthly_amount"]), 0) ||
            (plan.preco_mensal_centavos / 100) * count;
          const isPopular = plan.badge === "popular";
          const isEnt = plan.badge === "enterprise";
          const headerClass =
            plan.id === "basico" ? "gm-pl-ph-basic" : plan.id === "enterprise" ? "gm-pl-ph-ent" : "gm-pl-ph-pro";
          const feats = planCardFeatures(plan);

          return (
            <div key={plan.id} className={cn("gm-pl-plan-card", isPopular && "gm-pl-plan-card--popular")}>
              <div className={cn("gm-pl-plan-header", headerClass)}>
                {isPopular ? <div className="gm-pl-popular-badge">⭐ Mais popular</div> : null}
                {isEnt ? (
                  <div className="gm-pl-popular-badge gm-pl-popular-badge--gold">👑 Enterprise</div>
                ) : null}
                <div
                  className="gm-pl-plan-icon"
                  style={{
                    background:
                      plan.id === "basico"
                        ? "rgba(0,0,0,0.06)"
                        : plan.id === "enterprise"
                          ? "rgba(253,230,138,0.15)"
                          : "rgba(255,255,255,0.12)",
                  }}
                >
                  {plan.id === "basico" ? "📦" : plan.id === "enterprise" ? "🏆" : "🚀"}
                </div>
                <div className="gm-pl-plan-name">{plan.nome}</div>
                <div className="gm-pl-plan-desc">{plan.descricao || "—"}</div>
                <div className="gm-pl-plan-price-row">
                  <div className="gm-pl-plan-price">{formatBrlFromCentavos(plan.preco_mensal_centavos)}</div>
                  <div className="gm-pl-plan-period">/mês</div>
                </div>
              </div>
              <div className="gm-pl-plan-body">
                <div className="gm-pl-plan-stats">
                  <div className="gm-pl-plan-stat">
                    <div className={cn("gm-pl-ps-val", isPopular && "text-[#8A05BE]")}>{subsOk ? count : "—"}</div>
                    <div className="gm-pl-ps-lbl">Assinantes</div>
                  </div>
                  <div className="gm-pl-plan-stat">
                    <div className="gm-pl-ps-val" style={{ color: "var(--ok)" }}>
                      {subsOk ? mrrP.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 }) : "—"}
                    </div>
                    <div className="gm-pl-ps-lbl">MRR</div>
                  </div>
                  <div className="gm-pl-plan-stat">
                    <div className="gm-pl-ps-val">{plan.max_clientes === 0 ? "∞" : plan.max_clientes}</div>
                    <div className="gm-pl-ps-lbl">{plan.max_clientes === 0 ? "Ilimitado" : "Máx. clientes"}</div>
                  </div>
                </div>
                <div className="gm-pl-plan-features">
                  {feats.map((f) => (
                    <div key={f.text} className="gm-pl-feat-item">
                      <div className={cn("gm-pl-feat-check", f.ok ? "gm-pl-feat-check--yes" : "gm-pl-feat-check--no")}>
                        {f.ok ? (
                          <svg width="8" height="6" viewBox="0 0 8 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <polyline points="1,3 3,5 7,1" />
                          </svg>
                        ) : (
                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                            <line x1="1" y1="1" x2="7" y2="7" />
                            <line x1="7" y1="1" x2="1" y2="7" />
                          </svg>
                        )}
                      </div>
                      <span className={cn("gm-pl-feat-text", !f.ok && "gm-pl-feat-text--muted")}>{f.text}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="gm-pl-plan-footer">
                {plan.status === "ativo" ? (
                  <span className="badge badge-ok">Ativo</span>
                ) : (
                  <span className="badge badge-off">Inativo</span>
                )}
                {isPopular ? (
                  <span className="gm-pl-badge-pu">⭐ Popular</span>
                ) : isEnt ? (
                  <span className="gm-pl-badge-premium">👑 Premium</span>
                ) : null}
                <button type="button" className="gm-pl-btn-sm gm-pl-btn-sm-o" style={{ marginLeft: "auto" }} onClick={() => openEdit(plan.id)}>
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <path d="M7.5 1.5L9.5 3.5 3.5 9.5H1.5V7.5L7.5 1.5Z" />
                  </svg>
                  Editar
                </button>
                <button type="button" className="gm-pl-ic-btn gm-pl-ic-btn--err" title="Desativar" onClick={() => desativarPlano(plan.id)}>
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <circle cx="5.5" cy="5.5" r="4.5" />
                    <line x1="3" y1="3" x2="8" y2="8" />
                  </svg>
                </button>
                {!DEFAULT_PLANOS.some((d) => d.id === plan.id) ? (
                  <button type="button" className="gm-pl-ic-btn gm-pl-ic-btn--err" title="Remover" onClick={() => removePlano(plan.id)}>
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                      <line x1="2" y1="2" x2="9" y2="9" />
                      <line x1="9" y1="2" x2="2" y2="9" />
                    </svg>
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="gm-pl-matrix-card">
        <div className="gm-pl-matrix-head">
          <div className="gm-pl-matrix-ti">
            <div className="gm-pl-matrix-ic">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#8A05BE" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                <rect x="1.5" y="1.5" width="10" height="10" rx="2" />
                <line x1="4" y1="5" x2="9" y2="5" />
                <line x1="4" y1="7.5" x2="9" y2="7.5" />
              </svg>
            </div>
            Comparação de funcionalidades por plano
          </div>
          <button
            type="button"
            className="gm-pl-btn-sm gm-pl-btn-sm-o"
            onClick={() => {
              const pop = planos.find((p) => p.badge === "popular") ?? planos.find((p) => p.id === "pro");
              if (pop) openEdit(pop.id);
            }}
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
              <path d="M7.5 1.5L9.5 3.5 3.5 9.5H1.5V7.5L7.5 1.5Z" />
            </svg>
            Editar funcionalidades
          </button>
        </div>
        <table className="gm-pl-matrix-table">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Funcionalidade</th>
              <th>📦 Básico</th>
              <th style={{ color: "var(--p)" }}>🚀 Pro</th>
              <th style={{ color: "#D97706" }}>🏆 Enterprise</th>
            </tr>
          </thead>
            {MATRIX.map((g) => (
              <tbody key={g.group}>
                <tr>
                  <td colSpan={4} className="gm-pl-td-group">
                    {g.group}
                  </td>
                </tr>
                {g.rows.map((row) => (
                  <tr key={`${g.group}-${row.label}`}>
                    <td>{row.label}</td>
                    {orderedPlanos
                      .filter((p) => ["basico", "pro", "enterprise"].includes(p.id))
                      .map((p) => (
                        <td key={p.id}>
                          <MatrixCell plan={p} row={row} />
                        </td>
                      ))}
                  </tr>
                ))}
              </tbody>
            ))}
        </table>
      </div>

      <p className="gm-pl-hint">
        Dica: os planos são guardados neste browser (<code>localStorage</code>). Sincronize preços com o Stripe na página{" "}
        <a href="/monetizacao" className="text-[#8A05BE] font-semibold underline-offset-2 hover:underline">
          Monetização
        </a>
        .
      </p>

      <Dialog open={modalOpen} onOpenChange={(o) => !o && closeModal()}>
        <DialogContent className="gm-pl-dialog max-w-[560px] gap-0 border-[#ECECEC] p-0 shadow-[0_24px_80px_rgba(0,0,0,0.3)] sm:max-w-[560px]" aria-describedby={undefined}>
          <DialogHeader className="gm-pl-dialog-h">
            <DialogTitle className="text-left text-base font-extrabold tracking-tight">
              {draft && planos.some((p) => p.id === draft.id) ? `Editar plano — ${draft.nome}` : "Novo plano"}
            </DialogTitle>
            <p className="text-xs text-[#9B9B9B]">Alterações aplicadas a novos assinantes · atuais mantêm o plano</p>
          </DialogHeader>
          {draft ? (
            <div className="gm-pl-dialog-body">
              <div className="gm-pl-fgrid2">
                <div className="gm-pl-field">
                  <label className="gm-pl-flabel">Nome do plano</label>
                  <input
                    className="gm-pl-finput"
                    value={draft.nome}
                    onChange={(e) => setDraft({ ...draft, nome: e.target.value })}
                  />
                </div>
                <div className="gm-pl-field">
                  <label className="gm-pl-flabel">Status</label>
                  <select
                    className="gm-pl-fselect"
                    value={draft.status}
                    onChange={(e) => setDraft({ ...draft, status: e.target.value as PlanoCatalogo["status"] })}
                  >
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo (oculto)</option>
                  </select>
                </div>
              </div>
              <div className="gm-pl-field">
                <label className="gm-pl-flabel">Descrição</label>
                <input
                  className="gm-pl-finput"
                  placeholder="Para quem..."
                  value={draft.descricao}
                  onChange={(e) => setDraft({ ...draft, descricao: e.target.value })}
                />
              </div>
              <div className="gm-pl-fgrid2">
                <div className="gm-pl-field">
                  <label className="gm-pl-flabel">Preço mensal (R$)</label>
                  <div className="gm-pl-prefix-wrap">
                    <span className="gm-pl-prefix">R$</span>
                    <input
                      className="gm-pl-finput"
                      inputMode="numeric"
                      value={draft.preco_mensal_centavos ? String(Math.round(draft.preco_mensal_centavos / 100)) : ""}
                      onChange={(e) => setDraft({ ...draft, preco_mensal_centavos: reaisInputToCentavos(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="gm-pl-field">
                  <label className="gm-pl-flabel">Máx. de clientes</label>
                  <input
                    className="gm-pl-finput"
                    type="number"
                    min={0}
                    value={draft.max_clientes}
                    onChange={(e) => setDraft({ ...draft, max_clientes: Math.max(0, Number(e.target.value) || 0) })}
                    placeholder="0 = ilimitado"
                  />
                </div>
              </div>
              <div className="gm-pl-field">
                <span className="gm-pl-flabel">Funcionalidades incluídas</span>
                <div className="gm-pl-feature-grid">
                  {ALL_FEATURE_KEYS.map((key) => {
                    const on = draft.funcionalidades.includes(key);
                    return (
                      <div key={key} className={cn("gm-pl-feat-toggle", on && "gm-pl-feat-toggle--on")}>
                        <Label htmlFor={`feat-${key}`} className={cn("gm-pl-feat-toggle-label cursor-pointer", !on && "text-[#9B9B9B]")}>
                          {FEATURE_LABELS[key]}
                        </Label>
                        <Switch id={`feat-${key}`} checked={on} onCheckedChange={(v) => toggleFeature(key, v)} className="scale-90" />
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="gm-pl-fgrid2">
                <div className="gm-pl-field">
                  <label className="gm-pl-flabel">Badge destaque</label>
                  <select
                    className="gm-pl-fselect"
                    value={draft.badge ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDraft({
                        ...draft,
                        badge: v === "" ? undefined : (v as PlanoBadge),
                      });
                    }}
                  >
                    <option value="">Nenhum</option>
                    <option value="popular">⭐ Mais popular</option>
                    <option value="enterprise">👑 Enterprise</option>
                  </select>
                </div>
                <div className="gm-pl-field">
                  <label className="gm-pl-flabel">Trial grátis (dias)</label>
                  <input
                    className="gm-pl-finput"
                    type="number"
                    min={0}
                    value={draft.trial_dias}
                    onChange={(e) => setDraft({ ...draft, trial_dias: Math.max(0, Number(e.target.value) || 0) })}
                  />
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter className="gm-pl-dialog-footer">
            <button type="button" className="btn-outline" onClick={closeModal}>
              Cancelar
            </button>
            <button type="button" className="btn-primary" onClick={saveDraft}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M2 7.5V10h2.5L10 4.5 7.5 2 2 7.5Z" />
              </svg>
              Salvar plano
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
