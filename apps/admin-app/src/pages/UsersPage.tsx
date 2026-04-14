import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useAdminEquipe } from "@/context/AdminEquipeContext";
import { useAccessScope } from "@/hooks/useAccessScope";
import { canDeleteUsers } from "@/lib/accessScope";
import {
  createUser,
  csNaEquipe,
  deleteUser,
  formatSupabaseError,
  gestoresNaEquipe,
  listClienteCsIdsMap,
  listClienteGestorIdsMap,
  listCsPerfis,
  listEquipeCsLinks,
  listEquipeGestorLinks,
  listEquipes,
  listGestores,
  listPerfis,
  updateUser,
  type Equipe,
  type Perfil,
} from "@/lib/adminApi";

/** Criação: nunca admin global nem admin_master (estes só na BD / Supabase). */
const roleOptionsCreate: Perfil["role"][] = ["cliente", "cliente_gestao", "gestor", "cs", "admin_equipe"];

const ROLE_OPTION_LABEL: Record<string, string> = {
  cliente: "Cliente",
  cliente_gestao: "Cliente gestão",
  gestor: "Gestor",
  cs: "CS",
  admin_equipe: "Admin da equipe (admin_equipe)",
  admin: "Admin global do painel (admin)",
};

function roleOptionsForEdit(scopeKind: "global_admin" | "equipe_admin" | undefined | null, currentRole: string): Perfil["role"][] {
  const base: Perfil["role"][] = ["cliente", "cliente_gestao", "gestor", "cs", "admin_equipe"];
  const list = scopeKind === "global_admin" ? [...base, "admin" as Perfil["role"]] : base;
  const cur = String(currentRole).trim();
  if (cur && cur !== "admin_master" && !list.includes(cur as Perfil["role"])) {
    return [...list, cur as Perfil["role"]];
  }
  return list;
}

function roleRequiresEquipe(role: Perfil["role"]): boolean {
  return role === "gestor" || role === "cs" || role === "cliente_gestao" || role === "admin_equipe";
}

function equipesFlatOptions(equipes: Equipe[]) {
  return equipes
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    .map((eq) => (
      <option key={eq.id} value={eq.id}>
        {eq.nome}
      </option>
    ));
}

const inp = {
  width: "100%",
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid #e2e8f0",
  fontSize: 13,
} as const;

