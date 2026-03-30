import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

export default function EquipeDetailPage() {
  const { scope } = useAccessScope();
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
        setLoading(false);
        return;
      }
      const [gf, gsMap, csAssignments] = await Promise.all([
        listGestorFuncoesMap(gs.map((g) => g.usuario_id)),
        listGestorEquipeSlotMap({ equipeId: groupId, gestorIds: gs.map((g) => g.usuario_id) }),
        listCSEquipeAssignments({ equipeId: groupId }),
      ]);
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

  if (!allowGlobalEquipes) return <Card><CardHeader><CardTitle>Equipes</CardTitle></CardHeader></Card>;
  if (loading) return <div className="text-sm text-muted-foreground">Carregando...</div>;
  if (!equipe) return <div className="text-sm text-muted-foreground">Grupo não encontrado.</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{equipe.nome}</CardTitle>
          <CardDescription>Página dedicada para alterações deste grupo.</CardDescription>
          <Link to="/equipes" className="text-sm text-primary hover:underline">Voltar para lista de grupos</Link>
        </CardHeader>
        <CardContent className="space-y-5">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex items-end gap-2">
            <Input value={nome} onChange={(e) => setNome(e.target.value)} className="max-w-[320px]" />
            <Button
              type="button"
              variant="outline"
              disabled={saving || nome.trim() === equipe.nome}
              onClick={async () => {
                setSaving(true);
                setError(null);
                try {
                  await updateEquipeNome(equipe.id, nome);
                  await load();
                } catch (e) {
                  setError(formatSupabaseError(e));
                } finally {
                  setSaving(false);
                }
              }}
            >
              Renomear grupo
            </Button>
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

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Separação por equipes (Nacional/Internacional + CS)</h3>
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
                <div key={slot} className="rounded-md border p-2">
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
        </CardContent>
      </Card>
    </div>
  );
}

