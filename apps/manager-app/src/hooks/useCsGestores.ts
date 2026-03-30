import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

function toQueryError(err: unknown, fallback: string): Error {
  if (err instanceof Error) return err;
  if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
    return new Error((err as { message: string }).message);
  }
  return new Error(fallback);
}

export type CsGestorItem = {
  gestorId: string;
  gestorNome: string;
  clientes: Array<{ clienteId: string; clienteNome: string }>;
};

/** Grupo nomeado (equipe): vários gestores que compartilham a mesma carteira lógica para o CS. */
export type CsGrupoGestores = {
  equipeId: string;
  nome: string;
  gestores: CsGestorItem[];
};

export type CsGestoresDashboardData = {
  /** Lista plana (dedup) para KPIs e supervisedGestorIds */
  flat: CsGestorItem[];
  /** Gestores agrupados por equipe (`equipe_gestores`) */
  grupos: CsGrupoGestores[];
  /** Gestores só em `cs_gestores`, fora de qualquer equipe nomeada */
  gestoresSomenteDireto: CsGestorItem[];
};

export const useCsGestores = (enabled: boolean) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["cs_gestores_dashboard"],
    enabled,
    queryFn: async (): Promise<CsGestoresDashboardData> => {
      const empty: CsGestoresDashboardData = { flat: [], grupos: [], gestoresSomenteDireto: [] };
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return empty;

      let gestoresPorPerfisEquipe: string[] = [];
      let csEquipeIdFromPerfil: string | null = null;
      let nomeEquipePerfil: string | null = null;

      const { data: mePerfil, error: mePerfilErr } = await supabase
        .from("perfis")
        .select("role, equipe_id")
        .eq("usuario_id", user.id)
        .maybeSingle();

      if (!mePerfilErr && mePerfil?.role === "cs" && mePerfil.equipe_id) {
        csEquipeIdFromPerfil = mePerfil.equipe_id as string;
        const { data: nomeRow } = await supabase
          .from("equipes")
          .select("nome")
          .eq("id", csEquipeIdFromPerfil)
          .maybeSingle();
        nomeEquipePerfil = ((nomeRow as { nome?: string } | null)?.nome ?? "").trim() || null;

        const { data: gestorPerfis, error: gErr } = await supabase
          .from("perfis")
          .select("usuario_id")
          .eq("role", "gestor")
          .eq("equipe_id", csEquipeIdFromPerfil);
        if (!gErr && gestorPerfis?.length) {
          gestoresPorPerfisEquipe = [
            ...new Set(
              (gestorPerfis as { usuario_id: string }[])
                .map((r) => r.usuario_id)
                .filter(Boolean),
            ),
          ];
        }
      }

      const { data: csRows, error: csError } = await supabase
        .from("cs_gestores")
        .select("gestor_id")
        .eq("cs_id", user.id);
      if (csError) throw toQueryError(csError, "Não foi possível ler cs_gestores (verifique RLS e se a migration foi aplicada).");

      const fromDirect = [...new Set([...(csRows ?? []).map((r) => r.gestor_id as string), ...gestoresPorPerfisEquipe])].filter(
        Boolean,
      );

      let equipeIds: string[] = [];
      const gestoresPorEquipe = new Map<string, string[]>();
      const equipeNomes = new Map<string, string>();

      const { data: equipeCsRows, error: equipeErr } = await supabase
        .from("equipe_cs")
        .select("equipe_id")
        .eq("cs_id", user.id);

      if (equipeErr) {
        const msg = (equipeErr.message ?? "").toLowerCase();
        if (equipeErr.code !== "42P01" && !msg.includes("does not exist")) {
          throw toQueryError(equipeErr, "Não foi possível ler equipe_cs.");
        }
      } else {
        equipeIds = [...new Set((equipeCsRows ?? []).map((r) => r.equipe_id as string).filter(Boolean))];
        if (equipeIds.length > 0) {
          const { data: eqMeta, error: eqMetaErr } = await supabase
            .from("equipes")
            .select("id, nome")
            .in("id", equipeIds);
          if (!eqMetaErr && eqMeta) {
            (eqMeta as { id: string; nome: string }[]).forEach((e) => {
              equipeNomes.set(e.id, (e.nome ?? "Equipe").trim() || "Equipe");
            });
          }

          const { data: egRows, error: egErr } = await supabase
            .from("equipe_gestores")
            .select("equipe_id, gestor_id")
            .in("equipe_id", equipeIds);

          if (egErr) {
            const msg = (egErr.message ?? "").toLowerCase();
            if (egErr.code !== "42P01" && !msg.includes("does not exist")) {
              throw toQueryError(egErr, "Não foi possível ler equipe_gestores.");
            }
          } else {
            (egRows ?? []).forEach((row) => {
              const eid = row.equipe_id as string;
              const gid = row.gestor_id as string;
              if (!eid || !gid) return;
              if (!gestoresPorEquipe.has(eid)) gestoresPorEquipe.set(eid, []);
              gestoresPorEquipe.get(eid)!.push(gid);
            });
          }
        }
      }

      const gestoresEmAlgumaEquipe = new Set<string>();
      gestoresPorEquipe.forEach((gids) => gids.forEach((id) => gestoresEmAlgumaEquipe.add(id)));

      const diretoIds = fromDirect.filter((id) => !gestoresEmAlgumaEquipe.has(id));
      const gestorIds = [...new Set([...fromDirect, ...Array.from(gestoresEmAlgumaEquipe)])];

      if (gestorIds.length === 0) return empty;

      const { data: perfisGestores, error: perfisGErr } = await supabase
        .from("perfis")
        .select("usuario_id, nome_completo")
        .in("usuario_id", gestorIds);
      if (perfisGErr) throw toQueryError(perfisGErr, "Não foi possível ler perfis dos gestores.");

      const gestorNames = new Map<string, string>();
      (perfisGestores ?? []).forEach((row) => {
        const id = row.usuario_id as string;
        gestorNames.set(id, (row.nome_completo as string) ?? "Gestor");
      });

      const { data: clienteGestoresRows, error: cgErr } = await supabase
        .from("cliente_gestores")
        .select("gestor_id, cliente_id")
        .in("gestor_id", gestorIds);
      if (cgErr)
        throw toQueryError(
          cgErr,
          "Sem permissão para ler cliente_gestores da equipe. Rode a migration CS no Supabase.",
        );

      const clientesByGestor = new Map<string, string[]>();
      (clienteGestoresRows ?? []).forEach((row) => {
        const gid = row.gestor_id as string;
        const cid = row.cliente_id as string;
        if (!clientesByGestor.has(gid)) clientesByGestor.set(gid, []);
        clientesByGestor.get(gid)!.push(cid);
      });

      const clienteIds = [...new Set((clienteGestoresRows ?? []).map((r) => r.cliente_id as string).filter(Boolean))];
      const clienteNames = new Map<string, string>();
      if (clienteIds.length > 0) {
        const { data: perfisClientes } = await supabase
          .from("perfis")
          .select("usuario_id, nome_completo")
          .in("usuario_id", clienteIds);
        (perfisClientes ?? []).forEach((row) => {
          clienteNames.set(row.usuario_id as string, (row.nome_completo as string) ?? "Cliente");
        });
      }

      /** Carteira “unificada” da equipe: união dos clientes de todos os gestores do mesmo `equipe_id`. */
      const clienteIdsUniaoPorEquipe = (eid: string): string[] => {
        const gids = [...new Set(gestoresPorEquipe.get(eid) ?? [])];
        const uni = new Set<string>();
        for (const g of gids) {
          for (const cid of clientesByGestor.get(g) ?? []) uni.add(cid);
        }
        return [...uni];
      };

      /** Para um gestor que está em equipe(s): união dos clientes de todos os colegas da(s) mesma(s) equipe(s). */
      const clienteIdsUniaoParaGestorEmEquipe = (gestorId: string): string[] => {
        const equipesDoGestor = equipeIds.filter((eid) =>
          (gestoresPorEquipe.get(eid) ?? []).includes(gestorId),
        );
        if (equipesDoGestor.length === 0) return clientesByGestor.get(gestorId) ?? [];
        const uni = new Set<string>();
        for (const eid of equipesDoGestor) {
          for (const cid of clienteIdsUniaoPorEquipe(eid)) uni.add(cid);
        }
        return [...uni];
      };

      const toItemDireto = (gestorId: string): CsGestorItem => ({
        gestorId,
        gestorNome: gestorNames.get(gestorId) ?? "Gestor",
        clientes: (clientesByGestor.get(gestorId) ?? []).map((clienteId) => ({
          clienteId,
          clienteNome: clienteNames.get(clienteId) ?? "Cliente",
        })),
      });

      const toListaClientesOrdenada = (ids: string[]) =>
        [...new Set(ids)]
          .map((clienteId) => ({
            clienteId,
            clienteNome: clienteNames.get(clienteId) ?? "Cliente",
          }))
          .sort((a, b) => a.clienteNome.localeCompare(b.clienteNome, "pt-BR"));

      let grupos: CsGrupoGestores[] = equipeIds
        .map((eid) => {
          const gids = [...new Set(gestoresPorEquipe.get(eid) ?? [])];
          const idsUniao = clienteIdsUniaoPorEquipe(eid);
          const clientesMesmaCarteira = toListaClientesOrdenada(idsUniao);
          return {
            equipeId: eid,
            nome: equipeNomes.get(eid) ?? "Equipe",
            gestores: gids.map((gid) => ({
              gestorId: gid,
              gestorNome: gestorNames.get(gid) ?? "Gestor",
              clientes: clientesMesmaCarteira,
            })),
          };
        })
        .filter((g) => g.gestores.length > 0)
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

      if (
        csEquipeIdFromPerfil &&
        gestoresPorPerfisEquipe.length > 0 &&
        !grupos.some((g) => g.equipeId === csEquipeIdFromPerfil)
      ) {
        const idsUniaoSynthetic = (() => {
          const uni = new Set<string>();
          for (const g of gestoresPorPerfisEquipe) {
            for (const cid of clientesByGestor.get(g) ?? []) uni.add(cid);
          }
          return [...uni];
        })();
        const clientesMesmaCarteira = toListaClientesOrdenada(idsUniaoSynthetic);
        grupos = [
          {
            equipeId: csEquipeIdFromPerfil,
            nome: nomeEquipePerfil ?? "Equipe",
            gestores: gestoresPorPerfisEquipe.map((gid) => ({
              gestorId: gid,
              gestorNome: gestorNames.get(gid) ?? "Gestor",
              clientes: clientesMesmaCarteira,
            })),
          },
          ...grupos,
        ].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      }

      const gestoresSomenteDireto = diretoIds.map(toItemDireto);

      const flat: CsGestorItem[] = gestorIds
        .map((gid) => {
          const emEquipe = equipeIds.some((eid) => (gestoresPorEquipe.get(eid) ?? []).includes(gid));
          const ids = emEquipe ? clienteIdsUniaoParaGestorEmEquipe(gid) : clientesByGestor.get(gid) ?? [];
          return {
            gestorId: gid,
            gestorNome: gestorNames.get(gid) ?? "Gestor",
            clientes: toListaClientesOrdenada(ids),
          };
        })
        .sort((a, b) => a.gestorNome.localeCompare(b.gestorNome, "pt-BR"));

      return { flat, grupos, gestoresSomenteDireto };
    },
  });

  return {
    ...query,
    invalidate: () => queryClient.invalidateQueries({ queryKey: ["cs_gestores_dashboard"] }),
  };
};
