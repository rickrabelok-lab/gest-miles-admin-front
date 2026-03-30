import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type CsEquipeResumo = { id: string; nome: string };

/**
 * Nomes das equipes (tabela `equipes`) às quais o CS está ligado via `equipe_cs`.
 * Se as tabelas não existirem ou só houver vínculo legado `cs_gestores`, retorna [].
 */
export function useCsEquipesNomes(enabled: boolean) {
  return useQuery({
    queryKey: ["cs_equipes_nomes"],
    enabled,
    queryFn: async (): Promise<CsEquipeResumo[]> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return [];

      let data: unknown[] | null = null;

      const nested = await supabase
        .from("equipe_cs")
        .select("equipe_id, equipes(id, nome)")
        .eq("cs_id", user.id);

      if (nested.error) {
        const msg = (nested.error.message ?? "").toLowerCase();
        if (
          nested.error.code === "42P01" ||
          msg.includes("does not exist") ||
          msg.includes("schema cache")
        ) {
          return [];
        }
        if (
          msg.includes("could not find") ||
          msg.includes("relationship") ||
          nested.error.code === "PGRST200"
        ) {
          const plain = await supabase
            .from("equipe_cs")
            .select("equipe_id")
            .eq("cs_id", user.id);
          if (plain.error) return [];
          const ids = [...new Set((plain.data ?? []).map((r) => (r as { equipe_id: string }).equipe_id))];
          if (ids.length === 0) return [];
          const nomes = await supabase.from("equipes").select("id, nome").in("id", ids);
          if (nomes.error) return [];
          return (nomes.data ?? []).map((r) => ({
            id: (r as { id: string }).id,
            nome: ((r as { nome: string }).nome ?? "Equipe").trim() || "Equipe",
          }));
        }
        throw nested.error;
      }

      data = nested.data as unknown[];

      const out: CsEquipeResumo[] = [];
      for (const row of data ?? []) {
        const r = row as {
          equipe_id?: string;
          equipes?: { id?: string; nome?: string } | null;
        };
        const id = r.equipes?.id ?? r.equipe_id;
        const nome = r.equipes?.nome?.trim();
        if (id) {
          out.push({
            id,
            nome: nome && nome.length > 0 ? nome : "Equipe",
          });
        }
      }
      return out;
    },
  });
}
