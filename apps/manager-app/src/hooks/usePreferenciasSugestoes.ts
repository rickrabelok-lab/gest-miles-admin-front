import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { ClassePreferencia, DestinoPreferencia } from "@/lib/smart-award-constants";

export type PreferenciasSugestoes = {
  preferencia_destino: DestinoPreferencia[];
  preferencia_classe: ClassePreferencia;
};

const defaultPreferencias: PreferenciasSugestoes = {
  preferencia_destino: ["Todos"],
  preferencia_classe: "Todas",
};

/** @param overrideUsuarioId Quando informado (ex.: gestor vendo cliente), carrega preferências desse usuário. */
export const usePreferenciasSugestoes = (overrideUsuarioId?: string | null) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = overrideUsuarioId ?? user?.id ?? null;

  const query = useQuery({
    queryKey: ["preferencias_usuario", userId],
    enabled: !!userId,
    retry: false,
    queryFn: async (): Promise<PreferenciasSugestoes> => {
      const { data, error } = await supabase
        .from("preferencias_usuario")
        .select("preferencia_destino, preferencia_classe")
        .eq("usuario_id", userId!)
        .maybeSingle();
      if (error) {
        console.warn("[PreferenciasSugestoes] preferencias_usuario:", error.message);
        return defaultPreferencias;
      }
      const dest = (data?.preferencia_destino ?? []) as string[];
      const destinos = dest.length === 0 ? ["Todos"] : (dest as DestinoPreferencia[]);
      return {
        preferencia_destino: destinos,
        preferencia_classe: (data?.preferencia_classe as ClassePreferencia) ?? "Todas",
      };
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (pref: PreferenciasSugestoes) => {
      if (!user?.id) throw new Error("Usuário não autenticado.");
      const payload = {
        usuario_id: user.id,
        preferencia_destino: pref.preferencia_destino,
        preferencia_classe: pref.preferencia_classe,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("preferencias_usuario")
        .upsert(payload, { onConflict: "usuario_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["preferencias_usuario", userId] });
      queryClient.invalidateQueries({ queryKey: ["smart_award_suggestions"] });
    },
  });

  return {
    preferencias: query.data ?? defaultPreferencias,
    loading: query.isLoading,
    error: query.error,
    save: saveMutation.mutateAsync,
    saving: saveMutation.isPending,
    refetch: query.refetch,
  };
};
