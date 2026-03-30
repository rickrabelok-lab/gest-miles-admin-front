import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { parseMovimentoDate } from "@/lib/program-state";

export type RiscoCarteira = "baixo" | "medio" | "alto";

/** Gestor vinculado ao cliente (pode haver vários co-gestores). */
export type GestorResponsavelRef = {
  id: string;
  nome: string;
};

export type GestorClienteResumo = {
  clienteId: string;
  nome: string;
  /** Todos os gestores com vínculo ativo a este cliente (cliente_gestores + gestor_clientes legado). */
  gestoresResponsaveis: GestorResponsavelRef[];
  milhas: number;
  valorEstimado: number;
  pontosVencendo90d: number;
  roiMedio: number;
  ultimaAtualizacao: string | null;
  /** Economia total gerada (soma economiaReal das saídas) */
  economiaTotal: number;
  /** Melhor economia por milheiro já obtida em uma emissão (R$/milheiro) */
  melhorMilheiro: number | null;
  /** Data da última movimentação (qualquer tipo) */
  ultimaMovimentacao: string | null;
  /** Maior % de milhas em um único programa (0-100) */
  concentracaoMaxima: number;
  /** Score estratégico 0-100 */
  scoreEstrategico: number;
  riscoCarteira: RiscoCarteira;
};

export type DrePeriodo = {
  entradasTotal: number;
  economiaTotal: number;
  roiPercentual: number;
  lucroEstrategico: number;
};

export type GestorDreConsolidado = {
  ultimos30dias: DrePeriodo;
  ultimos90dias: DrePeriodo;
  ultimos12meses: DrePeriodo;
  totalHistorico: DrePeriodo;
};

export type GestorVencimentoItem = {
  clienteId: string;
  clienteNome: string;
  programId: string;
  programName: string;
  data: string;
  diasRestantes: number;
  quantidade: number;
};

