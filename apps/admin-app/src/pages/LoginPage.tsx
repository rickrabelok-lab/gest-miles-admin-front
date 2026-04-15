import { useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdminAuth } from "@/context/AdminAuthContext";
import {
  ADMIN_SECURITY_SESSION_START_KEY,
  adminSecurityClientMeta,
  adminSecurityIsEmailLocked,
  adminSecurityOnFailedLogin,
  adminSecurityOnLoginSuccess,
  formatSupabaseError,
} from "@/lib/adminApi";
import { isSupabaseConfigured } from "@/lib/supabase";
import { isAdminPanelRole } from "@/lib/accessScope";
import "./login-page.css";

function loginFailureMessage(err: unknown): string {
  const m = formatSupabaseError(err).trim();
  return m || "Falha no login";
}

export default function LoginPage() {
  const { user, loading, role, roleLoading, signIn, signOut } = useAdminAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  if (!loading && user && !roleLoading && isAdminPanelRole(role)) {
    return <Navigate to={from} replace />;
  }

  if (!loading && user && !roleLoading && !isAdminPanelRole(role)) {
    return (
      <div className="min-h-screen bg-[var(--fintech-bg)] p-6 flex items-center justify-center">
        <Card className="w-full max-w-[460px]">
          <CardHeader>
            <CardTitle>Acesso não autorizado</CardTitle>
            <CardDescription>
              Este painel é exclusivo para utilizadores com <strong>role admin ou admin_master</strong>. O seu perfil
              atual:{" "}
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
    <div className="admin-login-page">
      <div className="admin-login-dots" />

      <Link to="/" className="admin-login-back-link">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9,2 4,7 9,12" />
        </svg>
        Voltar ao app
      </Link>

      <div className="admin-login-version">GestMiles v1.4.2</div>

      <div className="admin-login-card">
        <div className="admin-login-card-stripe" />

        <div className="admin-login-header">
          <div className="admin-login-brand-row">
            <div className="admin-login-logo-wrap">
              <svg className="admin-login-logo-icon" viewBox="0 0 72 72" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                <defs>
                  <linearGradient id="admin-login-lg" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#6A00A3" />
                    <stop offset="100%" stopColor="#B56CFF" />
                  </linearGradient>
                </defs>
                <rect width="72" height="72" rx="17" fill="url(#admin-login-lg)" />
                <path d="M14 58 Q36 12 58 26" stroke="rgba(255,255,255,0.38)" strokeWidth="1.8" fill="none" strokeDasharray="2.5 5.5" strokeLinecap="round" />
                <circle cx="22" cy="46" r="2.2" fill="rgba(255,255,255,0.55)" />
                <circle cx="36" cy="26" r="2.2" fill="rgba(255,255,255,0.55)" />
                <circle cx="50" cy="18" r="2.2" fill="rgba(255,255,255,0.55)" />
                <g transform="translate(55,18) rotate(42) scale(0.56)">
                  <path d="M0,-22 C2,-20 4,-12 4,-4 L26,10 L22,15 L4,6 L5,19 L12,24 L10,28 L0,25 L-10,28 L-12,24 L-5,19 L-4,6 L-22,15 L-26,10 L-4,-4 C-4,-12 -2,-20 0,-22 Z" fill="white" />
                </g>
              </svg>
              <div className="admin-login-logo-brand">
                Gest<span>Miles</span>
              </div>
            </div>
            <div className="admin-login-badge">
              <div className="admin-login-badge-dot" />
              <span className="admin-login-badge-text">⚡ Admin Master</span>
            </div>
          </div>

          <div className="admin-login-title">Acesso restrito</div>
        </div>

        <form
          className="admin-login-form"
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
                throw new Error(`Conta temporariamente bloqueada apos varias tentativas falhadas. Tente novamente apos ${human}.`);
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
                // modulo SQL opcional
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
                    setError(`Muitas tentativas falhadas. Conta bloqueada ate ${human}.`);
                  } else {
                    setError(loginFailureMessage(err));
                  }
                } catch {
                  setError(loginFailureMessage(err));
                }
              } else {
                setError(loginFailureMessage(err));
              }
            } finally {
              setPending(false);
            }
          }}
        >
          {!isSupabaseConfigured ? (
            <div className="admin-login-error">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                <circle cx="7" cy="7" r="5.5" />
                <line x1="7" y1="4.5" x2="7" y2="7" />
                <circle cx="7" cy="9.5" r=".6" fill="currentColor" />
              </svg>
              Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY em apps/admin-app/.env.local e reinicie o Vite.
            </div>
          ) : null}

          {error ? (
            <div className="admin-login-error">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                <circle cx="7" cy="7" r="5.5" />
                <line x1="7" y1="4.5" x2="7" y2="7" />
                <circle cx="7" cy="9.5" r=".6" fill="currentColor" />
              </svg>
              {error}
            </div>
          ) : null}

          <div className="admin-login-field">
            <label className="admin-login-label">E-mail</label>
            <div className="admin-login-input-wrap">
              <svg className="admin-login-input-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                <rect x="2" y="4" width="12" height="9" rx="1.5" />
                <polyline points="2,4 8,9.5 14,4" />
              </svg>
              <input
                className={`admin-login-input ${error ? "error" : ""}`}
                type="email"
                placeholder="admin@gestmiles.com.br"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="admin-login-field">
            <label className="admin-login-label">
              Senha
              <button
                type="button"
                className="admin-login-forgot"
                onClick={() => setError("Fale com um administrador para redefinir a sua senha.")}
              >
                Esqueci a senha
              </button>
            </label>
            <div className="admin-login-input-wrap">
              <svg className="admin-login-input-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                <rect x="3" y="7" width="10" height="7" rx="1.5" />
                <path d="M5 7V5a3 3 0 0 1 6 0v2" />
                <circle cx="8" cy="11" r="1" fill="currentColor" stroke="none" />
              </svg>
              <input
                className={`admin-login-input pw ${error ? "error" : ""}`}
                type={showPassword ? "text" : "password"}
                minLength={6}
                placeholder="••••••••••••"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="admin-login-toggle-pw"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                  <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5Z" />
                  <circle cx="8" cy="8" r="2" />
                </svg>
              </button>
            </div>
          </div>

          <button type="submit" className="admin-login-submit" disabled={pending}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <rect x="3" y="7" width="10" height="7" rx="1.5" />
              <path d="M5 7V5a3 3 0 0 1 6 0v2" />
            </svg>
            {pending ? "A entrar..." : "Entrar no painel admin"}
          </button>
        </form>

        <div className="admin-login-footer">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
            <rect x="2" y="5.5" width="9" height="6.5" rx="1.5" />
            <path d="M4.5 5.5V4a2 2 0 0 1 4 0v1.5" />
          </svg>
          <span>Conexão segura · Acesso registrado em log de auditoria</span>
        </div>
      </div>
    </div>
  );
}
