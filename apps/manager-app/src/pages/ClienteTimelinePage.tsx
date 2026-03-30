import { useMemo } from "react";
import { Navigate, useParams } from "react-router-dom";

import DashboardHeader from "@/components/DashboardHeader";
import RequireAuth from "@/components/RequireAuth";
import ClientTimelineSection from "@/components/timeline/ClientTimelineSection";
import { useAuth } from "@/contexts/AuthContext";
import { homePathForRole } from "@/lib/homeRoute";

export default function ClienteTimelinePage() {
  return (
    <RequireAuth>
      <ClienteTimelinePageInner />
    </RequireAuth>
  );
}

function ClienteTimelinePageInner() {
  const { id } = useParams();
  const { role, user, roleLoading } = useAuth();

  const isClienteIdValid = Boolean(id);

  const isAllowed = useMemo(() => {
    if (!role || !user) return false;
    if (!id) return false;

    // Segurança/permite reais dependem de RLS no Supabase.
    // Nota: esta regra é de UX/navegação.
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
      <ClientTimelineSection enabled={true} clienteId={id ?? null} />
    </div>
  );
}

