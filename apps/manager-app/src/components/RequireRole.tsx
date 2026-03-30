import { Navigate } from "react-router-dom";

import { useAuth, type AppRole } from "@/contexts/AuthContext";
import RequireAuth from "@/components/RequireAuth";

type Props = {
  allow: AppRole[];
  children: JSX.Element;
};

const RequireRole = ({ allow, children }: Props) => {
  const { role, roleLoading } = useAuth();

  if (roleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Validando permissões...
      </div>
    );
  }

  if (!role || !allow.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return children;
};

const ProtectedByRole = ({ allow, children }: Props) => (
  <RequireAuth>
    <RequireRole allow={allow}>{children}</RequireRole>
  </RequireAuth>
);

export default ProtectedByRole;
