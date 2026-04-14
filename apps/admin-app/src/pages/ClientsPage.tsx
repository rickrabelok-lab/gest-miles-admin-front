import { useEffect, useMemo, useState } from "react";

import { AdminTableToolbar } from "@/components/admin/AdminTableToolbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatSupabaseError,
  gestoresNaEquipe,
  listClienteGestorIdsMap,
  listEquipeGestorLinks,
  listEquipes,
  listGestores,
  listPerfis,
  moveClientToEquipe,
  setGestoresForClient,
  updateUser,
  type Equipe,
  type Perfil,
} from "@/lib/adminApi";

function sameSelection(perfil: Perfil, role: Perfil["role"], equipeId: string) {
  return perfil.role === role && (perfil.equipe_id ?? "") === equipeId;
}

/** Contas diretas B2C: só `cliente` e sem equipa de gestão atribuída. */
function isB2cClienteRow(p: Perfil): boolean {
  return p.role === "cliente" && (p.equipe_id ?? "").toString().trim() === "";
}

export default function ClientsPage() {
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [allGestores, setAllGestores] = useState<Perfil[]>([]);
  const [equipeGestorLinks, setEquipeGestorLinks] = useState<Array<{ equipe_id: string; gestor_id: string }>>([]);
  const [carteiraGestoresByUser, setCarteiraGestoresByUser] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const clientes = useMemo(() => perfis.filter(isB2cClienteRow), [perfis]);

  const equipesOrdenadas = useMemo(
    () => [...equipes].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [equipes],
  );

  const filteredClientes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter((c) => {
      const n = c.nome_completo ?? "";
      return n.toLowerCase().includes(q) || c.usuario_id.toLowerCase().includes(q);
    });
  }, [clientes, search]);

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
      const b2c = p.filter(isB2cClienteRow);
      setPerfis(b2c);
      setAllGestores(gs);
      setEquipeGestorLinks(eg);
      const carteiraIds = b2c.map((x) => x.usuario_id);
      setCarteiraGestoresByUser(carteiraIds.length ? await listClienteGestorIdsMap(carteiraIds) : {});
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Usuários GestMiles</CardTitle>
          <CardDescription>
            Apenas contas <strong>B2C</strong>: role <code className="text-xs">cliente</code>, sem{" "}
            <code className="text-xs">equipe_id</code> (fora de equipas de gestão). Não inclui{" "}
            <code className="text-xs">cliente_gestao</code>, CS, gestores nem admins de equipa. Pode associar uma equipa ou
            promover a <code className="text-xs">cliente_gestao</code> para integrar na gestão.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
          <AdminTableToolbar value={search} onChange={setSearch} placeholder="Pesquisar conta B2C…" />
          {!loading && filteredClientes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma conta B2C sem equipa encontrada.</p>
          ) : null}
          <div className="overflow-x-auto rounded-[14px] border border-nubank-border bg-white">
            <table className="w-full min-w-[960px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-nubank-border text-left text-xs font-medium uppercase tracking-wide text-nubank-text-secondary">
                  <th className="px-3 py-3">Nome</th>
                  <th className="px-3 py-3">Role</th>
                  <th className="px-3 py-3">Equipa</th>
                  <th className="px-3 py-3">Gestores</th>
                  <th className="px-3 py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-t border-nubank-border">
                        <td className="px-3 py-3" colSpan={5}>
                          <Skeleton className="h-10 w-full" />
                        </td>
                      </tr>
                    ))
                  : filteredClientes.map((c) => (
                      <ClientRow
                        key={c.usuario_id}
                        perfil={c}
                        allEquipes={equipesOrdenadas}
                        allGestores={allGestores}
                        equipeGestorLinks={equipeGestorLinks}
                        carteiraGestorIds={carteiraGestoresByUser[c.usuario_id] ?? []}
                        onDone={refresh}
                      />
                    ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ClientRow({
  perfil,
  allEquipes,
  allGestores,
  equipeGestorLinks,
  carteiraGestorIds,
  onDone,
}: {
  perfil: Perfil;
  allEquipes: Equipe[];
  allGestores: Perfil[];
  equipeGestorLinks: Array<{ equipe_id: string; gestor_id: string }>;
  carteiraGestorIds: string[];
  onDone: () => Promise<void>;
}) {
  const [equipeId, setEquipeId] = useState(perfil.equipe_id ?? "");
  const [role, setRole] = useState(perfil.role);
  const [busy, setBusy] = useState(false);
  const [gSel, setGSel] = useState<string[]>(carteiraGestorIds);
  const [cartBusy, setCartBusy] = useState(false);

  const gestoresDisponiveis = useMemo(
    () => (equipeId.trim() ? gestoresNaEquipe(equipeId.trim(), allGestores, equipeGestorLinks) : []),
    [equipeId, allGestores, equipeGestorLinks],
  );

  useEffect(() => {
    setEquipeId(perfil.equipe_id ?? "");
    setRole(perfil.role);
  }, [perfil.usuario_id, perfil.equipe_id, perfil.role]);

  useEffect(() => {
    setGSel(carteiraGestorIds);
  }, [perfil.usuario_id, carteiraGestorIds.join(",")]);

  const showCarteira = role === "cliente_gestao" || perfil.role === "cliente_gestao";

  return (
    <tr className="border-t border-nubank-border align-top">
      <td className="px-3 py-3 font-medium text-nubank-text">{perfil.nome_completo ?? "—"}</td>
      <td className="px-3 py-3">
        <select
          className="w-full min-w-[130px] rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          value={role}
          onChange={(e) => setRole(e.target.value as Perfil["role"])}
        >
          <option value="cliente">cliente</option>
          <option value="cliente_gestao">cliente_gestao</option>
        </select>
      </td>
      <td className="px-3 py-3">
        <select
          className="w-full min-w-[160px] rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          value={equipeId}
          onChange={(e) => setEquipeId(e.target.value)}
        >
          <option value="">Sem equipa (B2C)</option>
          {allEquipes.map((eq) => (
            <option key={eq.id} value={eq.id}>
              {eq.nome}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-3">
        {showCarteira ? (
          <div className="flex max-w-xs flex-col gap-2">
            <select
              multiple
              className="min-h-[72px] w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
              value={gSel}
              onChange={(e) => setGSel(Array.from(e.target.selectedOptions, (o) => o.value))}
              aria-label="Gestores da carteira"
            >
              {gestoresDisponiveis.map((g) => (
                <option key={g.usuario_id} value={g.usuario_id}>
                  {g.nome_completo ?? g.usuario_id}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              disabled={cartBusy}
              onClick={async () => {
                setCartBusy(true);
                try {
                  await setGestoresForClient({ clienteId: perfil.usuario_id, gestorIds: gSel });
                  await onDone();
                } catch (e) {
                  alert(formatSupabaseError(e));
                } finally {
                  setCartBusy(false);
                }
              }}
            >
              {cartBusy ? "…" : "Guardar gestores"}
            </Button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || !equipeId || sameSelection(perfil, role, equipeId)}
          onClick={async () => {
            setBusy(true);
            try {
              if (role === "cliente_gestao" && perfil.role === "cliente") {
                await moveClientToEquipe({ clienteId: perfil.usuario_id, equipeId });
              } else {
                await updateUser({
                  usuario_id: perfil.usuario_id,
                  nome_completo: perfil.nome_completo ?? "Cliente",
                  role,
                  equipe_id: equipeId.trim() || null,
                  previousRole: perfil.role,
                });
              }
              await onDone();
            } catch (e) {
              alert(formatSupabaseError(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "…" : "Aplicar perfil"}
        </Button>
      </td>
    </tr>
  );
}
