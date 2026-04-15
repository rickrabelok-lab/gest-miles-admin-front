import type { ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";

import { useAdminAuth } from "@/context/AdminAuthContext";
import { useAccessScope } from "@/hooks/useAccessScope";
import { hasFullPlatformRouteAccess, isAdminMasterRole, isAdminPanelRole } from "@/lib/accessScope";

const ADMIN_GERAL_ALLOWED_PREFIXES = [
  "/dashboard",
  "/insights",
  "/equipes",
  "/clients",
  "/contas",
  "/assinaturas",
  "/relatorios",
  "/monetizacao",
  "/feature-flags",
  "/suporte",
  "/onboarding",
  "/admin/backups-lgpd",
  "/operacional",
  "/logs",
] as const;

function canAdminGeralAccess(pathname: string): boolean {
  return ADMIN_GERAL_ALLOWED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Painel administrativo: `perfis.role` em { admin, admin_master, admin_geral }.
 * Outros roles autenticados vêem "Acesso não autorizado" (sem entrar nas rotas).
 */
export default function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading, role, roleLoading, subscriptionBlocked, subscriptionBlockReason, subscriptionGateLoading } =
    useAdminAuth();
  const { scope } = useAccessScope();
  const location = useLocation();

  if (loading || (user && roleLoading) || (user && isAdminPanelRole(role) && subscriptionGateLoading)) {
    return (
      <div style={{ padding: 24, fontSize: 14, color: "#64748b" }}>
        A validar sessão…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (isAdminPanelRole(role) && subscriptionBlocked && !isAdminMasterRole(role)) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          background: "var(--fintech-bg, #f7f7f8)",
        }}
      >
        <div
          style={{
            maxWidth: 480,
            width: "100%",
            borderRadius: 16,
            border: "1px solid #ececec",
            background: "#fff",
            padding: 28,
            boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
          }}
        >
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "#1f1f1f" }}>Acesso suspenso</h1>
          <p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.5, color: "#6b6b6b" }}>
            {subscriptionBlockReason ??
              "A assinatura da gestão está vencida ou inativa. O painel foi bloqueado até regularização."}
          </p>
          <p style={{ marginTop: 16, fontSize: 13, color: "#6b6b6b" }}>
            <Link to="/login" style={{ color: "#8A05BE", fontWeight: 600 }}>
              Terminar sessão
            </Link>
          </p>
        </div>
      </div>
    );
  }

  if (!isAdminPanelRole(role)) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          background: "var(--fintech-bg, #f7f7f8)",
        }}
      >
        <div
          style={{
            maxWidth: 440,
            width: "100%",
            borderRadius: 16,
            border: "1px solid #ececec",
            background: "#fff",
            padding: 28,
            boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
          }}
        >
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "#1f1f1f" }}>Acesso não autorizado</h1>
          <p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.5, color: "#6b6b6b" }}>
            O painel de administração é exclusivo para utilizadores com{" "}
            <strong style={{ color: "#1f1f1f" }}>role admin, admin_master ou admin_geral</strong> na tabela{" "}
            <code style={{ fontSize: 13 }}>perfis</code>.
          </p>
          <p style={{ marginTop: 8, fontSize: 13, color: "#6b6b6b" }}>
            O seu perfil atual:{" "}
            <strong style={{ color: "#1f1f1f" }}>{role ? String(role) : "—"}</strong>
          </p>
          <p style={{ marginTop: 16, fontSize: 13, color: "#6b6b6b" }}>
            <Link to="/login" style={{ color: "#8A05BE", fontWeight: 600 }}>
              Terminar sessão e voltar ao login
            </Link>
          </p>
        </div>
      </div>
    );
  }

  if (!hasFullPlatformRouteAccess(role, scope) && !canAdminGeralAccess(location.pathname)) {
    return <Navigate to="/dashboard" replace />;
  }

  if (
    (location.pathname === "/pesquisa-passagens" || location.pathname.startsWith("/pesquisa-passagens/")) &&
    !isAdminMasterRole(role)
  ) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
