import { isAdminMasterRole } from "@/lib/accessScope";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAdminAuth } from "@/context/AdminAuthContext";
import {
  fetchPesquisaPassagensConfig,
  savePesquisaPassagensConfig,
  type PesquisaPassagensConfigAdmin,
  type PesquisaPassagensPlanLimitEntry,
} from "@/services/adminPesquisaPassagens";

function splitCsv(s: string): string[] | null {
  const parts = s
    .split(/[,;\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  return parts.length ? parts : null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function splitUuidCsv(s: string): string[] | null {
  const raw = splitCsv(s);
  if (!raw) return null;
  const ok = raw.filter((x) => UUID_RE.test(x));
  return ok.length ? ok : null;
}

function parseOptionalInt(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function parsePlanLimitsJson(s: string): Record<string, PesquisaPassagensPlanLimitEntry> | null {
  const t = s.trim();
  if (!t) return null;
  try {
    const v = JSON.parse(t) as unknown;
    if (v == null || typeof v !== "object" || Array.isArray(v)) return null;
    const out: Record<string, PesquisaPassagensPlanLimitEntry> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const key = k.trim().toLowerCase();
      if (!key) continue;
      if (val != null && typeof val === "object" && !Array.isArray(val)) {
        out[key] = val as PesquisaPassagensPlanLimitEntry;
      }
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

function parseImagesJson(s: string): Record<string, string> | null {
  const t = s.trim();
  if (!t) return {};
  try {
    const v = JSON.parse(t) as unknown;
    if (v == null || typeof v !== "object" || Array.isArray(v)) return null;
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const key = k.trim();
      if (!key) continue;
      if (typeof val !== "string") return null;
      const url = val.trim();
      if (url) out[key] = url;
    }
    return out;
  } catch {
    return null;
  }
}

function defaultsFromRow(row: PesquisaPassagensConfigAdmin | null): {
  featureEnabled: boolean;
  allowedRoles: string;
  allowedEquipeIds: string;
  deniedUsuarioIds: string;
  allowedPlanSlugs: string;
  maxUser: string;
  maxEquipe: string;
  tokensPerSearch: string;
  monthlyTokensUser: string;
  monthlyTokensEquipe: string;
  planLimitsJson: string;
  destinationImagesJson: string;
  brandAssetsJson: string;
  airlineLogosJson: string;
} {
  if (!row) {
    return {
      featureEnabled: true,
      allowedRoles: "",
      allowedEquipeIds: "",
      deniedUsuarioIds: "",
      allowedPlanSlugs: "",
      maxUser: "",
      maxEquipe: "",
      tokensPerSearch: "1",
      monthlyTokensUser: "",
      monthlyTokensEquipe: "",
      planLimitsJson: "{}\n",
      destinationImagesJson: "{}\n",
      brandAssetsJson: "{}\n",
      airlineLogosJson: "{}\n",
    };
  }
  return {
    featureEnabled: row.feature_enabled,
    allowedRoles: row.allowed_roles?.join(", ") ?? "",
    allowedEquipeIds: row.allowed_equipe_ids?.join(", ") ?? "",
    deniedUsuarioIds: row.denied_usuario_ids?.join(", ") ?? "",
    allowedPlanSlugs: row.allowed_plan_slugs?.join(", ") ?? "",
    maxUser: row.max_searches_user_per_day != null ? String(row.max_searches_user_per_day) : "",
    maxEquipe: row.max_searches_equipe_per_day != null ? String(row.max_searches_equipe_per_day) : "",
    tokensPerSearch: String(row.tokens_per_search ?? 1),
    monthlyTokensUser: row.monthly_token_allowance_user != null ? String(row.monthly_token_allowance_user) : "",
    monthlyTokensEquipe: row.monthly_token_allowance_equipe != null ? String(row.monthly_token_allowance_equipe) : "",
    planLimitsJson: row.plan_limits ? `${JSON.stringify(row.plan_limits, null, 2)}\n` : "{}\n",
    destinationImagesJson: Object.keys(row.destination_images).length
      ? `${JSON.stringify(row.destination_images, null, 2)}\n`
      : "{}\n",
    brandAssetsJson: Object.keys(row.brand_assets).length ? `${JSON.stringify(row.brand_assets, null, 2)}\n` : "{}\n",
    airlineLogosJson: Object.keys(row.airline_logos).length ? `${JSON.stringify(row.airline_logos, null, 2)}\n` : "{}\n",
  };
}

export default function AdminPesquisaPassagensPage() {
  const { user, role, roleLoading } = useAdminAuth();
  const master = useMemo(() => isAdminMasterRole(role), [role]);

  const [loadPending, setLoadPending] = useState(true);
  const [savePending, setSavePending] = useState(false);
  const [featureEnabled, setFeatureEnabled] = useState(true);
  const [allowedRoles, setAllowedRoles] = useState("");
  const [allowedEquipeIds, setAllowedEquipeIds] = useState("");
  const [deniedUsuarioIds, setDeniedUsuarioIds] = useState("");
  const [allowedPlanSlugs, setAllowedPlanSlugs] = useState("");
  const [maxUser, setMaxUser] = useState("");
  const [maxEquipe, setMaxEquipe] = useState("");
  const [tokensPerSearch, setTokensPerSearch] = useState("1");
  const [monthlyTokensUser, setMonthlyTokensUser] = useState("");
  const [monthlyTokensEquipe, setMonthlyTokensEquipe] = useState("");
  const [planLimitsJson, setPlanLimitsJson] = useState("{}\n");
  const [destinationImagesJson, setDestinationImagesJson] = useState("{}\n");
  const [brandAssetsJson, setBrandAssetsJson] = useState("{}\n");
  const [airlineLogosJson, setAirlineLogosJson] = useState("{}\n");

  const load = useCallback(async () => {
    if (!master) return;
    setLoadPending(true);
    const { data, error } = await fetchPesquisaPassagensConfig();
    if (error) {
      toast.error(error);
      setLoadPending(false);
      return;
    }
    const d = defaultsFromRow(data);
    setFeatureEnabled(d.featureEnabled);
    setAllowedRoles(d.allowedRoles);
    setAllowedEquipeIds(d.allowedEquipeIds);
    setDeniedUsuarioIds(d.deniedUsuarioIds);
    setAllowedPlanSlugs(d.allowedPlanSlugs);
    setMaxUser(d.maxUser);
    setMaxEquipe(d.maxEquipe);
    setTokensPerSearch(d.tokensPerSearch);
    setMonthlyTokensUser(d.monthlyTokensUser);
    setMonthlyTokensEquipe(d.monthlyTokensEquipe);
    setPlanLimitsJson(d.planLimitsJson);
    setDestinationImagesJson(d.destinationImagesJson);
    setBrandAssetsJson(d.brandAssetsJson);
    setAirlineLogosJson(d.airlineLogosJson);
    setLoadPending(false);
  }, [master]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    const parsedPlans = parsePlanLimitsJson(planLimitsJson);
    if (parsedPlans === null && planLimitsJson.trim() && planLimitsJson.trim() !== "{}") {
      toast.error("JSON de limites por plano inválido.");
      return;
    }
    const parsedImgs = parseImagesJson(destinationImagesJson);
    if (parsedImgs === null) {
      toast.error("JSON de imagens inválido.");
      return;
    }
    const parsedBrand = parseImagesJson(brandAssetsJson);
    if (parsedBrand === null) {
      toast.error("JSON de brand_assets inválido.");
      return;
    }
    const parsedAirline = parseImagesJson(airlineLogosJson);
    if (parsedAirline === null) {
      toast.error("JSON de airline_logos inválido.");
      return;
    }
    const tps = Math.max(1, Math.floor(Number(tokensPerSearch)) || 1);
    setSavePending(true);
    const { error } = await savePesquisaPassagensConfig({
      feature_enabled: featureEnabled,
      allowed_roles: splitCsv(allowedRoles),
      allowed_equipe_ids: splitUuidCsv(allowedEquipeIds),
      denied_usuario_ids: splitUuidCsv(deniedUsuarioIds),
      allowed_plan_slugs: splitCsv(allowedPlanSlugs)?.map((x) => x.trim().toLowerCase()) ?? null,
      max_searches_user_per_day: parseOptionalInt(maxUser),
      max_searches_equipe_per_day: parseOptionalInt(maxEquipe),
      destination_images: parsedImgs,
      brand_assets: parsedBrand,
      airline_logos: parsedAirline,
      tokens_per_search: tps,
      monthly_token_allowance_user: parseOptionalInt(monthlyTokensUser),
      monthly_token_allowance_equipe: parseOptionalInt(monthlyTokensEquipe),
      plan_limits: parsedPlans,
      updated_by: user?.id ?? null,
    });
    setSavePending(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Configuração guardada. Passa a aplicar-se no app Gestor Miles.");
    void load();
  };

  if (roleLoading) {
    return (
      <div className="p-6 text-sm text-slate-500" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
        A carregar…
      </div>
    );
  }

  if (!master) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="p-6" style={{ fontFamily: "Inter, system-ui, sans-serif", maxWidth: 920, margin: "0 auto" }}>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Pesquisa de passagens (Gestor)</h1>
        <p className="mt-1 text-sm text-slate-600">
          Controla quem vê e quanto pode usar a pesquisa no <strong>Gestor Miles</strong>. Apenas utilizadores com{" "}
          <code className="rounded bg-slate-100 px-1 text-xs">admin_master</code> em <code className="rounded bg-slate-100 px-1 text-xs">perfis</code>{" "}
          alteram esta configuração (RLS).
        </p>
      </div>

      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Funcionalidade</CardTitle>
            <CardDescription>Desligado: o atalho e o ecrã somem para todos (exceto admin_master no Gestor).</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <Label htmlFor="pp-feature">Pesquisa de passagens ativa</Label>
            <Switch id="pp-feature" checked={featureEnabled} onCheckedChange={setFeatureEnabled} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Acesso</CardTitle>
            <CardDescription>
              Campos vazios = sem filtro nessa dimensão. Roles = valor bruto de <code className="text-xs">perfis.role</code> (ex.{" "}
              <code className="text-xs">cs</code>, <code className="text-xs">gestor</code>).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="pp-roles">Roles permitidas (CSV)</Label>
              <Input id="pp-roles" value={allowedRoles} onChange={(e) => setAllowedRoles(e.target.value)} placeholder="vazio = todas" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pp-equipes">IDs de equipas permitidas (UUID, CSV)</Label>
              <Input id="pp-equipes" value={allowedEquipeIds} onChange={(e) => setAllowedEquipeIds(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pp-denied">Utilizadores bloqueados (UUID, CSV)</Label>
              <Input id="pp-denied" value={deniedUsuarioIds} onChange={(e) => setDeniedUsuarioIds(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pp-plans">Slugs de plano permitidos (CSV)</Label>
              <Input
                id="pp-plans"
                value={allowedPlanSlugs}
                onChange={(e) => setAllowedPlanSlugs(e.target.value)}
                placeholder="comparado com assinatura ativa (RPC no Supabase)"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Limites diários (número de pesquisas)</CardTitle>
            <CardDescription>Contagem por dia civil (fuso local ao registar uso no Gestor). Vazio = sem limite.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pp-max-u">Máx. pesquisas / utilizador / dia</Label>
              <Input id="pp-max-u" inputMode="numeric" value={maxUser} onChange={(e) => setMaxUser(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pp-max-e">Máx. pesquisas / equipa / dia</Label>
              <Input id="pp-max-e" inputMode="numeric" value={maxEquipe} onChange={(e) => setMaxEquipe(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tokens mensais</CardTitle>
            <CardDescription>
              Cada clique em «Pesquisar» no Gestor consome <strong>tokens_per_search</strong> do mês civil (YYYY-MM). Vazio = sem teto de tokens.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="pp-tps">Tokens por pesquisa (mín. 1)</Label>
              <Input id="pp-tps" inputMode="numeric" value={tokensPerSearch} onChange={(e) => setTokensPerSearch(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pp-tok-u">Teto mensal de tokens / utilizador</Label>
              <Input id="pp-tok-u" inputMode="numeric" value={monthlyTokensUser} onChange={(e) => setMonthlyTokensUser(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pp-tok-e">Teto mensal de tokens / equipa</Label>
              <Input id="pp-tok-e" inputMode="numeric" value={monthlyTokensEquipe} onChange={(e) => setMonthlyTokensEquipe(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Limites por plano (opcional)</CardTitle>
            <CardDescription>
              Chave = slug do plano em minúsculas (ex. <code className="text-xs">pro</code>). Sobrepõe os limites globais desse utilizador quando o
              plano ativo coincide.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="mb-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
{`{
  "pro": {
    "max_searches_per_day": 40,
    "max_searches_equipe_per_day": 400,
    "monthly_token_allowance": 500,
    "monthly_token_allowance_equipe": 5000
  }
}`}
            </pre>
            <textarea
              className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[200px] w-full rounded-md border px-3 py-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              value={planLimitsJson}
              onChange={(e) => setPlanLimitsJson(e.target.value)}
              spellCheck={false}
              aria-label="plan_limits JSON"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Imagens dos cards (Gestor)</CardTitle>
            <CardDescription>Objeto JSON: slug do destino → URL da imagem (ver mocks do Gestor).</CardDescription>
          </CardHeader>
          <CardContent>
            <textarea
              className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[160px] w-full rounded-md border px-3 py-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              value={destinationImagesJson}
              onChange={(e) => setDestinationImagesJson(e.target.value)}
              spellCheck={false}
              aria-label="destination_images JSON"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Branding (JSON avançado)</CardTitle>
            <CardDescription>
              Preferível usar a página <strong>Marca e imagens</strong> no menu para upload. Aqui pode editar o JSON
              bruto: <code className="text-xs">brand_assets</code> (ex. <code className="text-xs">rail_logo</code>,{" "}
              <code className="text-xs">rail_wordmark</code>) e <code className="text-xs">airline_logos</code> (ex.{" "}
              <code className="text-xs">smiles</code>, <code className="text-xs">latam</code>).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="pp-brand">brand_assets</Label>
              <textarea
                id="pp-brand"
                className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[120px] w-full rounded-md border px-3 py-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                value={brandAssetsJson}
                onChange={(e) => setBrandAssetsJson(e.target.value)}
                spellCheck={false}
                aria-label="brand_assets JSON"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pp-airline">airline_logos</Label>
              <textarea
                id="pp-airline"
                className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[120px] w-full rounded-md border px-3 py-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                value={airlineLogosJson}
                onChange={(e) => setAirlineLogosJson(e.target.value)}
                spellCheck={false}
                aria-label="airline_logos JSON"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={() => void handleSave()} disabled={savePending || loadPending}>
            {savePending ? "A guardar…" : "Guardar"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => void load()} disabled={loadPending}>
            Recarregar
          </Button>
        </div>
      </div>
    </div>
  );
}
