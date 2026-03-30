import { useMemo } from "react";
import { Navigate, useParams } from "react-router-dom";

import DashboardHeader from "@/components/DashboardHeader";
import RequireAuth from "@/components/RequireAuth";
import ClientInsightsSection from "@/components/insights/ClientInsightsSection";
import { useAuth } from "@/contexts/AuthContext";
import { homePathForRole } from "@/lib/homeRoute";

export default function ClienteInsightsPage() {
  return (
    <RequireAuth>
      <ClienteInsightsPageInner />
    </RequireAuth>
  );
}

function ClienteInsightsPageInner() {
  const { id } = useParams();
  const { role, user, roleLoading } = useAuth();

  const isClienteIdValid = Boolean(id);

  const isAllowed = useMemo(() => {
    if (!role || !user) return false;
    if (!id) return false;

    // Segurança/permita reais dependem de RLS no Supabase.
    // Nota: isso é UX/navegação; a API deve validar novamente.
    if (role === "gestor" || role === "cs" || role === "admin") return true;
    if (role === "cliente_gestao") return user.id === id;
    return false;
  }, [id, role, user]);

  if (roleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Validando permissões...
      </div>
    );
  }

  if (!isClienteIdValid || !isAllowed) {
    return <Navigate to={homePathForRole(role ?? null)} replace />;
  }

  return (
    <div className="mx-auto min-h-screen max-w-md bg-nubank-bg pb-28">
      <DashboardHeader />
      <ClientInsightsSection enabled={true} clienteId={id ?? null} />
    </div>
  );
}

