import { apiFetch, hasApiUrl } from "./api";

export type AuthSession = {
  user: { id: string; email?: string } | null;
  session: { access_token: string; refresh_token?: string } | null;
};

export async function loginWithPassword(
  email: string,
  password: string
): Promise<AuthSession> {
  if (!hasApiUrl()) {
    throw new Error("API_URL não configurado. Use o Supabase diretamente.");
  }
  return apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function signupWithPassword(
  email: string,
  password: string
): Promise<AuthSession> {
  if (!hasApiUrl()) {
    throw new Error("API_URL não configurado.");
  }
  return apiFetch("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function sendMagicLink(
  email: string,
  redirectTo?: string
): Promise<{ ok: boolean }> {
  if (!hasApiUrl()) {
    throw new Error("API_URL não configurado.");
  }
  return apiFetch("/api/auth/magic-link", {
    method: "POST",
    body: JSON.stringify({ email, redirectTo }),
  });
}

export async function getSession(token: string): Promise<AuthSession> {
  if (!hasApiUrl()) {
    throw new Error("API_URL não configurado.");
  }
  return apiFetch("/api/auth/session", { token });
}

export async function getUser(token: string): Promise<{ user: { id: string } | null }> {
  if (!hasApiUrl()) {
    throw new Error("API_URL não configurado.");
  }
  return apiFetch("/api/auth/user", { token });
}