export type GestorDemandaItem = {
  id: number;
  clienteId: string;
  clienteNome: string;
  tipo: "emissao" | "outros";
  status: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type GestorPlanoAcaoProgramKey = "latam" | "azul" | "smiles" | "avios";

export type GestorPlanoAcaoClienteItem = {
  clienteId: string;
  nome: string;
};

export type UseGestorOptions = {
  /**
   * IDs de gestores supervisionados (ex.: CS via `cs_gestores`).
   * Quando definido e não vazio, agrega clientes de todos esses gestores
   * em vez do usuário logado como gestor.
   */
  supervisedGestorIds?: string[];
};

export const useGestor = (
  enabled = true,
  extraClientIds: string[] = [],
  options: UseGestorOptions = {},
) => {
  const queryClient = useQueryClient();
  const supervisedGestorIds = options.supervisedGestorIds;
  const supervisedKey =
    supervisedGestorIds?.length && supervisedGestorIds.length > 0
      ? [...supervisedGestorIds].sort().join(",")
      : "";

  const clientsQuery = useQuery({
    queryKey: ["cliente_gestores", supervisedKey || "self"],
    enabled,
    queryFn: async () => {
      const ids = new Set<string>();

      if (supervisedGestorIds && supervisedGestorIds.length > 0) {
        const { data: cgData, error: cgError } = await supabase
          .from("cliente_gestores")
          .select("cliente_id")
          .in("gestor_id", supervisedGestorIds);
        if (!cgError && cgData) {
          cgData.forEach((row) => {
            const id = row.cliente_id as string;
            if (id) ids.add(id);
          });
        }

        const { data: gcData, error: gcError } = await supabase
          .from("gestor_clientes")
          .select("cliente_id")
          .in("gestor_id", supervisedGestorIds);
        if (!gcError && gcData) {
          gcData.forEach((row) => {
            const id = row.cliente_id as string;
            if (id) ids.add(id);
          });
        }

        return Array.from(ids);
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return [] as string[];

      const { data: cgDataSelf, error: cgErrorSelf } = await supabase
        .from("cliente_gestores")
        .select("cliente_id")
        .eq("gestor_id", user.id);
      if (!cgErrorSelf && cgDataSelf) {
        cgDataSelf.forEach((row) => {
          const id = row.cliente_id as string;
          if (id) ids.add(id);
        });
      }

      const { data: gcDataSelf, error: gcErrorSelf } = await supabase
        .from("gestor_clientes")
        .select("cliente_id")
        .eq("gestor_id", user.id);
      if (!gcErrorSelf && gcDataSelf) {
        gcDataSelf.forEach((row) => {
          const id = row.cliente_id as string;
          if (id) ids.add(id);
        });
      }

      return Array.from(ids);
    },
  });

  const allClientIds = useMemo(() => {
    const merged = new Set<string>();
    (clientsQuery.data ?? []).forEach((id) => {
      if (id) merged.add(id);
    });
    extraClientIds.forEach((id) => {
      if (id) merged.add(id);
    });
    return Array.from(merged);
  }, [clientsQuery.data, extraClientIds]);

  const profilesQuery = useQuery({
    queryKey: ["cliente_gestores_perfis", allClientIds],
    enabled: enabled && !!allClientIds.length,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("perfis")
        .select("usuario_id, nome_completo, configuracao_tema")
        .in("usuario_id", allClientIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  /** Co-gestores por cliente (requer RLS que permita ler vínculos — ver migration co_gestor_read_links). */
  const gestoresPorClienteQuery = useQuery({
    queryKey: ["gestor_co_gestores_por_cliente", allClientIds],
    enabled: enabled && !!allClientIds.length,
    queryFn: async (): Promise<Record<string, GestorResponsavelRef[]>> => {
      const { data: cgRows, error: cgErr } = await supabase
        .from("cliente_gestores")
        .select("cliente_id, gestor_id")
        .in("cliente_id", allClientIds);
      if (cgErr) {
        // RLS antigo: painel segue sem lista de co-gestores até rodar migration `co_gestor_read_links`.
        return {};
      }

      const { data: gcRowsRaw, error: gcErr } = await supabase
        .from("gestor_clientes")
        .select("cliente_id, gestor_id")
        .in("cliente_id", allClientIds);
      const gcRows = gcErr ? [] : (gcRowsRaw ?? []);

      const pairKeys = new Set<string>();
      const pairs: Array<{ clienteId: string; gestorId: string }> = [];
      const pushPair = (clienteId: string, gestorId: string) => {
        if (!clienteId || !gestorId) return;
        const k = `${clienteId}:${gestorId}`;
        if (pairKeys.has(k)) return;
        pairKeys.add(k);
        pairs.push({ clienteId, gestorId });
      };

      (cgRows ?? []).forEach((r) =>
        pushPair(r.cliente_id as string, r.gestor_id as string),
      );
      gcRows.forEach((r) =>
        pushPair(r.cliente_id as string, r.gestor_id as string),
      );

      const gestorIds = [...new Set(pairs.map((p) => p.gestorId))];
      const nomeByGestor = new Map<string, string>();
      if (gestorIds.length > 0) {
        const { data: perfisGestores, error: pgErr } = await supabase
          .from("perfis")
          .select("usuario_id, nome_completo")
          .in("usuario_id", gestorIds);
        if (!pgErr) {
          (perfisGestores ?? []).forEach((row) => {
            nomeByGestor.set(
              row.usuario_id as string,
              (row.nome_completo as string)?.trim() || "Gestor",
            );
          });
        }
      }

      const byCliente = new Map<string, GestorResponsavelRef[]>();
      pairs.forEach(({ clienteId, gestorId }) => {
        const nome = nomeByGestor.get(gestorId) ?? "Gestor";
        const arr = byCliente.get(clienteId) ?? [];
        if (!arr.some((g) => g.id === gestorId)) {
          arr.push({ id: gestorId, nome });
          byCliente.set(clienteId, arr);
        }
      });

      byCliente.forEach((arr) => {
        arr.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      });

      const out: Record<string, GestorResponsavelRef[]> = {};
      byCliente.forEach((arr, cid) => {
        out[cid] = arr;
      });
      return out;
    },
  });

  const programsQuery = useQuery({
    queryKey: ["gestor_programas_cliente", allClientIds],
    enabled: enabled && !!allClientIds.length,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("programas_cliente")
        .select("cliente_id, program_id, program_name, saldo, custo_medio_milheiro, updated_at, state")
        .in("cliente_id", allClientIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const demandasQuery = useQuery({
    queryKey: ["gestor_demandas_cliente", allClientIds],
    enabled: enabled && !!allClientIds.length,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("demandas_cliente")
        .select("id, cliente_id, tipo, status, payload, created_at")
        .in("cliente_id", allClientIds)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const rows = data ?? [];
      if (supervisedGestorIds && supervisedGestorIds.length > 0) {
        return rows;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const currentGestorId = user?.id ?? null;
      if (!currentGestorId) return rows;

      // Se a demanda foi roteada para um gestor específico, cada gestor enxerga só as suas.
      // Demandas legadas sem `payload.targetGestorId` continuam visíveis.
      return rows.filter((row) => {
        const payload = (row.payload ?? {}) as Record<string, unknown>;
        const target = String(payload.targetGestorId ?? "").trim();
        if (!target) return true;
        return target === currentGestorId;
      });
    },
  });

  useEffect(() => {
    if (!enabled || !allClientIds.length) return;

    const managedClientIds = new Set(allClientIds);
    const profileNames = new Map<string, string>();
    (profilesQuery.data ?? []).forEach((row) => {
      profileNames.set(row.usuario_id as string, (row.nome_completo as string) ?? "Cliente");
    });

    const channel = supabase
      .channel(`gestor-demandas-insert-${supervisedKey || "self"}-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "demandas_cliente",
        },
        (payload) => {
          const row = payload.new as {
            id?: number;
            cliente_id?: string;
            tipo?: string;
          };
          const clienteId = String(row.cliente_id ?? "");
          if (!clienteId || !managedClientIds.has(clienteId)) return;

          const clienteNome = profileNames.get(clienteId) ?? "Cliente";
          const tipoLabel = row.tipo === "emissao" ? "emissão" : "solicitação";
          toast.info(`Nova ${tipoLabel} recebida de ${clienteNome}.`);

          queryClient.invalidateQueries({ queryKey: ["gestor_demandas_cliente"] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, allClientIds, profilesQuery.data, queryClient, supervisedKey]);

  useEffect(() => {
    if (!enabled || !allClientIds.length) return;

    const managedClientIds = new Set(allClientIds);
    const channel = supabase
      .channel(`gestor-perfis-action-plan-${supervisedKey || "self"}-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "perfis",
        },
        (payload) => {
          const row = (payload.new ?? payload.old ?? {}) as { usuario_id?: string };
          const usuarioId = String(row.usuario_id ?? "");
          if (!usuarioId || !managedClientIds.has(usuarioId)) return;

          queryClient.invalidateQueries({ queryKey: ["cliente_gestores_perfis"] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, allClientIds, queryClient, supervisedKey]);

  const resumoClientes = useMemo<GestorClienteResumo[]>(() => {
    const profiles = new Map<string, string>();
    (profilesQuery.data ?? []).forEach((row) => {
      profiles.set(row.usuario_id as string, (row.nome_completo as string) ?? "Cliente");
    });

    const gestoresByCliente = gestoresPorClienteQuery.data ?? {};

    const grouped = new Map<
      string,
      GestorClienteResumo & {
        milhasPorPrograma: Map<string, number>;
        economiaSoma: number;
        roiSoma: number;
        roiCount: number;
        melhorMilheiroVal: number | null;
        ultimaMov: string | null;
      }
    >();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stateRow = (row: (typeof programsQuery.data)[number]) =>
      (row?.state ?? {}) as {
        lotes?: Array<{ validadeLote?: string; quantidade?: number }>;
        movimentos?: Array<{
          tipo?: string;
          economiaReal?: number;
          data?: string;
          valorPago?: number;
          milhas?: number;
        }>;
      };

    // Garante que todo cliente vinculado em cliente_gestores apareça como ativo,
    // mesmo sem registros em programas_cliente (métricas ficam zeradas até haver dados).
    allClientIds.forEach((clientId) => {
      if (grouped.has(clientId)) return;
      grouped.set(clientId, {
        clienteId: clientId,
        nome: profiles.get(clientId) ?? "Cliente",
        milhas: 0,
        valorEstimado: 0,
        pontosVencendo90d: 0,
        roiMedio: 0,
        ultimaAtualizacao: null,
        economiaTotal: 0,
        melhorMilheiro: null,
        ultimaMovimentacao: null,
        concentracaoMaxima: 0,
        scoreEstrategico: 0,
        riscoCarteira: "baixo",
        milhasPorPrograma: new Map<string, number>(),
        economiaSoma: 0,
        roiSoma: 0,
        roiCount: 0,
        melhorMilheiroVal: null,
        ultimaMov: null,
      });
    });

    (programsQuery.data ?? []).forEach((row) => {
      const clientId = row.cliente_id as string;
      const programId = (row.program_id as string) ?? "";
      const current = grouped.get(clientId);
      const base = {
        clienteId: clientId,
        nome: profiles.get(clientId) ?? "Cliente",
        milhas: 0,
        valorEstimado: 0,
        pontosVencendo90d: 0,
        roiMedio: 0,
        ultimaAtualizacao: null as string | null,
        economiaTotal: 0,
        melhorMilheiro: null as number | null,
        ultimaMovimentacao: null as string | null,
        concentracaoMaxima: 0,
        scoreEstrategico: 0,
        riscoCarteira: "baixo" as RiscoCarteira,
        milhasPorPrograma: new Map<string, number>(),
        economiaSoma: 0,
        roiSoma: 0,
        roiCount: 0,
        melhorMilheiroVal: null as number | null,
        ultimaMov: null as string | null,
      };
      const cur = current ?? { ...base, milhasPorPrograma: new Map() };
      if (!current) grouped.set(clientId, cur);

      const saldo = Number(row.saldo ?? 0);
      const cpm = Number(row.custo_medio_milheiro ?? 0);
      cur.milhas += saldo;
      cur.valorEstimado += (saldo / 1000) * cpm;
      cur.milhasPorPrograma.set(programId, (cur.milhasPorPrograma.get(programId) ?? 0) + saldo);

      const state = stateRow(row);
      (state.lotes ?? []).forEach((lote) => {
        if (!lote.validadeLote) return;
        const validade = new Date(`${lote.validadeLote}T00:00:00`);
        const dias = Math.ceil(
          (validade.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (dias >= 0 && dias <= 90) {
          cur.pontosVencendo90d += Number(lote.quantidade ?? 0);
        }
      });

      const movimentos = state.movimentos ?? [];
      const saidas = movimentos.filter((m) => m.tipo === "saida");
      saidas.forEach((m) => {
        const economia = typeof m.economiaReal === "number" ? m.economiaReal : 0;
        cur.economiaSoma += economia;
        if (economia !== 0) {
          cur.roiSoma += economia;
          cur.roiCount += 1;
        }
        const milhas = Number(m.milhas ?? 0);
        if (milhas > 0 && typeof m.economiaReal === "number") {
          const porMilheiro = (m.economiaReal / milhas) * 1000;
          if (cur.melhorMilheiroVal === null || porMilheiro > cur.melhorMilheiroVal) {
            cur.melhorMilheiroVal = porMilheiro;
          }
        }
      });
      movimentos.forEach((m) => {
        if (!m.data) return;
        if (!cur.ultimaMov || m.data > cur.ultimaMov) cur.ultimaMov = m.data;
      });

      if (!cur.ultimaAtualizacao || (row.updated_at as string) > cur.ultimaAtualizacao) {
        cur.ultimaAtualizacao = row.updated_at as string;
      }

      grouped.set(clientId, cur);
    });

    const result: GestorClienteResumo[] = [];
    grouped.forEach((cur) => {
      cur.roiMedio = cur.roiCount > 0 ? cur.roiSoma / cur.roiCount : 0;
      cur.economiaTotal = cur.economiaSoma;
      cur.melhorMilheiro = cur.melhorMilheiroVal;
      cur.ultimaMovimentacao = cur.ultimaMov;
      const totalMilhas = cur.milhas || 1;
      let maxPct = 0;
      cur.milhasPorPrograma.forEach((m) => {
        const pct = (m / totalMilhas) * 100;
        if (pct > maxPct) maxPct = pct;
      });
      cur.concentracaoMaxima = maxPct;

      const roiNorm = Math.min(1, Math.max(0, (cur.roiMedio + 500) / 1000));
      const vencendoNorm = cur.milhas
        ? 1 - Math.min(1, cur.pontosVencendo90d / cur.milhas)
        : 1;
      const diversificacao = 1 - cur.concentracaoMaxima / 100;
      const atividade = cur.ultimaMov ? 1 : 0;
      cur.scoreEstrategico = Math.round(
        roiNorm * 30 + vencendoNorm * 25 + diversificacao * 25 + atividade * 20,
      );
      cur.scoreEstrategico = Math.min(100, Math.max(0, cur.scoreEstrategico));

      const riscoConcentracao = cur.concentracaoMaxima > 60;
      const riscoVencendo = cur.milhas > 0 && cur.pontosVencendo90d / cur.milhas > 0.2;
      const riscoRoi = cur.roiMedio < 0;
      if (riscoConcentracao || riscoVencendo || riscoRoi) {
        cur.riscoCarteira = "alto";
      } else if (
        cur.concentracaoMaxima > 40 ||
        (cur.milhas > 0 && cur.pontosVencendo90d / cur.milhas > 0.1)
      ) {
        cur.riscoCarteira = "medio";
      } else {
        cur.riscoCarteira = "baixo";
      }

      result.push({
        clienteId: cur.clienteId,
        nome: cur.nome,
        gestoresResponsaveis: gestoresByCliente[cur.clienteId] ?? [],
        milhas: cur.milhas,
        valorEstimado: cur.valorEstimado,
        pontosVencendo90d: cur.pontosVencendo90d,
        roiMedio: cur.roiMedio,
        ultimaAtualizacao: cur.ultimaAtualizacao,
        economiaTotal: cur.economiaTotal,
        melhorMilheiro: cur.melhorMilheiro,
        ultimaMovimentacao: cur.ultimaMovimentacao,
        concentracaoMaxima: cur.concentracaoMaxima,
        scoreEstrategico: cur.scoreEstrategico,
        riscoCarteira: cur.riscoCarteira,
      });
    });

    return result;
  }, [allClientIds, profilesQuery.data, programsQuery.data, gestoresPorClienteQuery.data]);

  const vencimentosTodosClientes = useMemo<GestorVencimentoItem[]>(() => {
    const profiles = new Map<string, string>();
    (profilesQuery.data ?? []).forEach((row) => {
      profiles.set(row.usuario_id as string, (row.nome_completo as string) ?? "Cliente");
    });

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const msDia = 1000 * 60 * 60 * 24;
    const items: GestorVencimentoItem[] = [];

    (programsQuery.data ?? []).forEach((row) => {
      const clientId = row.cliente_id as string;
      const clientName = profiles.get(clientId) ?? "Cliente";
      const programId = (row.program_id as string) ?? "";
      const programName = (row.program_name as string) ?? "Programa";

      const state = (row.state ?? {}) as {
        lotes?: Array<{ validadeLote?: string; quantidade?: number }>;
        movimentos?: Array<{
          tipo?: string;
          validadeLote?: string;
          milhas?: number;
        }>;
      };

      const lotes = (state.lotes ?? [])
        .filter((l) => !!l.validadeLote && (l.quantidade ?? 0) > 0)
        .map((l) => ({
          validadeLote: l.validadeLote as string,
          quantidade: Number(l.quantidade ?? 0),
        }));

      const fallbackLotes =
        lotes.length > 0
          ? lotes
          : (state.movimentos ?? [])
              .filter(
                (m) =>
                  m.tipo === "entrada" &&
                  !!m.validadeLote &&
                  Number(m.milhas ?? 0) > 0,
              )
              .map((m) => ({
                validadeLote: m.validadeLote as string,
                quantidade: Number(m.milhas ?? 0),
              }));

      fallbackLotes.forEach((lote) => {
        const validade = new Date(`${lote.validadeLote}T00:00:00`);
        if (Number.isNaN(validade.getTime())) return;
        const diasRestantes = Math.ceil(
          (validade.getTime() - hoje.getTime()) / msDia,
        );
        if (diasRestantes < 0) return;
        items.push({
          clienteId: clientId,
          clienteNome: clientName,
          programId,
          programName,
          data: validade.toLocaleDateString("pt-BR", { timeZone: "UTC" }),
          diasRestantes,
          quantidade: lote.quantidade,
        });
      });
    });

    return items.sort((a, b) => a.diasRestantes - b.diasRestantes);
  }, [profilesQuery.data, programsQuery.data]);

  const demandasGestor = useMemo<GestorDemandaItem[]>(() => {
    const profiles = new Map<string, string>();
    (profilesQuery.data ?? []).forEach((row) => {
      profiles.set(row.usuario_id as string, (row.nome_completo as string) ?? "Cliente");
    });

    return (demandasQuery.data ?? []).map((row) => {
      const clienteId = row.cliente_id as string;
      return {
        id: Number(row.id),
        clienteId,
        clienteNome: profiles.get(clienteId) ?? "Cliente",
        tipo: (row.tipo as "emissao" | "outros") ?? "outros",
        status: (row.status as string) ?? "pendente",
        payload: (row.payload as Record<string, unknown>) ?? {},
        createdAt: (row.created_at as string) ?? new Date().toISOString(),
      };
    });
  }, [demandasQuery.data, profilesQuery.data]);

  const kpis = useMemo(() => {
    const totalClientesAtivos = resumoClientes.length;
    const milhasSobGestao = resumoClientes.reduce((acc, c) => acc + c.milhas, 0);
    const valorEstrategicoTotal = resumoClientes.reduce(
      (acc, c) => acc + c.valorEstimado,
      0,
    );
    const milhasVencendo90d = resumoClientes.reduce(
      (acc, c) => acc + c.pontosVencendo90d,
      0,
    );
    const economiaTotalGestao = resumoClientes.reduce(
      (acc, c) => acc + c.economiaTotal,
      0,
    );
    const clientesComVencendo90d = resumoClientes.filter(
      (c) => c.pontosVencendo90d > 0,
    ).length;
    // ROI médio consolidado do gestor:
    // total economizado em todos os clientes ativos / número de clientes ativos.
    const roiMedio = totalClientesAtivos
      ? economiaTotalGestao / totalClientesAtivos
      : 0;
    return {
      totalClientesAtivos,
      milhasSobGestao,
      valorEstrategicoTotal,
      milhasVencendo90d,
      roiMedio,
      economiaTotalGestao,
      clientesComVencendo90d,
    };
  }, [resumoClientes]);

  const dreConsolidado = useMemo<GestorDreConsolidado>(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msDay = 1000 * 60 * 60 * 24;
    const periodos = [
      { dias: 30, key: "ultimos30dias" as const },
      { dias: 90, key: "ultimos90dias" as const },
      { dias: 365, key: "ultimos12meses" as const },
      { dias: 365 * 20, key: "totalHistorico" as const },
    ];

    const empty: DrePeriodo = {
      entradasTotal: 0,
      economiaTotal: 0,
      roiPercentual: 0,
      lucroEstrategico: 0,
    };

    const acc: Record<string, { entradas: number; economia: number }> = {
      ultimos30dias: { entradas: 0, economia: 0 },
      ultimos90dias: { entradas: 0, economia: 0 },
      ultimos12meses: { entradas: 0, economia: 0 },
      totalHistorico: { entradas: 0, economia: 0 },
    };

    (programsQuery.data ?? []).forEach((row) => {
      const state = (row.state ?? {}) as {
        movimentos?: Array<{
          tipo?: string;
          data?: string;
          valorPago?: number;
          economiaReal?: number;
        }>;
      };
      (state.movimentos ?? []).forEach((m) => {
        const date = parseMovimentoDate(m.data);
        if (!date) return;
        const t = date.getTime();
        const diasAtras = (today.getTime() - t) / msDay;
        if (diasAtras < 0) return;
        const entradas = m.tipo === "entrada" ? Number(m.valorPago ?? 0) : 0;
        const economia = m.tipo === "saida" ? Number(m.economiaReal ?? 0) : 0;
        periodos.forEach(({ dias, key }) => {
          if (diasAtras <= dias) {
            acc[key].entradas += entradas;
            acc[key].economia += economia;
          }
        });
      });
    });

    const build = (key: keyof typeof acc): DrePeriodo => {
      const e = acc[key].entradas;
      const ec = acc[key].economia;
      return {
        entradasTotal: e,
        economiaTotal: ec,
        roiPercentual: e > 0 ? (ec / e) * 100 : 0,
        lucroEstrategico: ec,
      };
    };

    return {
      ultimos30dias: build("ultimos30dias"),
      ultimos90dias: build("ultimos90dias"),
      ultimos12meses: build("ultimos12meses"),
      totalHistorico: build("totalHistorico"),
    };
  }, [programsQuery.data]);

  const planosAcaoPorPrograma = useMemo<
    Record<GestorPlanoAcaoProgramKey, GestorPlanoAcaoClienteItem[]>
  >(() => {
    const grouped: Record<GestorPlanoAcaoProgramKey, GestorPlanoAcaoClienteItem[]> = {
      latam: [],
      azul: [],
      smiles: [],
      avios: [],
    };
    const mergedByClientId = new Map<
      string,
      {
        nome: string;
        flags: Record<GestorPlanoAcaoProgramKey, boolean>;
      }
    >();

    const isFallbackName = (n: string) =>
      !n || n === "Cliente" || /^Cliente\s+[0-9a-f]{8}/i.test(n.trim());

    (profilesQuery.data ?? []).forEach((row) => {
      const clienteId = String(row.usuario_id ?? "");
      if (!clienteId) return;
      const nome = String(row.nome_completo ?? "Cliente").trim();
      const configuracao = (row.configuracao_tema ?? {}) as Record<string, unknown>;
      const clientePerfil = (configuracao.clientePerfil ?? {}) as Record<string, unknown>;
      const planoAcao = (clientePerfil.planoAcao ?? {}) as Record<string, unknown>;

      const existing = mergedByClientId.get(clienteId) ?? {
        nome: nome || "Cliente",
        flags: { latam: false, azul: false, smiles: false, avios: false },
      };
      if (nome && !isFallbackName(nome)) existing.nome = nome;
      else if (!existing.nome || isFallbackName(existing.nome)) existing.nome = nome || "Cliente";
      (Object.keys(grouped) as GestorPlanoAcaoProgramKey[]).forEach((key) => {
        if (planoAcao[key] === true) existing.flags[key] = true;
      });
      mergedByClientId.set(clienteId, existing);
    });

    mergedByClientId.forEach((value, clienteId) => {
      (Object.keys(grouped) as GestorPlanoAcaoProgramKey[]).forEach((key) => {
        if (value.flags[key]) {
          grouped[key].push({ clienteId, nome: value.nome });
        }
      });
    });

    (Object.keys(grouped) as GestorPlanoAcaoProgramKey[]).forEach((key) => {
      grouped[key].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    });

    return grouped;
  }, [profilesQuery.data]);

  return {
    loading:
      clientsQuery.isLoading ||
      profilesQuery.isLoading ||
      gestoresPorClienteQuery.isLoading ||
      programsQuery.isLoading ||
      demandasQuery.isLoading,
    error:
      clientsQuery.error ||
      profilesQuery.error ||
      gestoresPorClienteQuery.error ||
      programsQuery.error ||
      demandasQuery.error,
    /** IDs dos clientes vinculados ao gestor (cliente_gestores), para filtrar lista "Clientes ativos". */
    linkedClientIds: clientsQuery.data ?? [],
    clientsIds: allClientIds,
    resumoClientes,
    vencimentosTodosClientes,
    demandasGestor,
    kpis,
    dreConsolidado,
    planosAcaoPorPrograma,
  };
};
