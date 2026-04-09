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

import { supabase } from "../lib/supabase";
import { mapPerfilRolePreservingGlobalAdmin, type AppRole } from "../roles";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: AppRole | null;
  equipeId: string | null;
  roleLoading: boolean;
  mustChangePassword: boolean;
  signInWithPassword: (
    email: string,
    password: string,
  ) => Promise<{ ok: boolean; mustChangePassword: boolean }>;
  signUpWithPassword: (email: string, password: string) => Promise<boolean>;
  signInWithMagicLink: (email: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
  completeMandatoryPasswordChange: (newPassword: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [equipeId, setEquipeId] = useState<string | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  const fetchRole = useCallback(async (userId?: string | null) => {
    if (!userId) {
      setRole(null);
      setEquipeId(null);
      setRoleLoading(false);
      return;
    }

    setRoleLoading(true);
    let data: { role?: string; equipe_id?: string | null } | null = null;

    const full = await supabase
      .from("perfis")
      .select("role, equipe_id")
      .eq("usuario_id", userId)
      .maybeSingle();

    if (full.error) {
      const legacy = await supabase.from("perfis").select("role").eq("usuario_id", userId).maybeSingle();
      if (legacy.error) {
        setRole(null);
        setEquipeId(null);
        setRoleLoading(false);
        return;
      }
      data = legacy.data;
    } else {
      data = full.data;
    }

    setRole(mapPerfilRolePreservingGlobalAdmin(data?.role));
    setEquipeId((data?.equipe_id as string | null | undefined) ?? null);
    setRoleLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setUser(data.session?.user ?? null);
      setLoading(false);
      void fetchRole(data.session?.user?.id ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      setUser(nextSession?.user ?? null);
      setLoading(false);
      void fetchRole(nextSession?.user?.id ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchRole]);

  const signInWithMagicLink = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/me`,
      },
    });
    if (error) throw error;
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    if (data.session?.user) {
      setUser(data.session.user);
      setSession(data.session);
    }
    const ok = Boolean(data.session);
    const mustChangePassword = data.session?.user?.user_metadata?.must_change_password === true;
    return { ok, mustChangePassword };
  }, []);

  const signUpWithPassword = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return Boolean(data.session);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/me`,
      },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const refreshRole = useCallback(async () => {
    await fetchRole(user?.id ?? null);
  }, [fetchRole, user?.id]);

  const mustChangePassword = Boolean(user?.user_metadata?.must_change_password === true);

  const completeMandatoryPasswordChange = useCallback(async (newPassword: string) => {
    if (newPassword.length < 6) throw new Error("A nova senha deve ter pelo menos 6 caracteres.");
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
      data: { must_change_password: false },
    });
    if (error) throw error;
    const { data } = await supabase.auth.getSession();
    setSession(data.session ?? null);
    setUser(data.session?.user ?? null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      loading,
      role,
      equipeId,
      roleLoading,
      mustChangePassword,
      signInWithPassword,
      signUpWithPassword,
      signInWithMagicLink,
      signInWithGoogle,
      signOut,
      refreshRole,
      completeMandatoryPasswordChange,
    }),
    [
      user,
      session,
      loading,
      role,
      equipeId,
      roleLoading,
      mustChangePassword,
      signInWithPassword,
      signUpWithPassword,
      signInWithMagicLink,
      signInWithGoogle,
      signOut,
      refreshRole,
      completeMandatoryPasswordChange,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
