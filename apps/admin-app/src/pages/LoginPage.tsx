import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAppConfig } from "@gest-miles/shared";
import { useAdminAuth } from "@/context/AdminAuthContext";
import {
  ADMIN_SECURITY_SESSION_START_KEY,
  adminSecurityClientMeta,
  adminSecurityIsEmailLocked,
  adminSecurityOnFailedLogin,
  adminSecurityOnLoginSuccess,
} from "@/lib/adminApi";

export default function LoginPage() {
  const { getString } = useAppConfig();
  const appNome = getString("sistema.app_nome", "Gest Miles");
  const { user, loading, role, roleLoading, signIn, signOut } = useAdminAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!loading && user && !roleLoading && role === "admin") {
    return <Navigate to={from} replace />;
  }

  if (!loading && user && !roleLoading && role !== "admin") {
    return (
      <div className="min-h-screen bg-[var(--fintech-bg)] p-6 flex items-center justify-center">
        <Card className="w-full max-w-[460px]">
          <CardHeader>
            <CardTitle>Acesso não autorizado</CardTitle>
            <CardDescription>
              Este painel é exclusivo para utilizadores com <strong>role admin</strong>. O seu perfil atual:{" "}
              <strong>{role ?? "—"}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              onClick={() => {
                void signOut();
              }}
            >
              Terminar sessão
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--fintech-bg)] p-6 flex items-center justify-center">
      <Card className="w-full max-w-[420px]">
        <CardHeader>
          <CardTitle>Admin — {appNome}</CardTitle>
          <CardDescription>Entre com a conta que tem role admin.</CardDescription>
        </CardHeader>
        <CardContent>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setPending(true);
            const meta = adminSecurityClientMeta();
            let recordFailure = false;
            try {
              const lock = await adminSecurityIsEmailLocked(email);
              if (lock.locked && lock.until) {
                const human = new Date(lock.until).toLocaleString("pt-BR");
                throw new Error(`Conta temporariamente bloqueada após várias tentativas falhadas. Tente novamente após ${human}.`);
              }
              if (lock.locked) {
                throw new Error("Conta temporariamente bloqueada. Tente mais tarde.");
              }
              recordFailure = true;
              await signIn(email, password);
              recordFailure = false;
              try {
                await adminSecurityOnLoginSuccess({
                  ip: meta.ip,
                  device: meta.device,
                  userAgent: meta.userAgent,
                });
              } catch {
                /* módulo SQL opcional */
              }
              if (typeof window !== "undefined") {
                window.sessionStorage.setItem(ADMIN_SECURITY_SESSION_START_KEY, new Date().toISOString());
              }
            } catch (err) {
              if (recordFailure) {
                try {
                  const r = await adminSecurityOnFailedLogin({
                    email,
                    ip: meta.ip,
                    device: meta.device,
                    userAgent: meta.userAgent,
                  });
                  if (r.nowLocked && r.lockedUntil) {
                    const human = new Date(r.lockedUntil).toLocaleString("pt-BR");
                    setError(`Muitas tentativas falhadas. Conta bloqueada até ${human}.`);
                  } else {
                    setError(err instanceof Error ? err.message : "Falha no login");
                  }
                } catch {
                  setError(err instanceof Error ? err.message : "Falha no login");
                }
              } else {
                setError(err instanceof Error ? err.message : "Falha no login");
              }
            } finally {
              setPending(false);
            }
          }}
        >
          <label className="text-sm font-medium">Email</label>
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <label className="text-sm font-medium">Senha</label>
          <Input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button
            type="submit"
            disabled={pending}
            className="w-full"
          >
            {pending ? "A entrar…" : "Entrar"}
          </Button>
        </form>
        </CardContent>
      </Card>
    </div>
  );
}
