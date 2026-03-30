import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccessScope } from "@/hooks/useAccessScope";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { canAccessSecurityDashboard } from "@/lib/accessScope";
import {
  deleteAdminEmailLockout,
  formatSupabaseError,
  getAdminSecuritySettings,
  listAdminEmailLockouts,
  listAdminFailedLogins,
  listAdminLoginHistory,
  listAdminSessionActivityRecent,
  adminSecurityForceSignoutUser,
  updateAdminSecuritySettings,
  type AdminEmailLockoutRow,
  type AdminFailedLoginRow,
  type AdminLoginHistoryRow,
  type AdminSecuritySettingsRow,
  type AdminSessionActivityRow,
} from "@/lib/adminApi";

export default function AdminSegurancaPage() {
  const { scope } = useAccessScope();
  const { user, signOut } = useAdminAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AdminLoginHistoryRow[]>([]);
  const [failed, setFailed] = useState<AdminFailedLoginRow[]>([]);
  const [sessions, setSessions] = useState<AdminSessionActivityRow[]>([]);
  const [lockouts, setLockouts] = useState<AdminEmailLockoutRow[]>([]);
  const [settings, setSettings] = useState<AdminSecuritySettingsRow | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [form, setForm] = useState({ max_failed: "5", lockout_min: "15", window_min: "15" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [h, f, s, l, st] = await Promise.all([
        listAdminLoginHistory(300),
        listAdminFailedLogins(300),
        listAdminSessionActivityRecent(45),
        listAdminEmailLockouts(),
        getAdminSecuritySettings(),
      ]);
      setHistory(h);
      setFailed(f);
      setSessions(s);
      setLockouts(l);
      setSettings(st);
      if (st) {
        setForm({
          max_failed: String(st.max_failed_attempts),
          lockout_min: String(st.lockout_minutes),
          window_min: String(st.failure_window_minutes),
        });
      }
    } catch (e) {
      setError(formatSupabaseError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canAccessSecurityDashboard(scope)) {
    return <Navigate to="/dashboard" replace />;
  }

  const moduleMissing = !loading && !error && history.length === 0 && failed.length === 0 && settings == null && lockouts.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-nubank-text">Segurança</h1>
        <p className="mt-1 text-sm text-nubank-text-secondary">
          Controlo de acessos, histórico de login, sessões recentes e proteção contra força bruta. Execute{" "}
          <code className="text-xs">sql/seguranca_admin.sql</code> no Supabase para ativar o módulo.
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {moduleMissing ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma tabela de segurança encontrada ou ainda sem dados. Aplique o SQL e volte a carregar.
        </p>
      ) : null}

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Proteções (limite e bloqueio)</CardTitle>
            <CardDescription>
              Após N falhas no email dentro da janela (minutos), o login fica em bloqueio temporário. Ajustável por administradores globais.
            </CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            Atualizar
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && !settings ? (
            <Skeleton className="h-24 w-full" />
          ) : settings ? (
            <form
              className="grid gap-4 sm:grid-cols-3"
              onSubmit={async (e) => {
                e.preventDefault();
                setSavingSettings(true);
                setError(null);
                try {
                  await updateAdminSecuritySettings({
                    max_failed_attempts: Math.max(1, Math.min(50, Number(form.max_failed) || 5)),
                    lockout_minutes: Math.max(1, Math.min(1440, Number(form.lockout_min) || 15)),
                    failure_window_minutes: Math.max(1, Math.min(240, Number(form.window_min) || 15)),
                  });
                  await load();
                } catch (err) {
                  setError(formatSupabaseError(err));
                } finally {
                  setSavingSettings(false);
                }
              }}
            >
              <div>
                <Label htmlFor="maxf">Máx. tentativas falhadas</Label>
                <Input
                  id="maxf"
                  type="number"
                  min={1}
                  max={50}
                  value={form.max_failed}
                  onChange={(e) => setForm((p) => ({ ...p, max_failed: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="lockm">Bloqueio (minutos)</Label>
                <Input
                  id="lockm"
                  type="number"
                  min={1}
                  max={1440}
                  value={form.lockout_min}
                  onChange={(e) => setForm((p) => ({ ...p, lockout_min: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="winm">Janela de contagem (minutos)</Label>
                <Input
                  id="winm"
                  type="number"
                  min={1}
                  max={240}
                  value={form.window_min}
                  onChange={(e) => setForm((p) => ({ ...p, window_min: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-3">
                <Button type="submit" disabled={savingSettings}>
                  {savingSettings ? "A guardar…" : "Guardar proteções"}
                </Button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">Definições indisponíveis até o SQL ser aplicado.</p>
          )}

          <div>
            <h3 className="mb-2 text-sm font-medium">Bloqueios ativos</h3>
            {lockouts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum email bloqueado.</p>
            ) : (
              <ul className="space-y-2">
                {lockouts.map((lo) => (
                  <li key={lo.email_norm} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
                    <span className="font-mono">{lo.email_norm}</span>
                    <span className="text-muted-foreground">até {new Date(lo.locked_until).toLocaleString("pt-BR")}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          await deleteAdminEmailLockout(lo.email_norm);
                          await load();
                        } catch (err) {
                          setError(formatSupabaseError(err));
                        }
                      }}
                    >
                      Desbloquear
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sessões ativas (heartbeat)</CardTitle>
          <CardDescription>
            Utilizadores com atividade nos últimos 45 minutos no painel (actualização a cada ~2 min). O IP no browser costuma ficar vazio; use Edge
            Functions para IP real.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => void signOut()}>
              Encerrar a minha sessão
            </Button>
          </div>
          <div className="overflow-x-auto rounded-[14px] border border-nubank-border bg-white">
            <table className="w-full min-w-[640px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-nubank-border text-left font-medium uppercase tracking-wide text-nubank-text-secondary">
                  <th className="px-3 py-2">usuario_id</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Dispositivo</th>
                  <th className="px-3 py-2">IP</th>
                  <th className="px-3 py-2">Última atividade</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-4">
                      <Skeleton className="h-8 w-full" />
                    </td>
                  </tr>
                ) : sessions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-muted-foreground">
                      Nenhuma sessão recente registada.
                    </td>
                  </tr>
                ) : (
                  sessions.map((s) => (
                    <tr key={s.usuario_id} className="border-t border-nubank-border align-top text-nubank-text">
                      <td className="px-3 py-2 font-mono text-[11px]">{s.usuario_id}</td>
                      <td className="px-3 py-2">{s.email ?? "—"}</td>
                      <td className="px-3 py-2">{s.device ?? "—"}</td>
                      <td className="px-3 py-2">{s.ip?.trim() ? s.ip : "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{s.last_seen_at ? new Date(s.last_seen_at).toLocaleString("pt-BR") : "—"}</td>
                      <td className="px-3 py-2 text-right">
                        {s.usuario_id === user?.id ? (
                          <span className="text-muted-foreground">Você</span>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busyUserId === s.usuario_id}
                            onClick={async () => {
                              setBusyUserId(s.usuario_id);
                              setError(null);
                              try {
                                await adminSecurityForceSignoutUser(s.usuario_id);
                                await load();
                              } catch (err) {
                                setError(formatSupabaseError(err));
                              } finally {
                                setBusyUserId(null);
                              }
                            }}
                          >
                            {busyUserId === s.usuario_id ? "…" : "Encerrar sessão"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de logins</CardTitle>
          <CardDescription>Registos criados após cada login bem-sucedido neste painel (função admin_security_on_login_success).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-[14px] border border-nubank-border bg-white">
            <table className="w-full min-w-[880px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-nubank-border text-left font-medium uppercase tracking-wide text-nubank-text-secondary">
                  <th className="px-3 py-2">id</th>
                  <th className="px-3 py-2">usuario_id</th>
                  <th className="px-3 py-2">IP</th>
                  <th className="px-3 py-2">Dispositivo</th>
                  <th className="px-3 py-2">created_at</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-4">
                      <Skeleton className="h-8 w-full" />
                    </td>
                  </tr>
                ) : history.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-muted-foreground">
                      Sem histórico.
                    </td>
                  </tr>
                ) : (
                  history.map((r) => (
                    <tr key={r.id} className="border-t border-nubank-border align-top text-nubank-text">
                      <td className="px-3 py-2 font-mono text-[10px]">{r.id}</td>
                      <td className="px-3 py-2 font-mono text-[11px]">{r.usuario_id}</td>
                      <td className="px-3 py-2">{r.ip?.trim() ? r.ip : "—"}</td>
                      <td className="px-3 py-2 max-w-[200px]">
                        <span title={r.user_agent ?? ""}>{r.device?.trim() ? r.device : (r.user_agent ?? "—").slice(0, 48)}</span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.created_at ? new Date(r.created_at).toLocaleString("pt-BR") : "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tentativas de login falhadas</CardTitle>
          <CardDescription>Últimas falhas registadas (password incorreto, etc.).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-[14px] border border-nubank-border bg-white">
            <table className="w-full min-w-[720px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-nubank-border text-left font-medium uppercase tracking-wide text-nubank-text-secondary">
                  <th className="px-3 py-2">id</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">IP</th>
                  <th className="px-3 py-2">Dispositivo</th>
                  <th className="px-3 py-2">created_at</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-4">
                      <Skeleton className="h-8 w-full" />
                    </td>
                  </tr>
                ) : failed.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-muted-foreground">
                      Sem falhas registadas.
                    </td>
                  </tr>
                ) : (
                  failed.map((r) => (
                    <tr key={r.id} className="border-t border-nubank-border align-top text-nubank-text">
                      <td className="px-3 py-2 font-mono text-[10px]">{r.id}</td>
                      <td className="px-3 py-2 font-mono">{r.email_norm}</td>
                      <td className="px-3 py-2">{r.ip?.trim() ? r.ip : "—"}</td>
                      <td className="px-3 py-2 max-w-[180px] truncate" title={r.user_agent ?? ""}>
                        {r.device?.trim() ? r.device : (r.user_agent ?? "—").slice(0, 40)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.created_at ? new Date(r.created_at).toLocaleString("pt-BR") : "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
