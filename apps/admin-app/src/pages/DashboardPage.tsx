import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { HierarchyExplainer } from "@/components/admin/HierarchyExplainer";
import { ClienteChurnPanel } from "@/components/dashboard/ClienteChurnPanel";
import { FinanceiroPanel } from "@/components/dashboard/FinanceiroPanel";
import { useAdminEquipe } from "@/context/AdminEquipeContext";
import { useAccessScope } from "@/hooks/useAccessScope";
import { formatSupabaseError } from "@/lib/adminApi";
import { supabase } from "@/lib/supabase";
import { fetchDashboardKpisEscopo } from "@/services/adminDashboardScoped";
import { listSubscriptionsAdmin } from "@/services/subscriptionsAdmin";

export default function DashboardPage() {
  const location = useLocation();
  const { scope } = useAccessScope();
  const { selectedEquipeId, equipeIdsFiltro, equipes } = useAdminEquipe();
  const [kpis, setKpis] = useState<{
    escopo: Awaited<ReturnType<typeof fetchDashboardKpisEscopo>> | null;
    globais: { perfis: number; equipes: number } | null;
    subs: { active: number; expired: number; available: boolean } | null;
  }>({ escopo: null, globais: null, subs: null });
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const equipeNome = selectedEquipeId ? equipes.find((e) => e.id === selectedEquipeId)?.nome : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const [p, e, subRes] = await Promise.all([
          supabase.from("perfis").select("usuario_id", { count: "exact", head: true }),
          supabase.from("equipes").select("id", { count: "exact", head: true }),
          listSubscriptionsAdmin().catch(() => ({ rows: [], available: false as const })),
        ]);
        if (cancelled) return;
        if (p.error) throw p.error;
        if (e.error) throw e.error;
        const escopo = await fetchDashboardKpisEscopo(equipeIdsFiltro);
        if (cancelled) return;
        const active = subRes.rows.filter((r) => r.isActive).length;
        const expired = subRes.rows.filter((r) => r.isExpired).length;
        setKpis({
          escopo,
          globais: { perfis: p.count ?? 0, equipes: e.count ?? 0 },
          subs: { active, expired, available: subRes.available },
        });
      } catch (e) {
        if (!cancelled) setErr(formatSupabaseError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [equipeIdsFiltro.join(",")]);

  useEffect(() => {
    const id = location.hash.replace(/^#/, "");
    if (!id) return;
    const t = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => window.clearTimeout(t);
  }, [location.hash]);

  const showGlobal = scope?.kind === "global_admin";

  const cards = [
    { label: "Utilizadores (equipe)", value: kpis.escopo?.total_users ?? null, hint: "perfis com equipe_id = equipe selecionada" },
    { label: "Clientes (equipe)", value: kpis.escopo?.total_clientes ?? null, hint: "roles cliente + cliente_gestao" },
    { label: "Gestores (equipe)", value: kpis.escopo?.total_gestores ?? null, hint: "role gestor" },
    { label: "Equipe no filtro", value: kpis.escopo?.total_equipes_no_escopo ?? null, hint: "1 se houver equipe selecionada" },
    ...(showGlobal
      ? [
          { label: "Utilizadores (global)", value: kpis.globais?.perfis ?? null, hint: "toda a base" },
          { label: "Equipes (global)", value: kpis.globais?.equipes ?? null, hint: "toda a base" },
        ]
      : []),
    ...(kpis.subs?.available
      ? [
          { label: "Assinaturas ativas", value: kpis.subs.active, hint: "global (tabela subscriptions)" },
          { label: "Assinaturas expiradas", value: kpis.subs.expired, hint: "global (tabela subscriptions)" },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <HierarchyExplainer equipeNome={equipeNome} />
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-nubank-text">Dashboard</h1>
        <p className="mt-1 text-sm text-nubank-text-secondary">
          Filtro de equipe:{" "}
          {selectedEquipeId ? (
            <>
              <span className="font-medium text-nubank-text">{equipeNome ?? "Equipe"}</span>
              <span className="ml-1 font-mono text-xs text-muted-foreground">({selectedEquipeId})</span>
            </>
          ) : (
            <span className="text-muted-foreground">nenhuma — métricas por equipe ficam em zero</span>
          )}
        </p>
      </div>
      {err ? <p className="text-sm text-destructive">{err}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-5 w-40" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-10 w-24" />
                </CardContent>
              </Card>
            ))
          : cards.map((c) => (
              <Card key={c.label}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold text-nubank-text">{c.label}</CardTitle>
                  <p className="text-xs text-muted-foreground">{c.hint}</p>
                </CardHeader>
                <CardContent>
                  <p className="font-display text-3xl font-bold tracking-tight text-primary">
                    {c.value != null ? c.value : "—"}
                  </p>
                </CardContent>
              </Card>
            ))}
      </div>
      {!loading && !err && kpis.escopo && selectedEquipeId && kpis.escopo.total_users === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum dado encontrado neste grupo.</p>
      ) : null}

      <ClienteChurnPanel />

      <div id="dashboard-financeiro" className="scroll-mt-4">
        <FinanceiroPanel />
      </div>
    </div>
  );
}
