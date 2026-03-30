import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";

export default function AssinaturaSuspensaPage() {
  const { subscriptionBlocked, subscriptionBlockReason, signOut, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!subscriptionBlocked) navigate("/", { replace: true });
  }, [subscriptionBlocked, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Assinatura inactiva</CardTitle>
          <CardDescription>O acesso à aplicação foi suspenso.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {subscriptionBlockReason ?? "A sua assinatura ou a da sua gestão está vencida."}
          </p>
          {user?.email ? (
            <p className="text-xs text-muted-foreground">
              Sessão: <span className="font-medium">{user.email}</span>
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void signOut().then(() => navigate("/auth", { replace: true }));
              }}
            >
              Terminar sessão
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
