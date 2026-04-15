import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  type EquipeOverride,
  type FeatureFlag,
  type FeatureFlagsSnapshot,
  type FlagStatus,
  type PlanoFlag,
  GROUP_LABELS,
  GROUP_OPTIONS,
  GROUP_ORDER,
  exportFeatureFlagsJson,
  loadFeatureFlagsSnapshot,
  newEmptyFlag,
  saveFeatureFlagsSnapshot,
  slugifyKey,
} from "@/services/adminFeatureFlagsStore";

type FilterTab = "todas" | "ativas" | "beta" | "desativadas";

function cycleStatus(s: FlagStatus): FlagStatus {
  if (s === "off") return "on";
  if (s === "on") return "beta";
  return "off";
}

function downloadJson(filename: string, content: string): void {
  const blob = new Blob([content], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function groupHeaderRight(flags: FeatureFlag[]): { text: string; kind: "ok" | "warn" | "err" } {
  const total = flags.length;
  const off = flags.filter((f) => f.status === "off").length;
  const beta = flags.filter((f) => f.status === "beta").length;
  const on = flags.filter((f) => f.status === "on").length;
  if (off > 0) return { text: `${off} desativada${off > 1 ? "s" : ""}`, kind: "err" };
  if (beta > 0) return { text: `${beta} beta`, kind: "warn" };
  return { text: `${on}/${total} ativas`, kind: "ok" };
}

function PlanPips({ planos }: { planos: PlanoFlag[] }) {
  const order: PlanoFlag[] = ["basico", "pro", "enterprise"];
  const labels: Record<PlanoFlag, string> = { basico: "Básico", pro: "Pro", enterprise: "Ent." };
  const cls: Record<PlanoFlag, string> = {
    basico: "gm-ff-pip-basic",
    pro: "gm-ff-pip-pro",
    enterprise: "gm-ff-pip-ent",
  };
  return (
    <div className="gm-ff-flag-plans">
      {order.filter((p) => planos.includes(p)).map((p) => (
        <span key={p} className={cn("gm-ff-plan-pip", cls[p])}>
          {labels[p]}
        </span>
      ))}
    </div>
  );
}

function StatusDot({ status }: { status: FlagStatus }) {
  return (
    <div
      className={cn(
        "gm-ff-flag-status-dot",
        status === "on" && "gm-ff-dot-on",
        status === "beta" && "gm-ff-dot-beta",
        status === "off" && "gm-ff-dot-off",
      )}
    />
  );
}

function GlobalToggle({
  status,
  disabled,
  onClick,
}: {
  status: FlagStatus;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "gm-ff-toggle",
        status === "on" && "gm-ff-toggle--on",
        status === "beta" && "gm-ff-toggle--beta",
        status === "off" && "gm-ff-toggle--off",
      )}
      disabled={disabled}
      onClick={onClick}
      aria-label="Alternar estado global"
    />
  );
}

