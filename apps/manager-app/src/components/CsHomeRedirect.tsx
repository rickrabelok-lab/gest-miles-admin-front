import type { PropsWithChildren } from "react";
import { Navigate, useSearchParams } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";

/**
 * CS não usa a home `/` como cliente: redireciona para o painel de supervisão.
 * Com `?clientId=` mantém `/` para acompanhar a carteira do cliente (modo gestor).
 */
const CsHomeRedirect = ({ children }: PropsWithChildren) => {
  const { role, roleLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get("clientId");

  if (!roleLoading && role === "cs" && !clientId) {
    return <Navigate to="/cs" replace />;
  }

  return <>{children}</>;
};

export default CsHomeRedirect;