export default function UsersPage() {
  const { scope } = useAccessScope();
  const { equipeIdsFiltro } = useAdminEquipe();
  const [equipesFlat, setEquipesFlat] = useState<Equipe[]>([]);
  const [equipeGestorLinks, setEquipeGestorLinks] = useState<Array<{ equipe_id: string; gestor_id: string }>>([]);
  const [equipeCsLinks, setEquipeCsLinks] = useState<Array<{ equipe_id: string; cs_id: string }>>([]);
  const [allGestores, setAllGestores] = useState<Perfil[]>([]);
  const [csPerfis, setCsPerfis] = useState<Perfil[]>([]);
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [carteiraGestoresByUser, setCarteiraGestoresByUser] = useState<Record<string, string[]>>({});
  const [carteiraCsByUser, setCarteiraCsByUser] = useState<Record<string, string[]>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchParams] = useSearchParams();
  const equipeFilterId = searchParams.get("equipe") ?? "";
  const usuarioHighlightId = searchParams.get("usuario") ?? "";

  const equipesById = useMemo(() => new Map(equipesFlat.map((e) => [e.id, e.nome])), [equipesFlat]);

  const filtered = useMemo(() => {
    let base = equipeFilterId ? perfis.filter((p) => (p.equipe_id ?? "") === equipeFilterId) : perfis;
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter((p) => {
      const name = p.nome_completo ?? "";
      return name.toLowerCase().includes(q) || p.usuario_id.toLowerCase().includes(q);
    });
  }, [perfis, search, equipeFilterId]);

  const [createForm, setCreateForm] = useState({
    nome_completo: "",
    email: "",
    password: "",
    role: "cliente" as Perfil["role"],
    equipe_id: "",
    cliente_gestor_ids: [] as string[],
    cliente_cs_ids: [] as string[],
  });
  const [pendingCreate, setPendingCreate] = useState(false);
  const [editByUser, setEditByUser] = useState<Record<string, Partial<Perfil>>>({});
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  const createGestoresNaEquipeForm = useMemo(
    () =>
      createForm.role === "cliente_gestao" && createForm.equipe_id
        ? gestoresNaEquipe(createForm.equipe_id, allGestores, equipeGestorLinks)
        : [],
    [createForm.role, createForm.equipe_id, allGestores, equipeGestorLinks],
  );
  const createCsNaEquipeForm = useMemo(
    () =>
      createForm.role === "cliente_gestao" && createForm.equipe_id
        ? csNaEquipe(createForm.equipe_id, equipeCsLinks, csPerfis)
        : [],
    [createForm.role, createForm.equipe_id, equipeCsLinks, csPerfis],
  );

  const refresh = async () => {
    const parts: string[] = [];
    let flat: Equipe[] = [];
    let eg: Array<{ equipe_id: string; gestor_id: string }> = [];
    let ec: Array<{ equipe_id: string; cs_id: string }> = [];
    let gs: Perfil[] = [];
    let cs: Perfil[] = [];
    let pf: Perfil[] = [];
    const equipeFromUrl = equipeFilterId.trim();
    const teamIdsForFetch =
      equipeFromUrl.length > 0 ? [equipeFromUrl] : equipeIdsFiltro.length > 0 ? [...equipeIdsFiltro] : [];
    const team = teamIdsForFetch.length > 0 ? { equipeIds: teamIdsForFetch } : undefined;
    try {
      flat = await listEquipes();
    } catch (e) {
      parts.push(`Equipes: ${formatSupabaseError(e)}`);
    }
    try {
      eg = await listEquipeGestorLinks();
    } catch (e) {
      parts.push(`equipe_gestores: ${formatSupabaseError(e)}`);
    }
    try {
      ec = await listEquipeCsLinks();
    } catch (e) {
      parts.push(`equipe_cs: ${formatSupabaseError(e)}`);
    }
    try {
      gs = await listGestores();
    } catch (e) {
      parts.push(`Gestores: ${formatSupabaseError(e)}`);
    }
    try {
      cs = await listCsPerfis();
    } catch (e) {
      parts.push(`CS: ${formatSupabaseError(e)}`);
    }
    try {
      pf = await listPerfis(team);
    } catch (e) {
      parts.push(`Perfis: ${formatSupabaseError(e)}`);
    }

    // Garante que membros vinculados por equipe_gestores / equipe_cs também aparecem
    // quando o filtro está por equipe (mesmo em cenários legados de perfis.equipe_id).
    if (teamIdsForFetch.length > 0) {
      const eqSet = new Set(teamIdsForFetch);
      const linkedGestorIds = new Set(eg.filter((l) => eqSet.has(l.equipe_id)).map((l) => l.gestor_id));
      const linkedCsIds = new Set(ec.filter((l) => eqSet.has(l.equipe_id)).map((l) => l.cs_id));
      const byUserId = new Map(pf.map((p) => [p.usuario_id, p]));
      for (const g of gs) {
        if (linkedGestorIds.has(g.usuario_id) && !byUserId.has(g.usuario_id)) byUserId.set(g.usuario_id, g);
      }
      for (const c of cs) {
        if (linkedCsIds.has(c.usuario_id) && !byUserId.has(c.usuario_id)) byUserId.set(c.usuario_id, c);
      }
      pf = [...byUserId.values()];
    }
    setEquipesFlat(flat);
    setEquipeGestorLinks(eg);
    setEquipeCsLinks(ec);
    setAllGestores(gs);
    setCsPerfis(cs);
    setPerfis(pf);
    setError(parts.length ? parts.join(" ") : null);
    const carteiraIds = pf.filter((p) => p.role === "cliente_gestao" || p.role === "cliente").map((p) => p.usuario_id);
    try {
      const [gm, cm] = await Promise.all([listClienteGestorIdsMap(carteiraIds), listClienteCsIdsMap(carteiraIds)]);
      setCarteiraGestoresByUser(gm);
      setCarteiraCsByUser(cm);
    } catch (e) {
      setError((prev) => (prev ? `${prev} ` : "") + `Carteira: ${formatSupabaseError(e)}`);
    }
  };

  useEffect(() => {
    let m = true;
    (async () => {
      setLoading(true);
      await refresh();
      if (m) setLoading(false);
    })();
    return () => {
      m = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipeIdsFiltro.join(","), equipeFilterId]);

  const highlightTargetPresent =
    Boolean(usuarioHighlightId.trim()) && filtered.some((p) => p.usuario_id === usuarioHighlightId.trim());

  useEffect(() => {
    if (loading || !highlightTargetPresent) return;
    const uid = usuarioHighlightId.trim();
    const t = window.setTimeout(() => {
      const el = document.getElementById(`admin-user-row-${uid}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.setAttribute("data-user-highlight", "1");
      window.setTimeout(() => el.removeAttribute("data-user-highlight"), 2600);
    }, 120);
    return () => window.clearTimeout(t);
  }, [loading, usuarioHighlightId, highlightTargetPresent]);

  if (loading) return <div style={{ fontSize: 14, color: "#64748b" }}>Carregando…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Usuários</h1>
        <p style={{ marginTop: 4, fontSize: 13, color: "#64748b" }}>
          Criar com senha provisória; no app o utilizador será obrigado a definir nova senha. Escolha primeiro o role e depois a equipe;
          para <code style={{ fontSize: 12 }}>cliente_gestao</code>, os gestores e CS listados vêm apenas da equipe escolhida no
          formulário. <strong>Admin da equipe</strong> grava <code style={{ fontSize: 12 }}>admin_equipe</code> (gestão no Manager); o
          role <code style={{ fontSize: 12 }}>admin_master</code> não pode ser criado nem atribuído aqui — só diretamente na base.
        </p>
        {equipeFilterId ? (
          <p style={{ marginTop: 8, fontSize: 13 }}>
            Filtro por equipe: <strong>{equipesById.get(equipeFilterId) ?? equipeFilterId}</strong> ·{" "}
            <Link to="/users" style={{ color: "#8A05BE" }}>
              Limpar filtro
            </Link>
          </p>
        ) : null}
      </div>
      {error ? (
        <div style={{ padding: 12, borderRadius: 8, background: "#fef2f2", color: "#991b1b", fontSize: 13 }}>{error}</div>
      ) : null}

      <div style={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "#fff", padding: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Criar utilizador</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500 }}>Role</label>
            <select
              style={inp}
              value={createForm.role}
              onChange={(e) => {
                const r = e.target.value as Perfil["role"];
                setCreateForm((s) => ({
                  ...s,
                  role: r,
                  cliente_gestor_ids: r === "cliente_gestao" ? s.cliente_gestor_ids : [],
                  cliente_cs_ids: r === "cliente_gestao" ? s.cliente_cs_ids : [],
                }));
              }}
            >
              {roleOptionsCreate.map((r) => (
                <option key={r} value={r}>
                  {ROLE_OPTION_LABEL[r] ?? r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500 }}>
              Equipe
              {roleRequiresEquipe(createForm.role) ? (
                <span style={{ color: "#b91c1c" }}> *</span>
              ) : (
                <span style={{ color: "#64748b", fontWeight: 400 }}> (opcional para cliente)</span>
              )}
            </label>
            <select
              style={inp}
              value={createForm.equipe_id}
              onChange={(e) => {
                const v = e.target.value;
                setCreateForm((s) => ({
                  ...s,
                  equipe_id: v,
                  cliente_gestor_ids: s.role === "cliente_gestao" ? [] : s.cliente_gestor_ids,
                  cliente_cs_ids: s.role === "cliente_gestao" ? [] : s.cliente_cs_ids,
                }));
              }}
            >
              {!roleRequiresEquipe(createForm.role) ? <option value="">— Sem equipe —</option> : null}
              {roleRequiresEquipe(createForm.role) ? (
                <option value="" disabled>
                  — Escolher equipe —
                </option>
              ) : null}
              {equipesFlatOptions(equipesFlat)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500 }}>Nome</label>
            <input
              style={inp}
              value={createForm.nome_completo}
              onChange={(e) => setCreateForm((s) => ({ ...s, nome_completo: e.target.value }))}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500 }}>Email</label>
            <input
              style={inp}
              type="email"
              value={createForm.email}
              onChange={(e) => setCreateForm((s) => ({ ...s, email: e.target.value }))}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500 }}>Senha provisória</label>
            <input
              style={inp}
              type="password"
              value={createForm.password}
              onChange={(e) => setCreateForm((s) => ({ ...s, password: e.target.value }))}
            />
          </div>
        </div>

        {createForm.role === "cliente_gestao" ? (
          <div style={{ marginTop: 12, padding: 12, background: "#f8fafc", borderRadius: 8, fontSize: 13 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              Carteira — gestores e CS da equipe escolhida acima
              {!createForm.equipe_id ? (
                <span style={{ fontWeight: 400, color: "#64748b" }}> (selecione uma equipe para carregar a lista)</span>
              ) : null}
            </div>
            <div style={{ maxHeight: 120, overflow: "auto" }}>
              {createGestoresNaEquipeForm.map((g) => (
                <label key={g.usuario_id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                  <input
                    type="checkbox"
                    checked={createForm.cliente_gestor_ids.includes(g.usuario_id)}
                    onChange={(e) => {
                      const set = new Set(createForm.cliente_gestor_ids);
                      if (e.target.checked) set.add(g.usuario_id);
                      else set.delete(g.usuario_id);
                      setCreateForm((s) => ({ ...s, cliente_gestor_ids: [...set] }));
                    }}
                  />
                  {g.nome_completo ?? g.usuario_id.slice(0, 8)}
                </label>
              ))}
            </div>
            <div style={{ marginTop: 8, maxHeight: 100, overflow: "auto" }}>
              {createCsNaEquipeForm.map((c) => (
                <label key={c.usuario_id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                  <input
                    type="checkbox"
                    checked={createForm.cliente_cs_ids.includes(c.usuario_id)}
                    onChange={(e) => {
                      const set = new Set(createForm.cliente_cs_ids);
                      if (e.target.checked) set.add(c.usuario_id);
                      else set.delete(c.usuario_id);
                      setCreateForm((s) => ({ ...s, cliente_cs_ids: [...set] }));
                    }}
                  />
                  CS: {c.nome_completo ?? c.usuario_id.slice(0, 8)}
                </label>
              ))}
            </div>
          </div>
        ) : null}

        <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            disabled={
              pendingCreate ||
              createForm.nome_completo.trim().length < 2 ||
              !createForm.email.includes("@") ||
              createForm.password.length < 6 ||
              (roleRequiresEquipe(createForm.role) && !createForm.equipe_id.trim())
            }
            onClick={async () => {
              setPendingCreate(true);
              setError(null);
              try {
                const rawEq = createForm.equipe_id.trim();
                const equipeForPerfil = rawEq === "" ? null : rawEq;
                await createUser({
                  nome_completo: createForm.nome_completo.trim(),
                  email: createForm.email.trim(),
                  password: createForm.password,
                  role: createForm.role,
                  equipe_id: equipeForPerfil,
                  cliente_gestor_ids:
                    createForm.role === "cliente_gestao" && createForm.cliente_gestor_ids.length
                      ? createForm.cliente_gestor_ids
                      : null,
                  cliente_cs_ids:
                    createForm.role === "cliente_gestao" && createForm.cliente_cs_ids.length ? createForm.cliente_cs_ids : null,
                });
                setCreateForm({
                  nome_completo: "",
                  email: "",
                  password: "",
                  role: "cliente",
                  equipe_id: "",
                  cliente_gestor_ids: [],
                  cliente_cs_ids: [],
                });
                await refresh();
              } catch (err) {
                setError(formatSupabaseError(err) || "Falha ao criar");
              } finally {
                setPendingCreate(false);
              }
            }}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              background: "#0f172a",
              color: "#fff",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
              opacity: pendingCreate ? 0.6 : 1,
            }}
          >
            {pendingCreate ? "A criar…" : "Criar utilizador"}
          </button>
        </div>
      </div>

      <div>
        <label style={{ fontSize: 12, fontWeight: 500 }}>Buscar</label>
        <input style={{ ...inp, maxWidth: 320, marginTop: 4 }} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div style={{ overflow: "auto", borderRadius: 12, border: "1px solid hsl(var(--border))", background: "#fff" }}>
        <table style={{ width: "100%", minWidth: 900, fontSize: 13, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e2e8f0", textAlign: "left", color: "#64748b", fontSize: 12 }}>
              <th style={{ padding: 10 }}>Utilizador</th>
              <th style={{ padding: 10 }}>Role</th>
              <th style={{ padding: 10 }}>Carteira</th>
              <th style={{ padding: 10 }}>Nome</th>
              <th style={{ padding: 10 }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: 24, color: "#64748b" }}>
                  Nenhum resultado.
                </td>
              </tr>
            ) : (
              filtered.map((p) => {
                const edited = editByUser[p.usuario_id] ?? {};
                const role = (edited.role as string) ?? p.role;
                const nome = (edited.nome_completo as string) ?? (p.nome_completo ?? "");
                const equipeId = (edited.equipe_id as string | null | undefined) ?? p.equipe_id ?? null;
                const isSaving = savingUserId === p.usuario_id;
                const isAdminMasterRow = String(p.role).trim().toLowerCase() === "admin_master";
                const editRoleChoices = roleOptionsForEdit(scope?.kind, p.role);
                const gestoresGrupo = equipeId ? gestoresNaEquipe(equipeId, allGestores, equipeGestorLinks) : [];
                const csGrupo = equipeId ? csNaEquipe(equipeId, equipeCsLinks, csPerfis) : [];
                const cg = carteiraGestoresByUser[p.usuario_id] ?? [];
                const cc = carteiraCsByUser[p.usuario_id] ?? [];

                return (
                  <tr
                    id={`admin-user-row-${p.usuario_id}`}
                    key={p.usuario_id}
                    style={{ borderTop: "1px solid #f1f5f9", verticalAlign: "top" }}
                  >
                    <td style={{ padding: 10 }}>
                      <div style={{ fontWeight: 600 }}>{nome || "—"}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>{p.usuario_id}</div>
                    </td>
                    <td style={{ padding: 10 }}>
                      {isAdminMasterRow ? (
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>admin_master</div>
                          <div style={{ fontSize: 11, color: "#64748b", maxWidth: 200, marginTop: 4 }}>
                            Não pode ser criado nem promovido pelo painel; ajuste só na base (Supabase/SQL).
                          </div>
                        </div>
                      ) : (
                        <select
                          style={inp}
                          value={role}
                          onChange={(e) =>
                            setEditByUser((s) => ({ ...s, [p.usuario_id]: { ...edited, role: e.target.value } }))
                          }
                        >
                          {editRoleChoices.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_OPTION_LABEL[r] ?? r}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td style={{ padding: 10, fontSize: 12, color: "#64748b", maxWidth: 220 }}>
                      {role === "cliente_gestao" ? (
                        <div>
                          <div style={{ fontWeight: 600, color: "#0f172a", marginBottom: 4 }}>Gestores</div>
                          {equipeId
                            ? gestoresGrupo.map((g) => (
                                <label key={g.usuario_id} style={{ display: "flex", gap: 6, marginBottom: 2 }}>
                                  <input
                                    type="checkbox"
                                    checked={cg.includes(g.usuario_id)}
                                    onChange={(e) => {
                                      const set = new Set(cg);
                                      if (e.target.checked) set.add(g.usuario_id);
                                      else set.delete(g.usuario_id);
                                      setCarteiraGestoresByUser((prev) => ({ ...prev, [p.usuario_id]: [...set] }));
                                    }}
                                  />
                                  {g.nome_completo ?? "—"}
                                </label>
                              ))
                            : "—"}
                          <div style={{ fontWeight: 600, color: "#0f172a", margin: "8px 0 4px" }}>CS</div>
                          {equipeId
                            ? csGrupo.map((c) => (
                                <label key={c.usuario_id} style={{ display: "flex", gap: 6, marginBottom: 2 }}>
                                  <input
                                    type="checkbox"
                                    checked={cc.includes(c.usuario_id)}
                                    onChange={(e) => {
                                      const set = new Set(cc);
                                      if (e.target.checked) set.add(c.usuario_id);
                                      else set.delete(c.usuario_id);
                                      setCarteiraCsByUser((prev) => ({ ...prev, [p.usuario_id]: [...set] }));
                                    }}
                                  />
                                  {c.nome_completo ?? "—"}
                                </label>
                              ))
                            : "—"}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ padding: 10 }}>
                      <input
                        style={inp}
                        value={nome}
                        onChange={(e) =>
                          setEditByUser((s) => ({ ...s, [p.usuario_id]: { ...edited, nome_completo: e.target.value } }))
                        }
                      />
                    </td>
                    <td style={{ padding: 10 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={async () => {
                            setSavingUserId(p.usuario_id);
                            setError(null);
                            try {
                              await updateUser({
                                usuario_id: p.usuario_id,
                                previousRole: p.role,
                                nome_completo: nome.trim() || "Utilizador",
                                role: role as Perfil["role"],
                                equipe_id: equipeId,
                                cliente_gestor_ids: role === "cliente_gestao" ? cg : undefined,
                                cliente_cs_ids: role === "cliente_gestao" ? cc : undefined,
                              });
                              setEditByUser((s) => {
                                const n = { ...s };
                                delete n[p.usuario_id];
                                return n;
                              });
                              await refresh();
                            } catch (err) {
                              setError(formatSupabaseError(err) || "Falha ao guardar");
                            } finally {
                              setSavingUserId(null);
                            }
                          }}
                          style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 12 }}
                        >
                          {isSaving ? "…" : "Guardar"}
                        </button>
                        {canDeleteUsers(scope) ? (
                          <button
                            type="button"
                            onClick={async () => {
                              if (!window.confirm(`Eliminar ${nome || p.usuario_id}?`)) return;
                              setError(null);
                              try {
                                await deleteUser(p.usuario_id);
                                await refresh();
                              } catch (err) {
                                setError(formatSupabaseError(err) || "Falha ao eliminar");
                              }
                            }}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 6,
                              border: "1px solid #fecaca",
                              color: "#b91c1c",
                              fontSize: 12,
                            }}
                          >
                            Eliminar
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
