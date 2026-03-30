import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { AdminTableToolbar } from "@/components/admin/AdminTableToolbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccessScope } from "@/hooks/useAccessScope";
import { canManageEquipesGlobally } from "@/lib/accessScope";
import { createEquipe, formatSupabaseError, listEquipes, type Equipe } from "@/lib/adminApi";

export default function EquipesPage() {
  const { scope } = useAccessScope();
  const allowGlobalEquipes = canManageEquipesGlobally(scope);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [pending, setPending] = useState(false);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const flat = await listEquipes();
      setEquipes(flat);
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
  }, [allowGlobalEquipes]);

  const equipesVisiveis = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return equipes;
    return equipes.filter((e) => e.nome.toLowerCase().includes(q));
  }, [equipes, search]);

  if (!allowGlobalEquipes) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Equipes</CardTitle>
          <CardDescription>
            A gestão global de equipes (criar / renomear toda a árvore) está reservada ao <strong>administrador global</strong>.
            O seu perfil trabalha apenas dentro da Gestão à qual está associado.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Equipes</CardTitle>
          <CardDescription>
            Crie grupos de gestão e clique em um grupo para abrir a página específica de alterações.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="rounded-[14px] border border-nubank-border bg-gradient-primary-subtle/40 p-4">
            <div className="mb-3 text-sm font-semibold text-nubank-text">Nova equipe</div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[200px] flex-1 space-y-1">
                <Label htmlFor="eq-nome">Nome</Label>
                <Input id="eq-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da equipe" />
              </div>
              <Button
                type="button"
                disabled={pending || nome.trim().length < 2}
                onClick={async () => {
                  setPending(true);
                  setError(null);
                  try {
                    await createEquipe({ nome: nome.trim() });
                    setNome("");
                    await load();
                  } catch (e) {
                    setError(formatSupabaseError(e));
                  } finally {
                    setPending(false);
                  }
                }}
              >
                Criar
              </Button>
            </div>
          </div>

          <AdminTableToolbar value={search} onChange={setSearch} placeholder="Pesquisar equipe…" />

          {!loading && equipesVisiveis.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum dado encontrado.</p>
          ) : null}

          <div className="overflow-x-auto rounded-[14px] border border-nubank-border bg-white">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-nubank-border text-left text-xs font-medium uppercase tracking-wide text-nubank-text-secondary">
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-t border-nubank-border">
                        <td className="px-4 py-3" colSpan={2}>
                          <Skeleton className="h-9 w-full" />
                        </td>
                      </tr>
                    ))
                  : equipesVisiveis.map((eq) => (
                      <tr key={eq.id} className="border-t border-nubank-border">
                        <td className="px-4 py-3 font-medium text-nubank-text">{eq.nome}</td>
                        <td className="px-4 py-3">
                          <Button asChild type="button" variant="outline" size="sm">
                            <Link to={`/equipes/${encodeURIComponent(eq.id)}`}>Abrir gestão do grupo</Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
