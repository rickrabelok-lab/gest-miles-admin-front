import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminEquipe } from "@/context/AdminEquipeContext";
import { useAccessScope } from "@/hooks/useAccessScope";
import { canManageEquipesGlobally } from "@/lib/accessScope";
import {
  formatSupabaseError,
  listCsPerfis,
  listCSEquipeAssignments,
  listEquipeCsLinks,
  listEquipeGestorLinks,
  listEquipes,
  listGestorEquipeSlotMap,
  listGestorFuncoesMap,
  listGestores,
  listPerfis,
  setCsForEquipe,
  setCSEquipeAssignments,
  setGestorEquipeSlot,
  setGestorFuncao,
  setGestoresForEquipe,
  updateEquipeNome,
  type Equipe,
  type GestorEquipeSlot,
  type GestorFuncao,
  type Perfil,
} from "@/lib/adminApi";
import { listSubscriptionsAdmin } from "@/services/subscriptionsAdmin";

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

function planLabelFromSubsRaw(raw: Record<string, unknown>): string {
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

const COLOR_PRESETS = [
  { from: "#6A00A3", to: "#B56CFF" },
  { from: "#1d4ed8", to: "#3b82f6" },
  { from: "#16A34A", to: "#4ADE80" },
  { from: "#D97706", to: "#FBBF24" },
  { from: "#DB2777", to: "#F472B6" },
  { from: "#DC2626", to: "#F87171" },
  { from: "#0891B2", to: "#22D3EE" },
] as const;

function avatarGrad(id: string, idx: number) {
  const h = id.split("").reduce((acc, ch) => acc + ch.charCodeAt(0) * 13, idx * 7) % COLOR_PRESETS.length;
  return COLOR_PRESETS[h] ?? COLOR_PRESETS[0]!;
}

type DetailTab = "visao" | "membros" | "clientes" | "config";

export default function EquipeDetailPage() {
  const { scope } = useAccessScope();
  const { setEquipeNomeEdicaoDraft, patchEquipeNomeInList } = useAdminEquipe();
  const allowGlobalEquipes = canManageEquipesGlobally(scope);
  const { equipeId } = useParams<{ equipeId: string }>();
  const groupId = equipeId ?? "";

  const [equipe, setEquipe] = useState<Equipe | null>(null);
  const [gestores, setGestores] = useState<Perfil[]>([]);
  const [csPerfis, setCsPerfis] = useState<Perfil[]>([]);
  const [gestorFuncaoByUser, setGestorFuncaoByUser] = useState<Record<string, GestorFuncao>>({});
  const [gestorEquipeSlotByUser, setGestorEquipeSlotByUser] = useState<Record<string, GestorEquipeSlot>>({});
  const [csAssignmentsBySlot, setCsAssignmentsBySlot] = useState<Record<number, string[]>>({});
  const [equipeGestorLinks, setEquipeGestorLinks] = useState<Array<{ equipe_id: string; gestor_id: string }>>([]);
  const [equipeCsLinks, setEquipeCsLinks] = useState<Array<{ equipe_id: string; cs_id: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nome, setNome] = useState("");

  const [selectedGestores, setSelectedGestores] = useState<string[]>([]);
  const [selectedCs, setSelectedCs] = useState<string[]>([]);
  const [gestorQuery, setGestorQuery] = useState("");
  const [csQuery, setCsQuery] = useState("");
  const [slotCount, setSlotCount] = useState(1);
  const [csPickBySlot, setCsPickBySlot] = useState<Record<number, string>>({});
  const [gestorSelecionadoParaExcluir, setGestorSelecionadoParaExcluir] = useState<string | null>(null);
  const [csSelecionadoParaExcluir, setCsSelecionadoParaExcluir] = useState<string | null>(null);
  const [slotCsSelecionadoParaRemover, setSlotCsSelecionadoParaRemover] = useState<Record<number, string | null>>({});
  const [tab, setTab] = useState<DetailTab>("visao");
  const [perfisEquipe, setPerfisEquipe] = useState<Perfil[]>([]);
  const [mrrEquipe, setMrrEquipe] = useState(0);
  const [planoEquipeLabel, setPlanoEquipeLabel] = useState("Básico");
  const [configColorIdx, setConfigColorIdx] = useState(0);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin_equipe" | "gestor" | "cs">("gestor");
  const [dangerModal, setDangerModal] = useState<null | "desativar" | "excluir">(null);

  const load = async () => {
    if (!equipeId) return;
    setLoading(true);
    setError(null);
    try {
      const [eqs, gs, cs, eg, ec] = await Promise.all([
        listEquipes(),
        listGestores(),
        listCsPerfis(),
        listEquipeGestorLinks(),
        listEquipeCsLinks(),
      ]);
      const found = eqs.find((e) => e.id === equipeId) ?? null;
      if (!found) {
        setEquipe(null);
        setPerfisEquipe([]);
        setLoading(false);
        return;
      }
      const [gf, gsMap, csAssignments, pe, subsRes] = await Promise.all([
        listGestorFuncoesMap(gs.map((g) => g.usuario_id)),
        listGestorEquipeSlotMap({ equipeId: groupId, gestorIds: gs.map((g) => g.usuario_id) }),
        listCSEquipeAssignments({ equipeId: groupId }),
        listPerfis({ equipeIds: [equipeId] }),
        listSubscriptionsAdmin(),
      ]);
      setPerfisEquipe(pe);
      let mrr = 0;
      let plano = "Básico";
      if (subsRes.available) {
        let planLocked = false;
        for (const r of subsRes.rows) {
          if (!r.isActive) continue;
          const eid = pickRawString(r.raw, ["equipe_id", "team_id", "equipeId"]);
          if (eid !== equipeId) continue;
          mrr += pickNumberFromRaw(r.raw, ["amount", "valor", "mrr", "valor_mensal", "monthly_amount", "price"]);
          if (!planLocked) {
            plano = planLabelFromSubsRaw(r.raw);
            planLocked = true;
          }
        }
      }
      setMrrEquipe(mrr);
      setPlanoEquipeLabel(plano);
      setEquipe(found);
      setNome(found.nome);
      setGestores(gs);
      setCsPerfis(cs);
      setGestorFuncaoByUser(gf);
      setGestorEquipeSlotByUser(gsMap);
      setCsAssignmentsBySlot(csAssignments);
      setEquipeGestorLinks(eg);
      setEquipeCsLinks(ec);
      const sg = eg.filter((l) => l.equipe_id === equipeId).map((l) => l.gestor_id);
      const sc = ec.filter((l) => l.equipe_id === equipeId).map((l) => l.cs_id);
      setSelectedGestores(sg);
      setSelectedCs(sc);
      const maxG = sg.reduce((acc, id) => Math.max(acc, gsMap[id] ?? 0), 0);
      const maxC = Object.keys(csAssignments).reduce((acc, k) => Math.max(acc, Number(k) || 0), 0);
      const base = Math.max(1, Math.ceil(sg.length / 2), maxG, maxC);
      const savedRaw = window.localStorage.getItem(`admin-equipe-slot-count:${equipeId}`);
      const saved = savedRaw ? Number(savedRaw) : 0;
      setSlotCount(Number.isFinite(saved) && saved >= base ? saved : base);
    } catch (e) {
      setError(formatSupabaseError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!allowGlobalEquipes) {
      setLoading(false);
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowGlobalEquipes, equipeId]);

  useEffect(() => {
    if (!allowGlobalEquipes || !equipeId || !equipe) {
      setEquipeNomeEdicaoDraft(null);
      return;
    }
    setEquipeNomeEdicaoDraft({ equipeId, nome });
    return () => setEquipeNomeEdicaoDraft(null);
  }, [allowGlobalEquipes, equipeId, nome, equipe, setEquipeNomeEdicaoDraft]);

  const gestoresDisponiveis = useMemo(() => {
    if (!equipeId) return [];
    const ownerByGestor = new Map<string, string>();
    for (const l of equipeGestorLinks) {
      if (!ownerByGestor.has(l.gestor_id)) ownerByGestor.set(l.gestor_id, l.equipe_id);
    }
    return gestores.filter((g) => {
      const owner = ownerByGestor.get(g.usuario_id);
      return !owner || owner === equipeId || selectedGestores.includes(g.usuario_id);
    });
  }, [gestores, equipeGestorLinks, equipeId, selectedGestores]);

  const csDisponiveis = useMemo(() => {
    if (!equipeId) return [];
    const ownerByCs = new Map<string, string>();
    for (const l of equipeCsLinks) {
      if (!ownerByCs.has(l.cs_id)) ownerByCs.set(l.cs_id, l.equipe_id);
    }
    return csPerfis.filter((c) => {
      const owner = ownerByCs.get(c.usuario_id);
      return !owner || owner === equipeId || selectedCs.includes(c.usuario_id);
    });
  }, [csPerfis, equipeCsLinks, equipeId, selectedCs]);

  const gestoresSelecionados = useMemo(
    () => selectedGestores.map((id) => gestores.find((g) => g.usuario_id === id)).filter(Boolean) as Perfil[],
    [selectedGestores, gestores],
  );

  const gestoresSugestoes = useMemo(() => {
    const q = gestorQuery.trim().toLowerCase();
    const base = q
      ? gestoresDisponiveis.filter((g) => (g.nome_completo ?? "").toLowerCase().includes(q) || g.usuario_id.toLowerCase().includes(q))
      : gestoresDisponiveis;
    return base.filter((g) => !selectedGestores.includes(g.usuario_id)).slice(0, 8);
  }, [gestorQuery, gestoresDisponiveis, selectedGestores]);

  const csSelecionados = useMemo(
    () => selectedCs.map((id) => csPerfis.find((c) => c.usuario_id === id)).filter(Boolean) as Perfil[],
    [selectedCs, csPerfis],
  );

  const csSugestoes = useMemo(() => {
    const q = csQuery.trim().toLowerCase();
    const base = q
      ? csDisponiveis.filter((c) => (c.nome_completo ?? "").toLowerCase().includes(q) || c.usuario_id.toLowerCase().includes(q))
      : csDisponiveis;
    return base.filter((c) => !selectedCs.includes(c.usuario_id)).slice(0, 8);
  }, [csQuery, csDisponiveis, selectedCs]);

  const slots = useMemo(() => {
    const used = gestoresSelecionados.map((g) => gestorEquipeSlotByUser[g.usuario_id] ?? 0).filter((n) => n > 0);
    const maxUsed = used.length ? Math.max(...used) : 0;
    const maxCsUsed = Object.keys(csAssignmentsBySlot).reduce((acc, k) => Math.max(acc, Number(k) || 0), 0);
    const minRows = Math.max(1, Math.ceil(gestoresSelecionados.length / 2), maxUsed, maxCsUsed, slotCount);
    return Array.from({ length: minRows }, (_, i) => i + 1);
  }, [gestoresSelecionados, gestorEquipeSlotByUser, csAssignmentsBySlot, slotCount]);

  const assignmentBySlot = useMemo(() => {
    const bySlot = new Map<number, { nacional?: string; internacional?: string; csIds?: string[] }>();
    for (const g of gestoresSelecionados) {
      const slot = gestorEquipeSlotByUser[g.usuario_id];
      const funcao = gestorFuncaoByUser[g.usuario_id];
      if (!slot || !funcao) continue;
      const cur = bySlot.get(slot) ?? {};
      if (funcao === "nacional") cur.nacional = g.usuario_id;
      if (funcao === "internacional") cur.internacional = g.usuario_id;
      bySlot.set(slot, cur);
    }
    for (const [slotKey, ids] of Object.entries(csAssignmentsBySlot)) {
      const slot = Number(slotKey);
      if (!slot) continue;
      const cur = bySlot.get(slot) ?? {};
      cur.csIds = [...new Set((ids ?? []).filter((id) => selectedCs.includes(id)))];
      bySlot.set(slot, cur);
    }
    return bySlot;
  }, [gestoresSelecionados, gestorEquipeSlotByUser, gestorFuncaoByUser, csAssignmentsBySlot, selectedCs]);

  const usedGestorIdsByOtherSlots = useMemo(() => {
    const used = new Set<string>();
    assignmentBySlot.forEach((a) => {
      if (a.nacional) used.add(a.nacional);
      if (a.internacional) used.add(a.internacional);
    });
    return used;
  }, [assignmentBySlot]);

  const nClientesEquipe = useMemo(
    () => perfisEquipe.filter((p) => p.role === "cliente" || p.role === "cliente_gestao").length,
    [perfisEquipe],
  );

  const adminsEquipe = useMemo(() => perfisEquipe.filter((p) => p.role === "admin_equipe"), [perfisEquipe]);

  const linhasMembros = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ perfil: Perfil; kind: "gestor" | "cs" | "admin_equipe" }> = [];
    for (const a of adminsEquipe) {
      if (!seen.has(a.usuario_id)) {
        seen.add(a.usuario_id);
        out.push({ perfil: a, kind: "admin_equipe" });
      }
    }
    for (const g of gestoresSelecionados) {
      if (!seen.has(g.usuario_id)) {
        seen.add(g.usuario_id);
        out.push({ perfil: g, kind: "gestor" });
      }
    }
    for (const c of csSelecionados) {
      if (!seen.has(c.usuario_id)) {
        seen.add(c.usuario_id);
        out.push({ perfil: c, kind: "cs" });
      }
    }
    return out;
  }, [adminsEquipe, gestoresSelecionados, csSelecionados]);

  const nMembrosTab = linhasMembros.length;

  const criadaLabel = useMemo(() => {
    const raw = equipe?.created_at;
    if (!raw) return "—";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  }, [equipe?.created_at]);

  if (!allowGlobalEquipes) {
    return (
      <div className="table-card" style={{ maxWidth: 480 }}>
        <div className="tc-header">
          <div className="tc-title">Equipes</div>
        </div>
        <p style={{ fontSize: 13, color: "var(--t2)", padding: "16px 20px", margin: 0 }}>Sem permissão para gestão global de equipes.</p>
      </div>
    );
  }
  if (loading) return <p style={{ fontSize: 13, color: "var(--t3)" }}>A carregar…</p>;
  if (!equipe) return <p style={{ fontSize: 13, color: "var(--t3)" }}>Grupo não encontrado.</p>;

  const heroGrad = avatarGrad(equipe.id, configColorIdx);

  return (
    <div className="eq-detail-root" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error ? <p style={{ fontSize: 13, color: "var(--err)" }}>{error}</p> : null}

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Link to="/equipes" className="btn-outline" style={{ height: 32, padding: "0 12px", fontSize: 12, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <polyline points="7,2 3,6 7,10" />
          </svg>
          Voltar
        </Link>
        <div style={{ fontSize: 18, fontWeight: 800, color: "var(--t1)", letterSpacing: "-0.3px" }}>{nome}</div>
        <span className="badge badge-ok">Ativa</span>
        <button type="button" className="eq-btn-sm eq-btn-sm-o" style={{ marginLeft: "auto" }} onClick={() => setTab("config")}>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <path d="M7.5 1.5L9.5 3.5 3.5 9.5H1.5V7.5L7.5 1.5Z" />
          </svg>
          Editar equipe
        </button>
      </div>

      <div className="eq-hero-stats-grid">
        <div className="eq-team-hero">
          <div className="eq-team-hero-av" style={{ background: `linear-gradient(135deg, ${heroGrad.from}, ${heroGrad.to})` }}>
            {initialsFromNome(nome.trim() || equipe.nome)}
          </div>
          <div style={{ position: "relative", zIndex: 1 }}>
            <div className="eq-team-hero-name">{nome}</div>
            <div className="eq-team-hero-id">ID: {equipe.id}</div>
            <div className="eq-team-hero-date">
              Criada em {criadaLabel}
              {equipe.created_at ? "" : " · data não registada na BD"}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <span className="eq-hero-pill">{planoEquipeLabel}</span>
              <span className="eq-hero-pill eq-hero-pill-mrr">MRR: {formatBrl(mrrEquipe)}</span>
            </div>
          </div>
        </div>
        <div className="eq-quick-stats">
          <div className="eq-stat-mini">
            <div className="eq-stat-mini-val" style={{ color: "var(--p)" }}>
              {nClientesEquipe}
            </div>
            <div className="eq-stat-mini-lbl">Clientes</div>
          </div>
          <div className="eq-stat-mini">
            <div className="eq-stat-mini-val">{nMembrosTab}</div>
            <div className="eq-stat-mini-lbl">Membros</div>
          </div>
          <div className="eq-stat-mini">
            <div className="eq-stat-mini-val" style={{ color: "var(--ok)" }}>
              —
            </div>
            <div className="eq-stat-mini-lbl">Retenção</div>
          </div>
        </div>
      </div>

      <div className="table-card" style={{ overflow: "visible" }}>
        <div style={{ padding: "0 18px", borderBottom: "1.5px solid var(--bd)" }}>
          <div className="eq-tabs" role="tablist">
            {(
              [
                ["visao", "Visão Geral"],
                ["membros", "Membros", nMembrosTab],
                ["clientes", "Clientes", nClientesEquipe],
                ["config", "Configurações"],
              ] as const
            ).map((item) => {
              const id = item[0];
              const label = item[1];
              const count = item[2] as number | undefined;
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`eq-tab${active ? " eq-tab-active" : ""}`}
                  onClick={() => setTab(id)}
                >
                  {label}
                  {typeof count === "number" ? (
                    <span className={`eq-tab-count${id === "clientes" ? " eq-tab-count-gr" : ""}`}>{count}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {tab === "visao" ? (
          <div style={{ padding: "18px 20px 22px" }}>
            <div className="kpi-grid" style={{ marginBottom: 20 }}>
              <div className="kpi-card purple">
                <div className="kpi-label">Clientes ativos</div>
                <div className="kpi-value">{nClientesEquipe}</div>
                <div className="kpi-sub">perfis nesta equipe</div>
              </div>
              <div className="kpi-card blue">
                <div className="kpi-label">Reuniões este mês</div>
                <div className="kpi-value">—</div>
                <div className="kpi-sub">ligue a um CRM ou agenda</div>
              </div>
              <div className="kpi-card teal">
                <div className="kpi-label">Emissões este mês</div>
                <div className="kpi-value">—</div>
                <div className="kpi-sub">dados de milhas em integração</div>
              </div>
              <div className="kpi-card amber">
                <div className="kpi-label">Tarefas pendentes</div>
                <div className="kpi-value">—</div>
                <div className="kpi-sub">quando existir backlog</div>
              </div>
            </div>
            <div className="kpi-section-title" style={{ marginBottom: 10 }}>
              Membros mais ativos
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
              {linhasMembros.slice(0, 3).map((row, i) => {
                const g = avatarGrad(row.perfil.usuario_id, i);
                return (
                  <div key={row.perfil.usuario_id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div className="eq-m-av" style={{ background: `linear-gradient(135deg, ${g.from}, ${g.to})` }}>
                      {initialsFromNome(row.perfil.nome_completo ?? row.perfil.usuario_id)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{row.perfil.nome_completo ?? row.perfil.usuario_id}</div>
                      <div style={{ fontSize: 11, color: "var(--t3)" }}>{row.kind === "gestor" ? "Gestor" : row.kind === "cs" ? "CS" : "Admin de equipe"}</div>
                    </div>
                  </div>
                );
              })}
              {linhasMembros.length === 0 ? <p style={{ fontSize: 12, color: "var(--t3)", margin: 0 }}>Sem membros atribuídos.</p> : null}
            </div>
            <div className="kpi-section-title" style={{ marginBottom: 10 }}>
              Atividade recente
            </div>
            <p style={{ fontSize: 12, color: "var(--t3)", margin: "0 0 20px" }}>Sem feed de actividade neste painel (use Insights / auditoria).</p>

            <div className="kpi-section-title" style={{ marginBottom: 10 }}>
              Separação por equipes (Nacional/Internacional + CS)
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!equipeId) return;
                  const next = slotCount + 1;
                  setSlotCount(next);
                  window.localStorage.setItem(`admin-equipe-slot-count:${equipeId}`, String(next));
                }}
              >
                Adicionar equipe
              </Button>
            </div>
            {slots.map((slot) => {
              const assigned = assignmentBySlot.get(slot) ?? {};
              const nacionalId = assigned.nacional ?? "";
              const internacionalId = assigned.internacional ?? "";
              const csIds = assigned.csIds ?? [];
              return (
                <div key={slot} className="rounded-md border p-2" style={{ marginBottom: 8 }}>
                  <div className="mb-2 text-xs font-semibold text-muted-foreground">Equipe {slot}</div>
                  <div className="grid gap-2 md:grid-cols-3">
                    <select
                      className="h-8 rounded-md border bg-background px-2 text-xs"
                      value={nacionalId}
                      onChange={async (e) => {
                        const newId = e.target.value;
                        const current = assignmentBySlot.get(slot) ?? {};
                        if (newId) {
                          for (const g of gestoresSelecionados) {
                            if (g.usuario_id !== newId && gestorEquipeSlotByUser[g.usuario_id] === slot && gestorFuncaoByUser[g.usuario_id] === "nacional") {
                              await setGestorFuncao({ gestorId: g.usuario_id, funcao: null });
                              await setGestorEquipeSlot({ equipeId: groupId, gestorId: g.usuario_id, slot: null });
                            }
                          }
                          await setGestorEquipeSlot({ equipeId: groupId, gestorId: newId, slot });
                          await setGestorFuncao({ gestorId: newId, funcao: "nacional" });
                          if (current.internacional === newId) {
                            await setGestorFuncao({ gestorId: newId, funcao: "nacional" });
                          }
                        }
                        if (nacionalId && nacionalId !== newId) {
                          await setGestorFuncao({ gestorId: nacionalId, funcao: null });
                          await setGestorEquipeSlot({ equipeId: groupId, gestorId: nacionalId, slot: null });
                        }
                        await load();
                      }}
                    >
                      <option value="">Nacional — selecionar</option>
                      {gestoresSelecionados
                        .filter((g) => {
                          if (g.usuario_id === nacionalId) return true;
                          if (g.usuario_id === internacionalId) return false;
                          return !usedGestorIdsByOtherSlots.has(g.usuario_id);
                        })
                        .map((g) => (
                          <option key={g.usuario_id} value={g.usuario_id}>
                            {g.nome_completo ?? g.usuario_id}
                          </option>
                        ))}
                    </select>
                    <select
                      className="h-8 rounded-md border bg-background px-2 text-xs"
                      value={internacionalId}
                      onChange={async (e) => {
                        const newId = e.target.value;
                        const current = assignmentBySlot.get(slot) ?? {};
                        if (newId) {
                          for (const g of gestoresSelecionados) {
                            if (
                              g.usuario_id !== newId &&
                              gestorEquipeSlotByUser[g.usuario_id] === slot &&
                              gestorFuncaoByUser[g.usuario_id] === "internacional"
                            ) {
                              await setGestorFuncao({ gestorId: g.usuario_id, funcao: null });
                              await setGestorEquipeSlot({ equipeId: groupId, gestorId: g.usuario_id, slot: null });
                            }
                          }
                          await setGestorEquipeSlot({ equipeId: groupId, gestorId: newId, slot });
                          await setGestorFuncao({ gestorId: newId, funcao: "internacional" });
                          if (current.nacional === newId) {
                            await setGestorFuncao({ gestorId: newId, funcao: "internacional" });
                          }
                        }
                        if (internacionalId && internacionalId !== newId) {
                          await setGestorFuncao({ gestorId: internacionalId, funcao: null });
                          await setGestorEquipeSlot({ equipeId: groupId, gestorId: internacionalId, slot: null });
                        }
                        await load();
                      }}
                    >
                      <option value="">Internacional — selecionar</option>
                      {gestoresSelecionados
                        .filter((g) => {
                          if (g.usuario_id === internacionalId) return true;
                          if (g.usuario_id === nacionalId) return false;
                          return !usedGestorIdsByOtherSlots.has(g.usuario_id);
                        })
                        .map((g) => (
                          <option key={g.usuario_id} value={g.usuario_id}>
                            {g.nome_completo ?? g.usuario_id}
                          </option>
                        ))}
                    </select>
                    <div className="rounded-md border border-input p-2">
                      <div className="mb-2 text-[11px] font-medium text-muted-foreground">CS desta equipe</div>
                      <div className="flex items-center gap-2">
                        <select
                          className="h-8 flex-1 rounded-md border bg-background px-2 text-xs"
                          value={csPickBySlot[slot] ?? ""}
                          onChange={(e) =>
                            setCsPickBySlot((prev) => ({
                              ...prev,
                              [slot]: e.target.value,
                            }))
                          }
                        >
                          <option value="">Selecionar CS</option>
                          {csSelecionados.map((c) => (
                            <option key={c.usuario_id} value={c.usuario_id}>
                              {c.nome_completo ?? c.usuario_id}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!csPickBySlot[slot]}
                          onClick={async () => {
                            const picked = csPickBySlot[slot];
                            if (!picked) return;
                            const current = csAssignmentsBySlot[slot] ?? [];
                            const nextAssignments: Record<number, string[]> = {
                              ...csAssignmentsBySlot,
                              [slot]: [...new Set([...current, picked])],
                            };
                            await setCSEquipeAssignments({ equipeId: groupId, assignments: nextAssignments });
                            setCsPickBySlot((prev) => ({ ...prev, [slot]: "" }));
                            await load();
                          }}
                        >
                          Adicionar
                        </Button>
                      </div>
                      <div className="mt-2 max-h-[72px] space-y-1 overflow-auto">
                        {csIds.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground">Sem CS nesta equipe.</p>
                        ) : (
                          csIds.map((id) => {
                            const cs = csSelecionados.find((c) => c.usuario_id === id);
                            return (
                              <div
                                key={id}
                                className={`flex items-center justify-between gap-2 rounded px-1 text-[11px] ${
                                  slotCsSelecionadoParaRemover[slot] === id ? "bg-muted" : ""
                                }`}
                                onClick={() =>
                                  setSlotCsSelecionadoParaRemover((prev) => ({
                                    ...prev,
                                    [slot]: id,
                                  }))
                                }
                              >
                                <span className="truncate">{cs?.nome_completo ?? id}</span>
                                {slotCsSelecionadoParaRemover[slot] === id ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-destructive"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      const current = csAssignmentsBySlot[slot] ?? [];
                                      const nextAssignments: Record<number, string[]> = {
                                        ...csAssignmentsBySlot,
                                        [slot]: current.filter((x) => x !== id),
                                      };
                                      await setCSEquipeAssignments({ equipeId: groupId, assignments: nextAssignments });
                                      setSlotCsSelecionadoParaRemover((prev) => ({ ...prev, [slot]: null }));
                                      await load();
                                    }}
                                  >
                                    Remover
                                  </Button>
                                ) : null}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {tab === "membros" ? (
          <div>
            <div className="eq-invite-form">
              <input className="eq-finput" placeholder="E-mail do novo membro..." value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
              <select className="eq-fselect" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as typeof inviteRole)}>
                <option value="gestor">Gestor</option>
                <option value="cs">CS</option>
                <option value="admin_equipe">Admin de Equipe</option>
              </select>
              <button type="button" className="btn-primary" style={{ height: 36 }} disabled title="Convite por e-mail ainda não configurado">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2" aria-hidden>
                  <line x1="6" y1="1" x2="6" y2="11" />
                  <line x1="1" y1="6" x2="11" y2="6" />
                </svg>
                Convidar
              </button>
            </div>
            {linhasMembros.map((row, idx) => {
              const g = avatarGrad(row.perfil.usuario_id, idx);
              const labelRole = row.kind === "admin_equipe" ? "Admin Equipe" : row.kind === "gestor" ? "Gestor" : "CS";
              return (
                <div
                  key={row.perfil.usuario_id}
                  className="eq-member-row"
                >
                  <div className="eq-m-av" style={{ background: `linear-gradient(135deg, ${g.from}, ${g.to})` }}>
                    {initialsFromNome(row.perfil.nome_completo ?? row.perfil.usuario_id)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="eq-m-name">{row.perfil.nome_completo ?? row.perfil.usuario_id}</div>
                    <div className="eq-m-email">{row.perfil.usuario_id}</div>
                  </div>
                  <span
                    className={`eq-role-badge${row.kind === "admin_equipe" ? " eq-role-admin" : row.kind === "gestor" ? " eq-role-gestor" : " eq-role-cs"}`}
                  >
                    {labelRole}
                  </span>
                </div>
              );
            })}
            <div style={{ padding: "10px 18px", borderTop: "1px solid #F5F5F5", background: "#FAFAFA", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--t3)" }}>
                {linhasMembros.length} membro{linhasMembros.length === 1 ? "" : "s"}
              </span>
              <button type="button" className="eq-footer-link" onClick={() => setTab("visao")}>
                Ver operação (slots) →
              </button>
            </div>

            <div style={{ padding: "18px 20px", borderTop: "1px solid var(--bd)" }}>
              <div className="kpi-section-title" style={{ marginBottom: 12 }}>
                Incluir no grupo
              </div>
              <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Gestores do grupo</h3>
              <Input value={gestorQuery} onChange={(e) => setGestorQuery(e.target.value)} placeholder="Buscar gestor" className="h-8" />
              {gestorQuery.trim() ? (
                <div className="max-h-[120px] overflow-auto rounded-md border p-1">
                  {gestoresSugestoes.map((g) => (
                    <button
                      key={g.usuario_id}
                      type="button"
                      className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-muted"
                      onClick={async () => {
                        if (!equipeId) return;
                        const next = [...new Set([...selectedGestores, g.usuario_id])];
                        setSelectedGestores(next);
                        setGestorQuery("");
                        await setGestoresForEquipe({ equipeId, gestorIds: next });
                        await load();
                      }}
                    >
                      {g.nome_completo ?? g.usuario_id}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="max-h-[160px] overflow-auto rounded-md border p-2 text-xs">
                {gestoresSelecionados.length === 0 ? (
                  <span className="text-muted-foreground">Sem gestores no grupo.</span>
                ) : (
                  gestoresSelecionados.map((g) => (
                    <div
                      key={g.usuario_id}
                      className={`flex items-center justify-between rounded px-1 py-1 ${
                        gestorSelecionadoParaExcluir === g.usuario_id ? "bg-muted" : ""
                      }`}
                      onClick={() => setGestorSelecionadoParaExcluir(g.usuario_id)}
                    >
                      <span className="truncate">{g.nome_completo ?? g.usuario_id}</span>
                      {gestorSelecionadoParaExcluir === g.usuario_id ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-destructive"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!equipeId) return;
                            const next = selectedGestores.filter((id) => id !== g.usuario_id);
                            setSelectedGestores(next);
                            setGestorSelecionadoParaExcluir(null);
                            await setGestoresForEquipe({ equipeId, gestorIds: next });
                            await load();
                          }}
                        >
                          Excluir
                        </Button>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold">CS do grupo</h3>
              <Input value={csQuery} onChange={(e) => setCsQuery(e.target.value)} placeholder="Buscar CS" className="h-8" />
              {csQuery.trim() ? (
                <div className="max-h-[120px] overflow-auto rounded-md border p-1">
                  {csSugestoes.map((c) => (
                    <button
                      key={c.usuario_id}
                      type="button"
                      className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-muted"
                      onClick={async () => {
                        if (!equipeId) return;
                        const next = [...new Set([...selectedCs, c.usuario_id])];
                        setSelectedCs(next);
                        setCsQuery("");
                        await setCsForEquipe({ equipeId, csIds: next });
                        await load();
                      }}
                    >
                      {c.nome_completo ?? c.usuario_id}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="max-h-[160px] overflow-auto rounded-md border p-2 text-xs">
                {csSelecionados.length === 0 ? (
                  <span className="text-muted-foreground">Sem CS no grupo.</span>
                ) : (
                  csSelecionados.map((c) => (
                    <div
                      key={c.usuario_id}
                      className={`flex items-center justify-between rounded px-1 py-1 ${
                        csSelecionadoParaExcluir === c.usuario_id ? "bg-muted" : ""
                      }`}
                      onClick={() => setCsSelecionadoParaExcluir(c.usuario_id)}
                    >
                      <span className="truncate">{c.nome_completo ?? c.usuario_id}</span>
                      {csSelecionadoParaExcluir === c.usuario_id ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-destructive"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!equipeId) return;
                            const next = selectedCs.filter((id) => id !== c.usuario_id);
                            setSelectedCs(next);
                            setCsSelecionadoParaExcluir(null);
                            const nextAssignments: Record<number, string[]> = {};
                            for (const [slotKey, ids] of Object.entries(csAssignmentsBySlot)) {
                              const slot = Number(slotKey);
                              nextAssignments[slot] = (ids ?? []).filter((id) => id !== c.usuario_id);
                            }
                            await setCSEquipeAssignments({ equipeId: groupId, assignments: nextAssignments });
                            await setCsForEquipe({ equipeId, csIds: next });
                            await load();
                          }}
                        >
                          Excluir
                        </Button>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
            </div>
          </div>
        ) : null}

        {tab === "clientes" ? (
          <div style={{ overflowX: "auto" }}>
            <table className="am-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Papel</th>
                  <th>Utilizador</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {perfisEquipe.filter((p) => p.role === "cliente" || p.role === "cliente_gestao").length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ fontSize: 13, color: "var(--t3)", padding: "18px 16px" }}>
                      Sem clientes com <code style={{ fontSize: 11 }}>equipe_id</code> neste grupo.
                    </td>
                  </tr>
                ) : (
                  perfisEquipe
                    .filter((p) => p.role === "cliente" || p.role === "cliente_gestao")
                    .map((p, i) => {
                      const g = avatarGrad(p.usuario_id, i);
                      return (
                        <tr
                          key={p.usuario_id}
                        >
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div className="eq-m-av" style={{ width: 28, height: 28, fontSize: 10, background: `linear-gradient(135deg, ${g.from}, ${g.to})` }}>
                                {initialsFromNome(p.nome_completo ?? p.usuario_id)}
                              </div>
                              <span style={{ fontWeight: 600 }}>{p.nome_completo ?? "—"}</span>
                            </div>
                          </td>
                          <td>{p.role === "cliente_gestao" ? "Cliente gestão" : "Cliente"}</td>
                          <td style={{ fontFamily: "monospace", fontSize: 11, color: "var(--t3)" }}>{shortUid(p.usuario_id)}</td>
                          <td>
                            <span className="badge badge-ok">Ativo</span>
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        ) : null}

        {tab === "config" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "16px 18px 22px" }}>
            <div className="table-card">
              <div className="tc-header">
                <div className="tc-title">
                  <span className="tc-icon" aria-hidden>
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="var(--p)" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M9.5 1.5L11.5 3.5 4.5 10.5H2.5V8.5L9.5 1.5Z" />
                    </svg>
                  </span>
                  Informações da equipe
                </div>
              </div>
              <div style={{ padding: 18 }}>
                <div className="eq-config-field">
                  <label className="eq-config-lbl">Nome da equipe</label>
                  <input className="eq-config-in" value={nome} onChange={(e) => setNome(e.target.value)} />
                </div>
                <div className="eq-config-field" style={{ marginBottom: 0 }}>
                  <label className="eq-config-lbl">Cor da equipe</label>
                  <div className="eq-color-row">
                    {COLOR_PRESETS.map((c, i) => (
                      <button
                        key={i}
                        type="button"
                        className={`eq-color-chip${i === configColorIdx ? " selected" : ""}`}
                        style={{ background: `linear-gradient(135deg, ${c.from}, ${c.to})` }}
                        aria-label={`Cor ${i + 1}`}
                        onClick={() => setConfigColorIdx(i)}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="eq-modal-ft" style={{ borderTop: "1px solid var(--bd)", background: "#FAFAFA" }}>
                <button type="button" className="btn-outline" style={{ height: 34, fontSize: 12 }} onClick={() => setNome(equipe.nome)} disabled={saving}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ height: 34, fontSize: 12 }}
                  disabled={saving || nome.trim() === equipe.nome || nome.trim().length < 2}
                  onClick={async () => {
                    setSaving(true);
                    setError(null);
                    try {
                      const trimmed = nome.trim();
                      await updateEquipeNome(equipe.id, trimmed);
                      patchEquipeNomeInList(equipe.id, trimmed);
                      await load();
                    } catch (e) {
                      setError(formatSupabaseError(e));
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  Salvar alterações
                </button>
              </div>
            </div>

            <div className="table-card">
              <div className="tc-header" style={{ borderColor: "rgba(220,38,38,0.2)", background: "#FFF5F5" }}>
                <div className="tc-title" style={{ color: "var(--err)" }}>
                  <span className="tc-icon" style={{ background: "var(--err-bg)", borderColor: "var(--err-bd)" }} aria-hidden>
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="var(--err)" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M6.5 1L1 11.5h11L6.5 1Z" />
                      <line x1="6.5" y1="5" x2="6.5" y2="8" />
                      <circle cx="6.5" cy="10" r=".6" fill="var(--err)" />
                    </svg>
                  </span>
                  Zona de perigo
                </div>
              </div>
              <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="eq-danger-row">
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--err)" }}>Desativar equipe</div>
                    <div style={{ fontSize: 12, color: "#B91C1C", marginTop: 2 }}>Suspende todos os acessos sem excluir dados</div>
                  </div>
                  <button type="button" className="eq-btn-sm-err" onClick={() => setDangerModal("desativar")}>
                    Desativar
                  </button>
                </div>
                <div className="eq-danger-row">
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--err)" }}>Excluir equipe permanentemente</div>
                    <div style={{ fontSize: 12, color: "#B91C1C", marginTop: 2 }}>Remove todos os dados. Ação irreversível.</div>
                  </div>
                  <button type="button" className="eq-btn-sm-err" onClick={() => setDangerModal("excluir")}>
                    Excluir
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {dangerModal ? (
        <div className="eq-modal-overlay" role="presentation" onClick={() => setDangerModal(null)}>
          <div className="eq-modal" style={{ maxWidth: 420 }} role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
            <div className="eq-modal-h">
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Confirmar</h2>
              <button type="button" className="eq-modal-x" aria-label="Fechar" onClick={() => setDangerModal(null)}>
                ×
              </button>
            </div>
            <p style={{ fontSize: 13, color: "var(--t2)", padding: "0 20px 16px", margin: 0, lineHeight: 1.5 }}>
              {dangerModal === "desativar"
                ? "A desactivação global de equipes ainda não está ligada a uma acção no Supabase."
                : "A exclusão permanente ainda não está disponível neste painel."}
            </p>
            <div className="eq-modal-ft">
              <button type="button" className="btn-outline" onClick={() => setDangerModal(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function shortUid(id: string): string {
  if (id.length <= 18) return id;
  return `${id.slice(0, 10)}…`;
}

