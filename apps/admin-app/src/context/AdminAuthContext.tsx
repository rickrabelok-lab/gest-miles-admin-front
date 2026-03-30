import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import type { Session, User } from "@supabase/supabase-js";

import {
  ADMIN_SECURITY_SESSION_START_KEY,
  adminSecurityClientMeta,
  adminSecurityHasForcedSignoutSince,
  clearAdminSecuritySessionMarker,
  evaluateAdminSubscriptionBlock,
  upsertAdminSessionActivity,
} from "@/lib/adminApi";
import { supabase } from "@/lib/supabase";

type Ctx = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: string | null;
  /** `perfis.equipe_id` — obrigatório para CS/gestor; vazio para admin global. */
  equipeId: string | null;
  perfilNome: string | null;
  roleLoading: boolean;
  subscriptionBlocked: boolean;
  subscriptionBlockReason: string | null;
  subscriptionGateLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
};

const AdminAuthContext = createContext<Ctx | null>(null);

type PerfilAuthRow = { role?: string | null; equipe_id?: string | null; nome_completo?: string | null };

export function AdminAuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [equipeId, setEquipeId] = useState<string | null>(null);
  const [perfilNome, setPerfilNome] = useState<string | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [subscriptionBlocked, setSubscriptionBlocked] = useState(false);
  const [subscriptionBlockReason, setSubscriptionBlockReason] = useState<string | null>(null);
  const [subscriptionGateLoading, setSubscriptionGateLoading] = useState(false);

  const fetchRole = useCallback(async (userId: string | null) => {
    if (!userId) {
      setRole(null);
      setEquipeId(null);
      setPerfilNome(null);
      setRoleLoading(false);
      return;
    }
    setRoleLoading(true);
    const first = await supabase.from("perfis").select("role, equipe_id, nome_completo").eq("usuario_id", userId).maybeSingle();
    if (first.error) {
      const msg = first.error.message ?? "";
      if (msg.includes("equipe_id") && (msg.includes("column") || msg.includes("schema cache"))) {
        const legacy = await supabase.from("perfis").select("role, nome_completo").eq("usuario_id", userId).maybeSingle();
        setRoleLoading(false);
        if (legacy.error) {
          setRole(null);
          setEquipeId(null);
          setPerfilNome(null);
          return;
        }
        const row = legacy.data as PerfilAuthRow | null;
        setRole(row?.role != null ? String(row.role) : null);
        setEquipeId(null);
        setPerfilNome(row?.nome_completo ?? null);
        return;
      }
      setRoleLoading(false);
      setRole(null);
      setEquipeId(null);
      setPerfilNome(null);
      return;
    }
    const data = first.data as PerfilAuthRow | null;
    setRoleLoading(false);
    setRole(data?.role != null ? String(data.role) : null);
    const eq = data?.equipe_id;
    setEquipeId(eq != null && String(eq).trim() !== "" ? String(eq) : null);
    setPerfilNome(data?.nome_completo ?? null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setUser(data.session?.user ?? null);
      setLoading(false);
      void fetchRole(data.session?.user?.id ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, next) => {
      setSession(next ?? null);
      setUser(next?.user ?? null);
      setLoading(false);
      void fetchRole(next?.user?.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, [fetchRole]);

  useEffect(() => {
    if (!user?.id || roleLoading) {
      setSubscriptionBlocked(false);
      setSubscriptionBlockReason(null);
      setSubscriptionGateLoading(false);
      return;
    }
    let cancelled = false;
    setSubscriptionGateLoading(true);
    void evaluateAdminSubscriptionBlock({ role, equipeId })
      .then((r) => {
        if (cancelled) return;
        setSubscriptionBlocked(r.blocked);
        setSubscriptionBlockReason(r.reason ?? null);
      })
      .finally(() => {
        if (!cancelled) setSubscriptionGateLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, role, equipeId, roleLoading]);

  useEffect(() => {
    if (!user?.id || typeof window === "undefined") return;
    if (!window.sessionStorage.getItem(ADMIN_SECURITY_SESSION_START_KEY)) {
      window.sessionStorage.setItem(ADMIN_SECURITY_SESSION_START_KEY, new Date().toISOString());
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const run = async () => {
      if (typeof window === "undefined") return;
      const started = window.sessionStorage.getItem(ADMIN_SECURITY_SESSION_START_KEY);
      if (!started) return;
      try {
        const force = await adminSecurityHasForcedSignoutSince(user.id, started);
        if (!cancelled && force) {
          clearAdminSecuritySessionMarker();
          await supabase.auth.signOut();
        }
      } catch {
        /* ignore */
      }
    };
    void run();
    const t = window.setInterval(() => void run(), 30_000);
    const onVis = () => {
      if (document.visibilityState === "visible") void run();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const meta = adminSecurityClientMeta();
    const tick = () => {
      void upsertAdminSessionActivity({
        usuarioId: user.id,
        email: user.email ?? null,
        ip: meta.ip,
        device: meta.device,
      });
    };
    tick();
    const id = window.setInterval(tick, 120_000);
    return () => window.clearInterval(id);
  }, [user?.id, user?.email]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
    if (data.session?.user) {
      setUser(data.session.user);
      setSession(data.session);
    }
  }, []);

  const signOut = useCallback(async () => {
    clearAdminSecuritySessionMarker();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const refreshRole = useCallback(async () => {
    await fetchRole(user?.id ?? null);
  }, [fetchRole, user?.id]);

  const value = useMemo<Ctx>(
    () => ({
      user,
      session,
      loading,
      role,
      equipeId,
      perfilNome,
      roleLoading,
      subscriptionBlocked,
      subscriptionBlockReason,
      subscriptionGateLoading,
      signIn,
      signOut,
      refreshRole,
    }),
    [
      user,
      session,
      loading,
      role,
      equipeId,
      perfilNome,
      roleLoading,
      subscriptionBlocked,
      subscriptionBlockReason,
      subscriptionGateLoading,
      signIn,
      signOut,
      refreshRole,
    ],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): Ctx {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth fora de AdminAuthProvider");
  return ctx;
}