export default function AdminFeatureFlagsPage() {
  const [snap, setSnap] = useState<FeatureFlagsSnapshot>(() => loadFeatureFlagsSnapshot());
  const [query, setQuery] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("todas");
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<FeatureFlag | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [draftOv, setDraftOv] = useState<EquipeOverride | null>(null);

  const persist = useCallback((next: FeatureFlagsSnapshot) => {
    setSnap(next);
    saveFeatureFlagsSnapshot(next);
  }, []);

  const readSnap = useCallback(() => loadFeatureFlagsSnapshot(), []);

  useEffect(() => {
    setSnap(loadFeatureFlagsSnapshot());
  }, []);

  const flags = snap.flags;
  const overrides = snap.overrides;

  const betaCount = useMemo(() => flags.filter((f) => f.status === "beta").length, [flags]);

  const kpis = useMemo(() => {
    const on = flags.filter((f) => f.status === "on").length;
    const beta = flags.filter((f) => f.status === "beta").length;
    const off = flags.filter((f) => f.status === "off").length;
    return {
      on,
      beta,
      off,
      overrides: overrides.length,
      total: flags.length,
    };
  }, [flags, overrides.length]);

  const filteredFlags = useMemo(() => {
    const q = query.trim().toLowerCase();
    return flags.filter((f) => {
      if (filterTab === "ativas" && f.status !== "on") return false;
      if (filterTab === "beta" && f.status !== "beta") return false;
      if (filterTab === "desativadas" && f.status !== "off") return false;
      if (!q) return true;
      return (
        f.nome.toLowerCase().includes(q) ||
        f.key.toLowerCase().includes(q) ||
        f.descricao.toLowerCase().includes(q)
      );
    });
  }, [flags, query, filterTab]);

  const grouped = useMemo(() => {
    const map = new Map<string, FeatureFlag[]>();
    for (const g of GROUP_ORDER) map.set(g, []);
    for (const f of filteredFlags) {
      const arr = map.get(f.grupo) ?? [];
      arr.push(f);
      map.set(f.grupo, arr);
    }
    return GROUP_ORDER.map((g) => ({ grupo: g, flags: map.get(g) ?? [] })).filter((x) => x.flags.length > 0);
  }, [filteredFlags]);

  const openNew = () => {
    const n = newEmptyFlag();
    n.key = slugifyKey("Nova funcionalidade");
    setDraft(n);
    setModalOpen(true);
  };

  const openEdit = (f: FeatureFlag) => {
    setDraft({ ...f, planos: [...f.planos] });
    setModalOpen(true);
  };

  const saveFlag = () => {
    if (!draft?.nome.trim() || !draft.key.trim()) return;
    const cur = readSnap();
    const t = new Date().toISOString();
    const nextFlag: FeatureFlag = {
      ...draft,
      key: slugifyKey(draft.key) || slugifyKey(draft.nome),
      atualizadaEm: t,
      criadaEm: draft.criadaEm || t,
    };
    const exists = cur.flags.some((f) => f.id === nextFlag.id);
    const nextFlags = exists ? cur.flags.map((f) => (f.id === nextFlag.id ? nextFlag : f)) : [...cur.flags, nextFlag];
    persist({ ...cur, flags: nextFlags });
    setModalOpen(false);
    setDraft(null);
  };

  const setFlagStatus = (id: string, status: FlagStatus) => {
    const cur = readSnap();
    persist({
      ...cur,
      flags: cur.flags.map((f) => (f.id === id ? { ...f, status, atualizadaEm: new Date().toISOString() } : f)),
    });
  };

  const toggleGlobal = (f: FeatureFlag) => {
    setFlagStatus(f.id, cycleStatus(f.status));
  };

  const promoteBetas = () => {
    const cur = readSnap();
    const t = new Date().toISOString();
    persist({
      ...cur,
      flags: cur.flags.map((f) => (f.status === "beta" ? { ...f, status: "on" as const, atualizadaEm: t } : f)),
    });
  };

  const liberarWhiteLabel = () => {
    const cur = readSnap();
    const t = new Date().toISOString();
    persist({
      ...cur,
      flags: cur.flags.map((f) => (f.key === "white_label" ? { ...f, status: "on" as const, atualizadaEm: t } : f)),
    });
  };

  const exportJson = () => {
    downloadJson(`gestmiles-feature-flags-${new Date().toISOString().slice(0, 10)}.json`, exportFeatureFlagsJson());
  };

  const verBetas = () => {
    setFilterTab("beta");
    requestAnimationFrame(() => {
      document.getElementById("gm-ff-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const usageRows = useMemo(() => {
    const keys = ["crm_milhas", "insights_avancados", "emissoes", "kanban_leads", "relatorios_export"] as const;
    const rows = keys
      .map((k) => flags.find((f) => f.key === k))
      .filter((x): x is FeatureFlag => Boolean(x));
    return rows.map((r) => ({
      flag: r,
      label: r.key === "kanban_leads" ? "Kanban leads" : r.nome,
      isBeta: r.status === "beta",
    }));
  }, [flags]);

  const maxUsage = Math.max(1, ...usageRows.map((u) => u.flag.totalUsuarios));

  const openNewOverride = () => {
    setDraftOv({
      id: `ov-${Date.now()}`,
      equipeId: "",
      equipeNome: "",
      planoPadrao: "",
      flagsExtras: [],
      flagsBetaExtras: [],
      flagsRemovidas: [],
    });
    setOverrideOpen(true);
  };

  const saveOverride = () => {
    if (!draftOv?.equipeNome.trim()) return;
    const cur = readSnap();
    const exists = cur.overrides.some((o) => o.id === draftOv.id);
    const nextOv = exists ? cur.overrides.map((o) => (o.id === draftOv.id ? draftOv : o)) : [...cur.overrides, draftOv];
    persist({ ...cur, overrides: nextOv });
    setOverrideOpen(false);
    setDraftOv(null);
  };

  const hasBeta = betaCount > 0;
  const whiteLabelOff = flags.some((f) => f.key === "white_label" && f.status !== "on");

  return (
    <div className="gm-ff-page">
      <div className="gm-ff-page-hdr">
        <div>
          <div className="gm-ff-page-title">Feature Flags</div>
          <div className="gm-ff-page-sub">Liga/desliga funcionalidades por plano, por equipe ou globalmente — sem redeploy</div>
        </div>
        <div className="gm-ff-page-actions">
          <button type="button" className="gm-ff-btn gm-ff-btn-o" onClick={exportJson}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
              <path d="M2 9.5V11h1.5L11 3.5 9.5 2 2 9.5Z" />
            </svg>
            Exportar JSON
          </button>
          <button type="button" className="gm-ff-btn gm-ff-btn-p" onClick={openNew}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <line x1="6.5" y1="1" x2="6.5" y2="12" />
              <line x1="1" y1="6.5" x2="12" y2="6.5" />
            </svg>
            Nova flag
          </button>
        </div>
      </div>

      {hasBeta ? (
        <div className="gm-ff-beta-banner">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
            <path d="M8 2L2 12.5h12L8 2Z" />
            <line x1="8" y1="6.5" x2="8" y2="9.5" />
            <circle cx="8" cy="11.5" r=".6" fill="#D97706" />
          </svg>
          <div className="min-w-0 flex-1">
            <div className="gm-ff-beta-title">
              {betaCount} funcionalidade{betaCount !== 1 ? "s" : ""} em fase beta
            </div>
            <div className="gm-ff-beta-sub">
              Relatórios PDF e API & Webhooks podem estar limitados a equipes selecionadas. Monitore o uso antes de liberar globalmente.
            </div>
          </div>
          <button type="button" className="gm-ff-btn-sm gm-ff-btn-sm-warn shrink-0" onClick={verBetas}>
            Ver betas →
          </button>
        </div>
      ) : null}

      <div className="gm-ff-kpi4">
        <div className="gm-ff-kpi gm-ff-kpi--pu">
          <div className="gm-ff-kl">Flags ativas globalmente</div>
          <div className="gm-ff-kv">{kpis.on}</div>
          <div className="gm-ff-ks">de {kpis.total} funcionalidades</div>
        </div>
        <div className="gm-ff-kpi gm-ff-kpi--am">
          <div className="gm-ff-kl">Em beta (limitado)</div>
          <div className="gm-ff-kv gm-ff-kv-warn">{kpis.beta}</div>
          <div className="gm-ff-ks">ativas só em equipes selecionadas</div>
        </div>
        <div className="gm-ff-kpi gm-ff-kpi--bl">
          <div className="gm-ff-kl">Overrides por equipe</div>
          <div className="gm-ff-kv">{kpis.overrides}</div>
          <div className="gm-ff-ks">equipes com config personalizada</div>
        </div>
        <div className="gm-ff-kpi gm-ff-kpi--gr">
          <div className="gm-ff-kl">Flags desativadas</div>
          <div className="gm-ff-kv gm-ff-kv-muted">{kpis.off}</div>
          <div className="gm-ff-ks">desligadas em toda a plataforma</div>
        </div>
      </div>

      <div className="gm-ff-g21">
        <div className="gm-ff-card" id="gm-ff-list">
          <div className="gm-ff-toolbar">
            <div className="gm-ff-search-wrap">
              <svg className="gm-ff-search-ic" width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                <circle cx="6" cy="6" r="4" />
                <line x1="9.5" y1="9.5" x2="12.5" y2="12.5" />
              </svg>
              <input
                className="gm-ff-search-in"
                placeholder="Buscar flag..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="gm-ff-filter-tabs">
              {(
                [
                  ["todas", "Todas"],
                  ["ativas", "Ativas"],
                  ["beta", "Beta"],
                  ["desativadas", "Desativadas"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={cn("gm-ff-ftab", filterTab === id && "gm-ff-ftab--active")}
                  onClick={() => setFilterTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="gm-ff-table-head">
            <div className="gm-ff-th-dot" />
            <div className="gm-ff-th-main">Funcionalidade</div>
            <div className="gm-ff-th-plans">Planos</div>
            <div className="gm-ff-th-use">Uso</div>
            <div className="gm-ff-th-glob">Global</div>
            <div className="gm-ff-th-edit" aria-hidden />
          </div>

          {grouped.map(({ grupo, flags: gf }) => {
            const hdr = groupHeaderRight(gf);
            return (
              <div key={grupo}>
                <div className="gm-ff-group-hdr">
                  <span>{GROUP_LABELS[grupo] ?? grupo}</span>
                  <span
                    className={cn(
                      "text-[11px] font-semibold normal-case tracking-normal",
                      hdr.kind === "ok" && "text-[var(--ok)]",
                      hdr.kind === "warn" && "text-[var(--warn)]",
                      hdr.kind === "err" && "text-[var(--err)]",
                    )}
                  >
                    {hdr.text}
                  </span>
                </div>
                {gf.map((f) => (
                  <div
                    key={f.id}
                    className={cn(
                      "gm-ff-flag-row",
                      f.status === "off" && "gm-ff-flag-row--disabled",
                      f.status === "beta" && "gm-ff-flag-row--beta",
                    )}
                  >
                    <StatusDot status={f.status} />
                    <div className="gm-ff-flag-info">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={cn("gm-ff-flag-name", f.status === "off" && "text-[var(--t3)]")}>{f.nome}</span>
                        <code className="gm-ff-flag-key">{f.key}</code>
                        {f.status === "beta" ? (
                          <span className="gm-ff-badge-beta">BETA</span>
                        ) : null}
                        {f.status === "off" ? <span className="gm-ff-badge-off">DESATIVADO</span> : null}
                      </div>
                      <div className="gm-ff-flag-desc">{f.descricao}</div>
                    </div>
                    <PlanPips planos={f.planos} />
                    <div className="gm-ff-flag-usage">
                      <strong>{f.totalUsuarios}</strong> {f.usoUnidade === "equipes" ? "equipes" : "usuários"}
                    </div>
                    <div className="gm-ff-flag-toggle-cell">
                      <GlobalToggle status={f.status} onClick={() => toggleGlobal(f)} />
                    </div>
                    <button type="button" className="gm-ff-btn-sm gm-ff-btn-sm-o shrink-0 text-[11px]" onClick={() => openEdit(f)}>
                      Editar
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        <div className="gm-ff-right-col">
          <div className="gm-ff-card">
            <div className="gm-ff-card-h">
              <div className="gm-ff-card-ti">
                <div className="gm-ff-card-ic gm-ff-card-ic--pu">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#8A05BE" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <rect x="2" y="3" width="9" height="9" rx="1.5" />
                    <path d="M5 3V2a1 1 0 0 1 1-1h0a1 1 0 0 1 1 1v1" />
                    <line x1="7" y1="7" x2="7" y2="9" />
                    <line x1="6" y1="8" x2="8" y2="8" />
                  </svg>
                </div>
                Overrides por equipe
              </div>
              <button type="button" className="gm-ff-btn-sm gm-ff-btn-sm-o text-[11px]" onClick={openNewOverride}>
                + Adicionar
              </button>
            </div>
            <div className="gm-ff-card-sub">Acesso extra ou restrito além do plano contratado.</div>
            {overrides.map((ov) => (
              <div key={ov.id} className="gm-ff-override-block">
                <div className="gm-ff-override-top">
                  <div className="gm-ff-ov-av">{initials(ov.equipeNome)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="gm-ff-ov-name">{ov.equipeNome}</div>
                    <div className="gm-ff-ov-plan">{ov.planoPadrao}</div>
                  </div>
                  <button
                    type="button"
                    className="gm-ff-btn-sm gm-ff-btn-sm-o shrink-0 text-[11px]"
                    onClick={() => {
                      setDraftOv({ ...ov });
                      setOverrideOpen(true);
                    }}
                  >
                    Editar
                  </button>
                </div>
                <div className="gm-ff-ov-chips">
                  {ov.flagsExtras.map((k) => (
                    <span key={k} className="gm-ff-badge-pu">
                      ✓ {k}
                    </span>
                  ))}
                  {ov.flagsBetaExtras.map((k) => (
                    <span key={k} className="gm-ff-badge-warn-sm">
                      ⚡ {k} (beta)
                    </span>
                  ))}
                  {ov.flagsRemovidas.map((k) => (
                    <span key={k} className="gm-ff-badge-strike">
                      ✕ {k}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            <div className="gm-ff-empty-override">
              <div className="gm-ff-empty-title">Nenhuma outra equipe com override</div>
              <div className="gm-ff-empty-sub">Todas as demais equipes seguem as flags dos seus planos.</div>
            </div>
          </div>

          <div className="gm-ff-card">
            <div className="gm-ff-card-h">
              <div className="gm-ff-card-ti">
                <div className="gm-ff-card-ic gm-ff-card-ic--ok">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <polyline points="1,10 4,6.5 7,8.5 10,3 13,5" />
                  </svg>
                </div>
                Uso por funcionalidade
              </div>
            </div>
            <div>
              {usageRows.map((u) => (
                <div key={u.flag.id} className="gm-ff-mini-stat-row">
                  <span className={cn("gm-ff-msr-label", u.isBeta && "text-[var(--warn)]")}>{u.label}{u.isBeta ? " (beta)" : ""}</span>
                  <div className="flex items-center gap-2">
                    <div className="gm-ff-bar-track">
                      <div
                        className={cn(
                          "gm-ff-bar-fill",
                          u.flag.key === "emissoes" && "gm-ff-bar-fill--green",
                          u.flag.key === "kanban_leads" && "gm-ff-bar-fill--blue",
                          u.isBeta && "gm-ff-bar-fill--warn",
                        )}
                        style={{ width: `${Math.max(8, (u.flag.totalUsuarios / maxUsage) * 100)}%` }}
                      />
                    </div>
                    <span className="gm-ff-msr-val">
                      {u.flag.usoUnidade === "equipes" ? `${u.flag.totalUsuarios} equipe${u.flag.totalUsuarios !== 1 ? "s" : ""}` : u.flag.totalUsuarios}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="gm-ff-card">
            <div className="gm-ff-card-h">
              <div className="gm-ff-card-ti">
                <div className="gm-ff-card-ic gm-ff-card-ic--pu">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#8A05BE" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <path d="M2 1.5L9 6.5 2 11.5V1.5Z" />
                  </svg>
                </div>
                Ações rápidas
              </div>
            </div>
            <div className="gm-ff-quick-actions">
              {whiteLabelOff ? (
                <button type="button" className="gm-ff-btn-sm gm-ff-btn-sm-ok w-full justify-center" onClick={liberarWhiteLabel}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <polyline points="1.5,6 4.5,9 10.5,3" />
                  </svg>
                  Liberar &quot;White-label&quot; globalmente
                </button>
              ) : null}
              {hasBeta ? (
                <button type="button" className="gm-ff-btn-sm gm-ff-btn-sm-warn w-full justify-center" onClick={promoteBetas}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <path d="M2 6a4 4 0 0 1 8 0M10 6a4 4 0 0 1-8 0" />
                  </svg>
                  Promover betas para produção
                </button>
              ) : null}
              <button type="button" className="gm-ff-btn-sm gm-ff-btn-sm-o w-full justify-center border-[1.5px] border-[var(--bd)]" onClick={exportJson}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                  <path d="M2 9.5V11h1.5L9.5 4.5 8 3 2 9.5Z" />
                </svg>
                Exportar configuração JSON
              </button>
            </div>
          </div>
        </div>
      </div>

      <Dialog
        open={modalOpen}
        onOpenChange={(o) => {
          setModalOpen(o);
          if (!o) setDraft(null);
        }}
      >
        <DialogContent className="gm-ff-dialog max-w-[480px] rounded-2xl p-0">
          <DialogHeader className="gm-ff-dialog-h border-b border-[var(--bd)] p-5 text-left">
            <DialogTitle className="text-base font-bold">
              {draft && flags.some((f) => f.id === draft.id) ? `Editar flag — ${draft.nome}` : "Nova flag"}
            </DialogTitle>
            <p className="text-xs text-[var(--t3)]">Chave técnica e planos definem quem vê a funcionalidade no app.</p>
          </DialogHeader>
          {draft ? (
            <>
              <div className="gm-ff-dialog-body flex flex-col gap-3.5 px-6 py-5">
                <div className="gm-ff-field">
                  <Label className="gm-ff-flabel">Nome da funcionalidade</Label>
                  <input
                    className="gm-ff-finput"
                    value={draft.nome}
                    onChange={(e) => {
                      const nome = e.target.value;
                      setDraft((d) =>
                        d
                          ? {
                              ...d,
                              nome,
                              key: flags.some((f) => f.id === d.id) ? d.key : slugifyKey(nome),
                            }
                          : d,
                      );
                    }}
                  />
                </div>
                <div className="gm-ff-field">
                  <Label className="gm-ff-flabel">Chave técnica</Label>
                  <input
                    className="gm-ff-finput font-mono text-[13px]"
                    value={draft.key}
                    onChange={(e) => setDraft((d) => (d ? { ...d, key: e.target.value } : d))}
                  />
                </div>
                <div className="gm-ff-field">
                  <Label className="gm-ff-flabel">Descrição</Label>
                  <Textarea className="min-h-[60px] rounded-[9px] border-[1.5px] border-[var(--bd)] text-[13px]" value={draft.descricao} onChange={(e) => setDraft((d) => (d ? { ...d, descricao: e.target.value } : d))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="gm-ff-field">
                    <Label className="gm-ff-flabel">Status global</Label>
                    <select
                      className="gm-ff-fselect"
                      value={draft.status}
                      onChange={(e) => setDraft((d) => (d ? { ...d, status: e.target.value as FlagStatus } : d))}
                    >
                      <option value="on">Ativo</option>
                      <option value="beta">Beta</option>
                      <option value="off">Desativado</option>
                    </select>
                  </div>
                  <div className="gm-ff-field">
                    <Label className="gm-ff-flabel">Grupo</Label>
                    <select
                      className="gm-ff-fselect"
                      value={draft.grupo}
                      onChange={(e) => setDraft((d) => (d ? { ...d, grupo: e.target.value } : d))}
                    >
                      {GROUP_OPTIONS.map((g) => (
                        <option key={g.value} value={g.value}>
                          {g.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="gm-ff-field">
                  <Label className="gm-ff-flabel">Planos com acesso</Label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {(
                      [
                        ["basico", "📦 Básico"],
                        ["pro", "🚀 Pro"],
                        ["enterprise", "🏆 Enterprise"],
                      ] as const
                    ).map(([pid, lab]) => (
                      <label
                        key={pid}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-lg border-[1.5px] border-[var(--bd)] px-3 py-2 text-[12px] font-semibold transition-colors",
                          draft.planos.includes(pid) && "border-[var(--p)] bg-[rgba(138,5,190,0.06)]",
                        )}
                      >
                        <Checkbox
                          checked={draft.planos.includes(pid)}
                          onCheckedChange={(c) =>
                            setDraft((d) => {
                              if (!d) return d;
                              const on = Boolean(c);
                              const planos = on ? [...new Set([...d.planos, pid])] : d.planos.filter((p) => p !== pid);
                              return { ...d, planos };
                            })
                          }
                        />
                        {lab}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="gm-ff-field">
                    <Label className="gm-ff-flabel">Uso (número)</Label>
                    <input
                      type="number"
                      min={0}
                      className="gm-ff-finput"
                      value={draft.totalUsuarios}
                      onChange={(e) => setDraft((d) => (d ? { ...d, totalUsuarios: Number(e.target.value) || 0 } : d))}
                    />
                  </div>
                  <div className="gm-ff-field">
                    <Label className="gm-ff-flabel">Unidade de uso</Label>
                    <select
                      className="gm-ff-fselect"
                      value={draft.usoUnidade}
                      onChange={(e) => setDraft((d) => (d ? { ...d, usoUnidade: e.target.value as "usuarios" | "equipes" } : d))}
                    >
                      <option value="usuarios">Usuários</option>
                      <option value="equipes">Equipes</option>
                    </select>
                  </div>
                </div>
              </div>
              <DialogFooter className="gm-ff-dialog-footer flex gap-2 border-t border-[var(--bd)] bg-[#fafafa] px-6 py-4">
                <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                  Cancelar
                </Button>
                <Button type="button" className="bg-[#8A05BE] hover:bg-[#6A00A3]" onClick={saveFlag}>
                  Salvar flag
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={overrideOpen}
        onOpenChange={(o) => {
          setOverrideOpen(o);
          if (!o) setDraftOv(null);
        }}
      >
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{draftOv && overrides.some((o) => o.id === draftOv.id) ? "Editar override" : "Novo override"}</DialogTitle>
          </DialogHeader>
          {draftOv ? (
            <>
              <div className="flex flex-col gap-3 py-2">
                <div className="gm-ff-field">
                  <Label>Nome da equipe</Label>
                  <input
                    className="gm-ff-finput"
                    value={draftOv.equipeNome}
                    onChange={(e) => setDraftOv({ ...draftOv, equipeNome: e.target.value })}
                  />
                </div>
                <div className="gm-ff-field">
                  <Label>ID (opcional)</Label>
                  <input
                    className="gm-ff-finput"
                    value={draftOv.equipeId}
                    onChange={(e) => setDraftOv({ ...draftOv, equipeId: e.target.value })}
                  />
                </div>
                <div className="gm-ff-field">
                  <Label>Plano / nota</Label>
                  <input
                    className="gm-ff-finput"
                    value={draftOv.planoPadrao}
                    onChange={(e) => setDraftOv({ ...draftOv, planoPadrao: e.target.value })}
                  />
                </div>
                <p className="text-[11px] text-[var(--t3)]">Flags extras: edite no JSON exportado ou amplie este formulário depois.</p>
              </div>
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setOverrideOpen(false)}>
                  Cancelar
                </Button>
                <Button type="button" onClick={saveOverride}>
                  Guardar
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function initials(nome: string): string {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return `${p[0]![0] ?? ""}${p[p.length - 1]![0] ?? ""}`.toUpperCase();
}
