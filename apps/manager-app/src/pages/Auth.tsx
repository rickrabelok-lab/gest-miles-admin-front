import { useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";

const Auth = () => {
  const navigate = useNavigate();
  const {
    user,
    loading,
    mustChangePassword,
    signInWithGoogle,
    signInWithMagicLink,
    signInWithPassword,
    signUpWithPassword,
  } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const isValidEmail = useMemo(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    [email],
  );

  if (!loading && user) {
    return <Navigate to={mustChangePassword ? "/trocar-senha-obrigatorio" : "/me"} replace />;
  }

  const handleMagicLink = async () => {
    if (!isValidEmail) return;
    setPending(true);
    setMessage(null);
    try {
      await signInWithMagicLink(email.trim());
      setMessage("Link mágico enviado. Verifique seu e-mail.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha no login.");
    } finally {
      setPending(false);
    }
  };

  const handleGoogle = async () => {
    setPending(true);
    setMessage(null);
    try {
      await signInWithGoogle();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha no login Google.");
      setPending(false);
    }
  };

  const handleLogin = async () => {
    if (!isValidEmail || password.length < 6) return;
    setPending(true);
    setMessage(null);
    try {
      const raw = await signInWithPassword(email.trim(), password);
      const ok =
        typeof raw === "object" && raw !== null && "ok" in raw
          ? Boolean((raw as { ok: boolean }).ok)
          : Boolean(raw);
      const needNewPassword =
        typeof raw === "object" && raw !== null && "mustChangePassword" in raw
          ? Boolean((raw as { mustChangePassword?: boolean }).mustChangePassword)
          : false;
      setMessage("Login realizado com sucesso.");
      if (ok) navigate(needNewPassword ? "/trocar-senha-obrigatorio" : "/me");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha no login.");
    } finally {
      setPending(false);
    }
  };

  const handleCreateAccount = async () => {
    if (!isValidEmail || password.length < 6) return;
    setPending(true);
    setMessage(null);
    try {
      const signedIn = await signUpWithPassword(email.trim(), password);
      if (signedIn) {
        setMessage("Conta criada com sucesso. Entrando...");
        navigate("/me");
      } else {
        setMessage(
          "Conta criada, mas o projeto ainda exige confirmação por e-mail no Supabase. Desative 'Confirm email' em Authentication > Providers > Email para entrar direto.",
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao criar conta.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center bg-nubank-bg p-5">
      <Card className="w-full max-w-sm gradient-card-subtle shadow-nubank">
        <CardHeader className="space-y-1 pb-2">
          <CardTitle className="text-2xl font-bold tracking-tight text-nubank-text">Acesso Admin</CardTitle>
          <p className="text-sm text-muted-foreground">Apenas contas administrativas.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="voce@email.com"
          />
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Senha (mínimo 6 caracteres)"
          />
          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              className="w-full"
              onClick={handleLogin}
              disabled={!isValidEmail || password.length < 6 || pending}
            >
              Entrar
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={handleCreateAccount}
              disabled={!isValidEmail || password.length < 6 || pending}
            >
              Criar conta
            </Button>
          </div>
          {password.length > 0 && password.length < 6 && (
            <p className="text-xs text-red-600">
              A senha precisa ter no mínimo 6 caracteres.
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleMagicLink}
            disabled={!isValidEmail || pending}
          >
            Entrar com Magic Link
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={handleGoogle}
            disabled={pending}
          >
            Entrar com Google
          </Button>
          {message && (
            <p className="text-xs text-muted-foreground" role="status">
              {message}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
