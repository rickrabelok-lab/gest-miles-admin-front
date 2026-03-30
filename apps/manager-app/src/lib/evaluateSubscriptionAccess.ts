import { supabase } from "@/lib/supabase";
import { isMissingRelationError } from "@/lib/supabaseErrors";

function todayYmdLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function assinaturaPermiteAcesso(status: string, dataFimYmd: string | null, hojeYmd: string): boolean {
  const st = (status ?? "").toLowerCase().trim();
  if (st === "vencida") return false;
  if (dataFimYmd && dataFimYmd < hojeYmd) return false;
  return st === "ativa" || st === "trial";
}

export type SubscriptionGateResult = { blocked: boolean; reason?: string };

/**
 * Bloqueia utilizadores do app gestor quando a assinatura da equipe (B2B) ou do cliente está vencida.
 * Se a tabela `assinaturas` não existir, não bloqueia (compatibilidade).
 */
export async function evaluateManagerSubscriptionAccess(params: {
  userId: string;
  role: string;
  equipeId: string | null;
}): Promise<SubscriptionGateResult> {
  if (params.role === "admin") return { blocked: false };

  const probe = await supabase.from("assinaturas").select("id").limit(1);
  if (probe.error && isMissingRelationError(probe.error)) return { blocked: false };

  const hoje = todayYmdLocal();

  if (params.equipeId) {
    const { data, error } = await supabase
      .from("assinaturas")
      .select("status, data_fim")
      .eq("tipo", "equipe")
      .eq("referencia_id", params.equipeId)
      .order("data_inicio", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error && isMissingRelationError(error)) return { blocked: false };
    if (error) return { blocked: false };
    if (!data) {
      return {
        blocked: true,
        reason: "Não há assinatura activa registada para a sua gestão. Contacte o administrador.",
      };
    }
    const row = data as { status?: string; data_fim?: string };
    if (!assinaturaPermiteAcesso(String(row.status ?? ""), row.data_fim ?? null, hoje)) {
      return {
        blocked: true,
        reason: "A assinatura da gestão está vencida ou inativa. O acesso foi suspenso.",
      };
    }
    return { blocked: false };
  }

  if (params.role === "cliente") {
    const { data, error } = await supabase
      .from("assinaturas")
      .select("status, data_fim")
      .eq("tipo", "cliente")
      .eq("referencia_id", params.userId)
      .order("data_inicio", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error && isMissingRelationError(error)) return { blocked: false };
    if (error) return { blocked: false };
    if (!data) return { blocked: false };
    const row = data as { status?: string; data_fim?: string };
    if (!assinaturaPermiteAcesso(String(row.status ?? ""), row.data_fim ?? null, hoje)) {
      return { blocked: true, reason: "A sua assinatura está vencida. Renove o acesso para continuar." };
    }
  }

  return { blocked: false };
}
