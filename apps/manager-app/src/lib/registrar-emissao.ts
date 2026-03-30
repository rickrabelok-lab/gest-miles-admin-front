import { supabase } from "@/lib/supabase";
import type { PersistedProgramState } from "@/lib/program-state";

export type EmissaoInput = {
  cliente_id: string;
  programa: string;
  origem: string;
  destino: string;
  classe: string;
  data_ida?: string | null;
  data_volta?: string | null;
  milhas_utilizadas: number;
  taxa_embarque: number;
  data_emissao: string;
  usuario_responsavel: string;
  observacoes?: string | null;
};

function normalizeProgramKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/**
 * Registra uma emissão na tabela emissoes e debita as milhas da conta do cliente
 * em programas_cliente (conta do programa correspondente).
 * Não modifica outros módulos.
 */
export async function registrarEmissao(input: EmissaoInput): Promise<void> {
  const milhas = Number(input.milhas_utilizadas) || 0;
  if (milhas <= 0) {
    throw new Error("Quantidade de milhas deve ser maior que zero.");
  }

  const { data: programRows, error: fetchError } = await supabase
    .from("programas_cliente")
    .select("id, program_id, program_name, saldo, state")
    .eq("cliente_id", input.cliente_id);

  if (fetchError) throw fetchError;

  const key = normalizeProgramKey(input.programa);
  const match = (programRows ?? []).find((row) => {
    const idNorm = normalizeProgramKey(String(row.program_id ?? ""));
    const nameNorm = normalizeProgramKey(String(row.program_name ?? ""));
    return idNorm === key || nameNorm === key;
  });

  if (!match) {
    throw new Error(
      "Cliente não possui conta neste programa. Cadastre o programa na carteira do cliente primeiro."
    );
  }

  const currentSaldo = Number(match.saldo ?? 0);
  if (currentSaldo < milhas) {
    throw new Error(
      `Saldo insuficiente no programa. Disponível: ${currentSaldo.toLocaleString("pt-BR")} milhas.`
    );
  }

  const { error: insertError } = await supabase.from("emissoes").insert({
    cliente_id: input.cliente_id,
    programa: input.programa,
    origem: input.origem,
    destino: input.destino,
    classe: input.classe,
    data_ida: input.data_ida || null,
    data_volta: input.data_volta || null,
    milhas_utilizadas: milhas,
    taxa_embarque: Number(input.taxa_embarque) || 0,
    data_emissao: input.data_emissao,
    usuario_responsavel: input.usuario_responsavel,
    observacoes: input.observacoes ?? null,
  });

  if (insertError) throw insertError;

  const state = (match.state ?? {}) as PersistedProgramState & {
    movimentos?: Array<{
      id?: string;
      data?: string;
      tipo?: string;
      descricao?: string;
      milhas?: number;
      taxas?: number;
      origem?: string;
      destino?: string;
      classe?: string;
    }>;
  };
  const movimentos = Array.isArray(state.movimentos) ? state.movimentos : [];
  const newSaldo = Math.max(0, currentSaldo - milhas);
  const descricao = `Emissão ${input.origem || "?"} → ${input.destino || "?"}${input.classe ? ` (${input.classe})` : ""}`;

  const novoMovimento = {
    id: `em-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    data: input.data_emissao,
    tipo: "saida" as const,
    descricao,
    milhas,
    taxas: Number(input.taxa_embarque) || 0,
    origem: input.origem || undefined,
    destino: input.destino || undefined,
    classe: input.classe || undefined,
  };

  const newState: PersistedProgramState = {
    saldo: newSaldo,
    movimentos: [...movimentos, novoMovimento],
    custoSaldo: state.custoSaldo ?? 0,
    custoMedioMilheiro: state.custoMedioMilheiro ?? 0,
    lotes: Array.isArray(state.lotes) ? state.lotes : [],
  };

  const { error: updateError } = await supabase
    .from("programas_cliente")
    .update({
      saldo: newSaldo,
      state: newState,
      updated_at: new Date().toISOString(),
    })
    .eq("id", match.id);

  if (updateError) throw updateError;
}
