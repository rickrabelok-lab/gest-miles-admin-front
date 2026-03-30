import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";

export default function MandatoryPasswordChangePage() {
  const { completeMandatoryPasswordChange, signOut, mustChangePassword, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!loading && !mustChangePassword) {
      navigate("/", { replace: true });
    }
  }, [loading, mustChangePassword, navigate]);

  const handleSubmit = async () => {
    setMessage(null);
    if (password.length < 6) {
      setMessage("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      setMessage("As senhas não coincidem.");
      return;
    }
    setPending(true);
    try {
      await completeMandatoryPasswordChange(password);
      navigate("/", { replace: true });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Não foi possível atualizar a senha.");
    } finally {
      setPending(false);
    }
  };

  if (loading || !mustChangePassword) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center bg-nubank-bg p-5 text-sm text-muted-foreground">
        A carregar…
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center bg-nubank-bg p-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Definir nova senha</CardTitle>
          <p className="text-sm text-muted-foreground">
            A sua conta foi criada com uma senha provisória. Por segurança, escolha uma nova senha para continuar.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Nova senha</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Confirmar senha</label>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </div>
          {message ? <p className="text-sm text-destructive">{message}</p> : null}
          <div className="flex flex-col gap-2">
            <Button type="button" disabled={pending} onClick={() => void handleSubmit()}>
              {pending ? "A guardar…" : "Guardar e continuar"}
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => void signOut()}>
              Sair
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
