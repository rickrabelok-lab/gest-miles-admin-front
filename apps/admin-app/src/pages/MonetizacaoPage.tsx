import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { formatBrlFromCentavos, loadPlanosCatalog, type PlanoCatalogo } from "@/services/adminPlanosCatalog";
import { listSubscriptionsAdmin } from "@/services/subscriptionsAdmin";

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

function normalizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function planoToStripeLimits(plano: PlanoCatalogo): Record<string, unknown> {
  return {
    max_clientes: plano.max_clientes,
    trial_dias: plano.trial_dias,
    funcionalidades: plano.funcionalidades,
    origem_catalogo: "planos-precos",
  };
}

function isGatewayErrorMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("502") ||
    m.includes("503") ||
    m.includes("504") ||
    m.includes("bad gateway") ||
    m.includes("service unavailable") ||
    m.includes("gateway timeout")
  );
}

/** Quando o Express Stripe não responde: mostrar o mesmo catálogo que /planos (só leitura). */
function catalogToFallbackPlanRows(catalog: PlanoCatalogo[]): PlanRow[] {
  return catalog.map((plano, i) => ({
    id: `local-preview-${plano.id}`,
    slug: normalizeSlug(plano.id || plano.nome),
    name: plano.nome,
    description: plano.descricao || null,
    stripe_product_id: "—",
    stripe_price_id_monthly: null,
    stripe_price_id_yearly: null,
    active: plano.status === "ativo",
    sort_order: i,
    limits: {
      ...planoToStripeLimits(plano),
      preview_preco_mensal_centavos: plano.preco_mensal_centavos,
      preview_only: true,
    },
  }));
}

