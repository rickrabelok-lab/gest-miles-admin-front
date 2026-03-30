import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";

type Props = {
  children: JSX.Element;
};

const PASSWORD_CHANGE_PATH = "/trocar-senha-obrigatorio";
const ASSINATURA_SUSPENSA_PATH = "/assinatura-suspensa";

const RequireAuth = ({ children }: Props) => {
  const {
    user,
    loading,
    mustChangePassword,
    roleLoading,
    subscriptionBlocked,
    subscriptionGateLoading,
  } = useAuth();
  const location = useLocation();

  if (loading || (user && roleLoading) || (user && subscriptionGateLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Carregando sessão...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }

  if (mustChangePassword && location.pathname !== PASSWORD_CHANGE_PATH) {
    return <Navigate to={PASSWORD_CHANGE_PATH} replace />;
  }

  if (subscriptionBlocked && location.pathname !== ASSINATURA_SUSPENSA_PATH) {
    return <Navigate to={ASSINATURA_SUSPENSA_PATH} replace />;
  }

  return children;
};

export default RequireAuth;
