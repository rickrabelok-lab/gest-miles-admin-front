import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import { useAdminAuth } from "@/context/AdminAuthContext";
import { isAdminPanelRole } from "@/lib/accessScope";
import { supabase } from "@/lib/supabase";

export type Equipe = { id: string; nome: string; parent_id: string | null };

export type EquipeNomeEdicaoDraft = { equipeId: string; nome: string };

type Ctx = {
  equipes: Equipe[];
  selectedEquipeId: string | null;
  setSelectedEquipeId: (id: string | null) => void;
  /** Rascunho do nome na página `/equipes/:id` (topbar, selectores, etc.). */
  equipeNomeEdicaoDraft: EquipeNomeEdicaoDraft | null;
  setEquipeNomeEdicaoDraft: (draft: EquipeNomeEdicaoDraft | null) => void;
  /** Actualiza o nome na lista em memória após gravar no Supabase. */
  patchEquipeNomeInList: (equipeId: string, nome: string) => void;
  /** Todas as equipes (dropdown do filtro). */
  equipesGrupoGestaoRaiz: Equipe[];
  /**
   * Filtro obrigatório: apenas `selectedEquipeId` (WHERE equipe_id = selectedEquipeId).
   * Passar a `listPerfis({ equipeIds: equipeIdsFiltro })`, etc.
   */
  equipeIdsFiltro: string[];
  /** Equipe usada em criação de perfis no âmbito selecionado. */
  defaultEquipeIdForCreateUser: string | null;
  /** Admin com `equipe_id`: filtro fixo à sua Gestão (não pode ver outras equipas no seletor). */
  equipeSelectionLocked: boolean;
  loading: boolean;
  error: string | null;
};

const AdminEquipeContext = createContext<Ctx | null>(null);

const STORAGE_KEY = "admin-selected-equipe-id";

export function AdminEquipeProvider({ children }: PropsWithChildren) {
  const { role, equipeId: authEquipeId, roleLoading: authRoleLoading } = useAdminAuth();
  const equipeSelectionLocked = Boolean(
    !authRoleLoading &&
      isAdminPanelRole(role) &&
      role !== "admin_master" &&
      authEquipeId != null &&
      String(authEquipeId).trim() !== "",
  );

  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [selectedEquipeId, setSelectedEquipeIdState] = useState<string | null>(null);
  const [equipeNomeEdicaoDraft, setEquipeNomeEdicaoDraft] = useState<EquipeNomeEdicaoDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const patchEquipeNomeInList = useCallback((equipeId: string, nome: string) => {
    const trimmed = nome.trim();
    setEquipes((prev) => prev.map((e) => (e.id === equipeId ? { ...e, nome: trimmed } : e)));
  }, []);

  const setSelectedEquipeId = useCallback(
    (id: string | null) => {
      if (equipeSelectionLocked) return;
      setSelectedEquipeIdState(id);
      if (id) sessionStorage.setItem(STORAGE_KEY, id);
      else sessionStorage.removeItem(STORAGE_KEY);
    },
    [equipeSelectionLocked],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error: qErr } = await supabase.from("equipes").select("id, nome, parent_id").order("nome", { ascending: true });
      if (cancelled) return;
      if (qErr) {
        setEquipes([]);
        setError(qErr.message ?? "Erro ao carregar equipes");
        setLoading(false);
        return;
      }
      setEquipes((data ?? []) as Equipe[]);
      setLoading(false);
    })().catch(() => {
      if (!cancelled) {
        setError("Falha ao carregar equipes");
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const equipesGrupoGestaoRaiz = useMemo(() => equipes, [equipes]);

  useEffect(() => {
    if (authRoleLoading || !equipeSelectionLocked || !authEquipeId) return;
    setSelectedEquipeIdState(authEquipeId);
  }, [authRoleLoading, equipeSelectionLocked, authEquipeId]);

  useEffect(() => {
    if (equipeSelectionLocked || loading || equipes.length === 0) return;
    // Para Admin Master/global, o escopo padrão deve ser sempre independente de uma equipe.
    setSelectedEquipeIdState(null);
    sessionStorage.removeItem(STORAGE_KEY);
  }, [equipeSelectionLocked, loading, equipes]);

  const equipeIdsFiltro = useMemo(() => {
    if (!selectedEquipeId) return [];
    return [selectedEquipeId];
  }, [selectedEquipeId]);

  const defaultEquipeIdForCreateUser = useMemo(() => selectedEquipeId, [selectedEquipeId]);

  const value = useMemo<Ctx>(
    () => ({
      equipes,
      selectedEquipeId,
      setSelectedEquipeId,
      equipeNomeEdicaoDraft,
      setEquipeNomeEdicaoDraft,
      patchEquipeNomeInList,
      equipesGrupoGestaoRaiz,
      equipeIdsFiltro,
      defaultEquipeIdForCreateUser,
      equipeSelectionLocked,
      loading,
      error,
    }),
    [
      equipes,
      selectedEquipeId,
      setSelectedEquipeId,
      equipeNomeEdicaoDraft,
      patchEquipeNomeInList,
      equipesGrupoGestaoRaiz,
      equipeIdsFiltro,
      defaultEquipeIdForCreateUser,
      equipeSelectionLocked,
      loading,
      error,
    ],
  );

  return <AdminEquipeContext.Provider value={value}>{children}</AdminEquipeContext.Provider>;
}

export function useAdminEquipe(): Ctx {
  const ctx = useContext(AdminEquipeContext);
  if (!ctx) {
    throw new Error("useAdminEquipe deve ser usado dentro de AdminEquipeProvider");
  }
  return ctx;
}