export default function MonetizacaoPage() {
  const { session } = useAdminAuth();
  const token = session?.access_token;

  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [subs, setSubs] = useState<SubscriptionListItem[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncingCatalog, setSyncingCatalog] = useState(false);
  /** Mensagem de sucesso da sincronização (evita usar a faixa vermelha de erro). */
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  /** Stripe API acessível vs pré-visualização do catálogo local (502). */
  const [planosSource, setPlanosSource] = useState<"stripe" | "local_preview">("stripe");
  const [stripePlanosWarning, setStripePlanosWarning] = useState<string | null>(null);
  const [assinaturasSource, setAssinaturasSource] = useState<"stripe" | "supabase_fallback">("stripe");
  const [stripeAssinaturasWarning, setStripeAssinaturasWarning] = useState<string | null>(null);

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
    setStripePlanosWarning(null);
    try {
      const data = await apiFetch<{ plans: PlanRow[] }>("/api/stripe/admin/plans", { token });
      setPlans(data.plans);
      setPlanosSource("stripe");
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao carregar planos.";
      if (isGatewayErrorMessage(msg)) {
        setPlans(catalogToFallbackPlanRows(loadPlanosCatalog()));
        setPlanosSource("local_preview");
        setError(null);
        setStripePlanosWarning(
          "O backend Stripe não respondeu (gateway). A tabela abaixo é uma pré-visualização do catálogo de Planos & Preços (local). " +
            "Arranque o Express com /api/stripe/admin/* ou corrija VITE_API_PROXY_TARGET.",
        );
      } else {
        setPlans([]);
        setPlanosSource("stripe");
        setError(msg);
      }
    } finally {
      setLoadingPlans(false);
    }
  }, [token]);

  const loadSubs = useCallback(async () => {
    if (!token) return;
    setLoadingSubs(true);
    setStripeAssinaturasWarning(null);
    try {
      if (hasApiUrl()) {
        try {
          const data = await apiFetch<{ subscriptions: SubscriptionListItem[] }>(
            "/api/stripe/admin/subscriptions?limit=50",
            { token },
          );
          setSubs(data.subscriptions);
          setAssinaturasSource("stripe");
          setError(null);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Erro ao carregar assinaturas.";
          if (isGatewayErrorMessage(msg)) {
            const { rows, available } = await listSubscriptionsAdmin();
            if (!available) {
              setSubs([]);
            } else {
              setSubs(
                rows.map((r) => ({
                  id: r.id,
                  status: r.status,
                  customer: r.label,
                })),
              );
            }
            setAssinaturasSource("supabase_fallback");
            setStripeAssinaturasWarning(
              "API Stripe indisponível: lista abaixo vem da tabela subscriptions no Supabase (se existir e RLS permitir).",
            );
            setError(null);
          } else {
            throw e;
          }
        }
      } else {
        const { rows, available } = await listSubscriptionsAdmin();
        if (!available) {
          setSubs([]);
        } else {
          setSubs(
            rows.map((r) => ({
              id: r.id,
              status: r.status,
              customer: r.label,
            })),
          );
        }
        setAssinaturasSource("supabase_fallback");
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar assinaturas.");
    } finally {
      setLoadingSubs(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      setLoadingPlans(false);
      return;
    }
    if (!hasApiUrl()) {
      setPlans([]);
      setPlanosSource("stripe");
      setStripePlanosWarning(null);
      setLoadingPlans(false);
      return;
    }
    void loadPlans();
  }, [token, loadPlans]);

  const handleCreatePlan = async () => {
    if (!token || !hasApiUrl() || planosSource === "local_preview") return;
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
    if (!token || !hasApiUrl() || !editPlan) return;
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
    if (!token || !hasApiUrl() || !pricePlan) return;
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
    if (!token || !hasApiUrl()) return;
    try {
      await apiFetch(path, { method: "POST", token, body: JSON.stringify(body ?? {}) });
      await loadSubs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro na operação.");
    }
  };

  const handleSyncFromPlanosCatalog = async () => {
    if (!token || !hasApiUrl() || planosSource === "local_preview") return;
    setSyncingCatalog(true);
    setError(null);
    setSyncNotice(null);
    try {
      const catalog = loadPlanosCatalog();
      if (catalog.length === 0) {
        setError("Não há planos no catálogo local de /planos para sincronizar.");
        return;
      }

      const bySlug = new Map<string, PlanRow>();
      for (const p of plans) bySlug.set(normalizeSlug(p.slug), p);

      let created = 0;
      let updated = 0;
      let failed = 0;
      const failures: string[] = [];

      for (let i = 0; i < catalog.length; i++) {
        const plano = catalog[i]!;
        const slug = normalizeSlug(plano.id || plano.nome);
        if (!slug) continue;
        const existing = bySlug.get(slug);
        try {
          if (!existing) {
            await apiFetch("/api/stripe/admin/plans", {
              method: "POST",
              token,
              body: JSON.stringify({
                slug,
                name: plano.nome.trim(),
                description: plano.descricao?.trim() || undefined,
                monthlyAmountCents: plano.preco_mensal_centavos,
                currency: "brl",
                limits: planoToStripeLimits(plano),
              }),
            });
            created += 1;
          } else {
            await apiFetch(`/api/stripe/admin/plans/${encodeURIComponent(slug)}`, {
              method: "PATCH",
              token,
              body: JSON.stringify({
                name: plano.nome.trim(),
                description: plano.descricao?.trim() || null,
                active: plano.status === "ativo",
                limits: planoToStripeLimits(plano),
                sortOrder: i + 1,
              }),
            });
            updated += 1;
          }
        } catch (e) {
          failed += 1;
          failures.push(`${slug}: ${e instanceof Error ? e.message : "erro desconhecido"}`);
        }
      }

      await loadPlans();
      if (failed > 0) {
        const hint502 = failures.some((f) => f.includes("502") || f.includes("Bad Gateway") || f.includes("503") || f.includes("504"))
          ? " Se todos forem 502/503: o Express com Stripe não está acessível no endereço do proxy — não é falha do catálogo /planos."
          : "";
        setError(
          `Sincronização parcial. Criados: ${created}, atualizados: ${updated}, falhas: ${failed}. ` +
            failures.slice(0, 3).join(" | ") +
            hint502,
        );
      } else {
        setSyncNotice(`Sincronização concluída. Criados: ${created}, atualizados: ${updated}.`);
      }
    } finally {
      setSyncingCatalog(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Monetização Stripe</h1>
        <p className="text-sm text-muted-foreground">
          Com <code className="text-xs">VITE_API_URL</code>, o painel fala com o backend Express (Stripe). Sem essa variável,
          as assinaturas listadas abaixo vêm da tabela <code className="text-xs">subscriptions</code> no Supabase; criar planos no Stripe e acções de
          cancelar/pausar exigem o backend.
        </p>
      </div>

      {!hasApiUrl() ? (
        <Alert>
          <AlertTitle>Backend opcional</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              Para sincronizar <strong>produtos e preços</strong> directamente na API Stripe, define{" "}
              <code className="rounded bg-muted px-1 text-xs">VITE_API_URL</code> no ficheiro{" "}
              <code className="rounded bg-muted px-1 text-xs">apps/admin-app/.env.local</code> (ex.:{" "}
              <code className="rounded bg-muted px-1 text-xs">http://localhost:3000</code>) apontando para o servidor Express
              que expõe <code className="rounded bg-muted px-1 text-xs">/api/stripe/admin/*</code>.
            </p>
            <p>
              O catálogo de planos comercial do painel continua disponível em{" "}
              <Link to="/planos" className="font-semibold text-primary underline-offset-4 hover:underline">
                Planos &amp; Preços
              </Link>
              .
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      {syncNotice ? (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-100">
          {syncNotice}
          <Button variant="ghost" size="sm" className="ml-2 h-6" onClick={() => setSyncNotice(null)}>
            Fechar
          </Button>
        </div>
      ) : null}
      {stripePlanosWarning ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
          {stripePlanosWarning}
          <Button variant="ghost" size="sm" className="ml-2 h-6" onClick={() => setStripePlanosWarning(null)}>
            Fechar
          </Button>
        </div>
      ) : null}
      {stripeAssinaturasWarning ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
          {stripeAssinaturasWarning}
          <Button variant="ghost" size="sm" className="ml-2 h-6" onClick={() => setStripeAssinaturasWarning(null)}>
            Fechar
          </Button>
        </div>
      ) : null}
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
          {hasApiUrl() ? (
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => void handleSyncFromPlanosCatalog()}
                disabled={syncingCatalog || planosSource === "local_preview"}
                title={planosSource === "local_preview" ? "Sincronização requer o backend Stripe a responder." : undefined}
              >
                {syncingCatalog ? "Sincronizando..." : "Trazer de /planos"}
              </Button>
              <Button
                onClick={() => setCreateOpen(true)}
                disabled={planosSource === "local_preview"}
                title={planosSource === "local_preview" ? "Criar plano requer o backend Stripe." : undefined}
              >
                Novo plano
              </Button>
            </div>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>Planos</CardTitle>
              <CardDescription>
                {!hasApiUrl()
                  ? "Sem backend configurado, estes planos Stripe não são carregados aqui. Usa Planos & Preços para o catálogo do painel."
                  : planosSource === "local_preview"
                    ? "Pré-visualização do catálogo local (mesmo conteúdo que /planos). O backend Stripe não respondeu — não são price IDs reais."
                    : "Produtos e preços sincronizados com o Stripe."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!hasApiUrl() ? (
                <p className="text-sm text-muted-foreground">
                  Configura <code className="text-xs">VITE_API_URL</code> para listar e criar planos na API Stripe, ou gere o catálogo em{" "}
                  <Link to="/planos" className="font-medium text-primary underline-offset-4 hover:underline">
                    /planos
                  </Link>
                  .
                </p>
              ) : loadingPlans ? (
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
                        <TableCell className="max-w-[200px] text-xs text-muted-foreground">
                          {planosSource === "local_preview" &&
                          typeof p.limits.preview_preco_mensal_centavos === "number" ? (
                            <>
                              <span className="text-foreground">
                                {formatBrlFromCentavos(p.limits.preview_preco_mensal_centavos)}
                              </span>
                              <span className="block text-[10px]">(catálogo /planos)</span>
                            </>
                          ) : (
                            <>
                              <span className="truncate">
                                M: {p.stripe_price_id_monthly ?? "—"} <br />
                                A: {p.stripe_price_id_yearly ?? "—"}
                              </span>
                            </>
                          )}
                        </TableCell>
                        <TableCell className="space-x-2 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={planosSource === "local_preview"}
                            onClick={() => setEditPlan({ ...p })}
                          >
                            Editar
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={planosSource === "local_preview"}
                            onClick={() => setPricePlan(p)}
                          >
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
                <CardTitle>
                  {!hasApiUrl()
                    ? "Assinaturas (Supabase)"
                    : assinaturasSource === "stripe"
                      ? "Assinaturas Stripe"
                      : "Assinaturas (Supabase)"}
                </CardTitle>
                <CardDescription>
                  {!hasApiUrl()
                    ? "Dados da tabela subscriptions no Supabase. Acções cancelar/pausar/retomar exigem VITE_API_URL + backend Stripe."
                    : assinaturasSource === "stripe"
                      ? "Lista direta da API Stripe (ambiente da chave configurada no backend)."
                      : "Fallback: API Stripe indisponível — dados da tabela subscriptions no Supabase. Acções cancelar/pausar/retomar exigem o backend."}
                </CardDescription>
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
                          {hasApiUrl() && assinaturasSource === "stripe" ? (
                            <>
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
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
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
