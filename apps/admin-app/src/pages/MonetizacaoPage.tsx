import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { apiFetch, hasApiUrl } from "@/lib/backendApi";

type PlanRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  stripe_product_id: string;
  stripe_price_id_monthly: string | null;
  stripe_price_id_yearly: string | null;
  active: boolean;
  sort_order: number;
  limits: Record<string, unknown>;
};

type SubscriptionListItem = {
  id: string;
  status: string;
  customer?: string | { id?: string } | null;
};

export default function MonetizacaoPage() {
  const { session } = useAdminAuth();
  const token = session?.access_token;

  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [subs, setSubs] = useState<SubscriptionListItem[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newMonthly, setNewMonthly] = useState("");
  const [newYearly, setNewYearly] = useState("");
  const [newLimits, setNewLimits] = useState("{}");

  const [editPlan, setEditPlan] = useState<PlanRow | null>(null);
  const [pricePlan, setPricePlan] = useState<PlanRow | null>(null);

  const loadPlans = useCallback(async () => {
    if (!token || !hasApiUrl()) return;
    setLoadingPlans(true);
    setError(null);
    try {
      const data = await apiFetch<{ plans: PlanRow[] }>("/api/stripe/admin/plans", { token });
      setPlans(data.plans);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar planos.");
    } finally {
      setLoadingPlans(false);
    }
  }, [token]);

  const loadSubs = useCallback(async () => {
    if (!token || !hasApiUrl()) return;
    setLoadingSubs(true);
    setError(null);
    try {
      const data = await apiFetch<{ subscriptions: SubscriptionListItem[] }>(
        "/api/stripe/admin/subscriptions?limit=50",
        { token },
      );
      setSubs(data.subscriptions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar assinaturas.");
    } finally {
      setLoadingSubs(false);
    }
  }, [token]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  const handleCreatePlan = async () => {
    if (!token) return;
    const monthlyCents = Math.round(parseFloat(newMonthly.replace(",", ".")) * 100);
    if (!newSlug.trim() || !newName.trim() || !Number.isFinite(monthlyCents) || monthlyCents <= 0) {
      setError("Preencha slug, nome e valor mensal válido (ex.: 99.90).");
      return;
    }
    let yearlyCents: number | undefined;
    if (newYearly.trim()) {
      yearlyCents = Math.round(parseFloat(newYearly.replace(",", ".")) * 100);
      if (!Number.isFinite(yearlyCents) || yearlyCents <= 0) {
        setError("Valor anual inválido.");
        return;
      }
    }
    let limits: Record<string, unknown> = {};
    try {
      limits = JSON.parse(newLimits || "{}") as Record<string, unknown>;
    } catch {
      setError("Limites devem ser JSON válido.");
      return;
    }
    try {
      await apiFetch("/api/stripe/admin/plans", {
        method: "POST",
        token,
        body: JSON.stringify({
          slug: newSlug.trim().toLowerCase().replace(/\s+/g, "-"),
          name: newName.trim(),
          description: newDesc.trim() || undefined,
          monthlyAmountCents: monthlyCents,
          yearlyAmountCents: yearlyCents,
          currency: "brl",
          limits,
        }),
      });
      setCreateOpen(false);
      setNewSlug("");
      setNewName("");
      setNewDesc("");
      setNewMonthly("");
      setNewYearly("");
      setNewLimits("{}");
      await loadPlans();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar plano.");
    }
  };

  const handleSaveEdit = async () => {
    if (!token || !editPlan) return;
    try {
      await apiFetch(`/api/stripe/admin/plans/${encodeURIComponent(editPlan.slug)}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          name: editPlan.name,
          description: editPlan.description,
          active: editPlan.active,
          limits: editPlan.limits,
          sortOrder: editPlan.sort_order,
        }),
      });
      setEditPlan(null);
      await loadPlans();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao guardar.");
    }
  };

  const handleUpdatePrices = async () => {
    if (!token || !pricePlan) return;
    const m = prompt("Novo preço mensal (BRL, ex.: 99.90) — deixe vazio para não alterar:");
    const y = prompt("Novo preço anual (BRL) — deixe vazio para não alterar:");
    const body: { monthlyAmountCents?: number; yearlyAmountCents?: number } = {};
    if (m && m.trim()) {
      const c = Math.round(parseFloat(m.replace(",", ".")) * 100);
      if (Number.isFinite(c) && c > 0) body.monthlyAmountCents = c;
    }
    if (y && y.trim()) {
      const c = Math.round(parseFloat(y.replace(",", ".")) * 100);
      if (Number.isFinite(c) && c > 0) body.yearlyAmountCents = c;
    }
    if (!body.monthlyAmountCents && !body.yearlyAmountCents) {
      setPricePlan(null);
      return;
    }
    try {
      await apiFetch(`/api/stripe/admin/plans/${encodeURIComponent(pricePlan.slug)}/prices`, {
        method: "POST",
        token,
        body: JSON.stringify(body),
      });
      setPricePlan(null);
      await loadPlans();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao atualizar preços.");
    }
  };

  const subAction = async (path: string, body?: Record<string, unknown>) => {
    if (!token) return;
    try {
      await apiFetch(path, { method: "POST", token, body: JSON.stringify(body ?? {}) });
      await loadSubs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro na operação.");
    }
  };

  if (!hasApiUrl()) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <Card>
          <CardHeader>
            <CardTitle>API não configurada</CardTitle>
            <CardDescription>
              Define <code className="text-xs">VITE_API_URL</code> no <code>.env.local</code> apontando para o
              backend Express do projeto (ex.: <code>http://localhost:3000</code>).
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Monetização Stripe</h1>
        <p className="text-sm text-muted-foreground">
          Planos e assinaturas na API Stripe. Requer perfil <strong>admin</strong> e webhook configurado no backend.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
          <Button variant="ghost" size="sm" className="ml-2 h-6" onClick={() => setError(null)}>
            Fechar
          </Button>
        </div>
      )}

      <Tabs defaultValue="planos" className="w-full">
        <TabsList>
          <TabsTrigger value="planos">Planos</TabsTrigger>
          <TabsTrigger value="assinaturas" onClick={() => void loadSubs()}>
            Assinaturas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="planos" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setCreateOpen(true)}>Novo plano</Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Planos</CardTitle>
              <CardDescription>Produtos e preços sincronizados com o Stripe.</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingPlans ? (
                <p className="text-sm text-muted-foreground">A carregar…</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Slug</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Ativo</TableHead>
                      <TableHead>Price IDs</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plans.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs">{p.slug}</TableCell>
                        <TableCell>{p.name}</TableCell>
                        <TableCell>{p.active ? "Sim" : "Não"}</TableCell>
                        <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                          M: {p.stripe_price_id_monthly ?? "—"} <br />
                          A: {p.stripe_price_id_yearly ?? "—"}
                        </TableCell>
                        <TableCell className="space-x-2 text-right">
                          <Button variant="outline" size="sm" onClick={() => setEditPlan({ ...p })}>
                            Editar
                          </Button>
                          <Button variant="secondary" size="sm" onClick={() => setPricePlan(p)}>
                            Novos preços
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assinaturas">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Assinaturas Stripe</CardTitle>
                <CardDescription>Lista direta da API Stripe (ambiente da chave configurada).</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => void loadSubs()} disabled={loadingSubs}>
                Atualizar
              </Button>
            </CardHeader>
            <CardContent>
              {loadingSubs ? (
                <p className="text-sm text-muted-foreground">A carregar…</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subs.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="max-w-[120px] truncate font-mono text-xs">{s.id}</TableCell>
                        <TableCell>{s.status}</TableCell>
                        <TableCell className="max-w-[160px] truncate text-xs">
                          {typeof s.customer === "string"
                            ? s.customer
                            : s.customer && typeof s.customer === "object" && "id" in s.customer
                              ? String((s.customer as { id: string }).id)
                              : "—"}
                        </TableCell>
                        <TableCell className="space-x-1 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              subAction(`/api/stripe/admin/subscriptions/${s.id}/cancel`, {
                                cancelAtPeriodEnd: true,
                              })
                            }
                          >
                            Cancelar no fim
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => subAction(`/api/stripe/admin/subscriptions/${s.id}/pause`)}
                          >
                            Pausar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => subAction(`/api/stripe/admin/subscriptions/${s.id}/resume`)}
                          >
                            Retomar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo plano</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label htmlFor="slug">Slug (único)</Label>
              <Input id="slug" value={newSlug} onChange={(e) => setNewSlug(e.target.value)} placeholder="pro" />
            </div>
            <div>
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Plano Pro" />
            </div>
            <div>
              <Label htmlFor="desc">Descrição</Label>
              <Input id="desc" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="pm">Preço mensal (BRL)</Label>
              <Input id="pm" value={newMonthly} onChange={(e) => setNewMonthly(e.target.value)} placeholder="99.90" />
            </div>
            <div>
              <Label htmlFor="py">Preço anual (BRL, opcional)</Label>
              <Input id="py" value={newYearly} onChange={(e) => setNewYearly(e.target.value)} placeholder="999.00" />
            </div>
            <div>
              <Label htmlFor="lim">Limites (JSON)</Label>
              <Textarea
                id="lim"
                value={newLimits}
                onChange={(e) => setNewLimits(e.target.value)}
                rows={4}
                className="font-mono text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void handleCreatePlan()}>Criar no Stripe</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editPlan} onOpenChange={(o) => !o && setEditPlan(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar plano</DialogTitle>
          </DialogHeader>
          {editPlan && (
            <div className="grid gap-3 py-2">
              <div>
                <Label>Nome</Label>
                <Input value={editPlan.name} onChange={(e) => setEditPlan({ ...editPlan, name: e.target.value })} />
              </div>
              <div>
                <Label>Descrição</Label>
                <Input
                  value={editPlan.description ?? ""}
                  onChange={(e) => setEditPlan({ ...editPlan, description: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={editPlan.active} onCheckedChange={(v) => setEditPlan({ ...editPlan, active: v })} />
                <span className="text-sm">Ativo</span>
              </div>
              <div>
                <Label>Ordem</Label>
                <Input
                  type="number"
                  value={editPlan.sort_order}
                  onChange={(e) => setEditPlan({ ...editPlan, sort_order: parseInt(e.target.value, 10) || 0 })}
                />
              </div>
              <div>
                <Label>Limites (JSON)</Label>
                <Textarea
                  className="font-mono text-xs"
                  rows={5}
                  value={JSON.stringify(editPlan.limits ?? {}, null, 2)}
                  onChange={(e) => {
                    try {
                      setEditPlan({
                        ...editPlan,
                        limits: JSON.parse(e.target.value || "{}") as Record<string, unknown>,
                      });
                    } catch {
                      /* ignore */
                    }
                  }}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPlan(null)}>
              Fechar
            </Button>
            <Button onClick={() => void handleSaveEdit()}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pricePlan} onOpenChange={(o) => !o && setPricePlan(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novos preços — {pricePlan?.name}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Serão pedidos valores em BRL. O Stripe cria novos Prices e desativa os anteriores.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPricePlan(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void handleUpdatePrices()}>Continuar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
