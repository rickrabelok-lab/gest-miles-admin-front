import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { supabase } from "@/lib/supabase";

export type NotificacaoTipo = "alerta" | "tarefa" | "sistema";

export type NotificacaoRow = {
  id: string;
  usuario_id: string;
  titulo: string;
  mensagem: string;
  tipo: NotificacaoTipo;
  lida: boolean;
  data_criacao: string;
};

function toQueryError(err: unknown, fallback: string): Error {
  if (err instanceof Error) return err;
  if (
    err &&
    typeof err === "object" &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string"
  ) {
    return new Error((err as { message: string }).message);
  }
  return new Error(fallback);
}

export function extractUuidAfterLabel(text: string, label: string): string | null {
  // Ex.: "clienteId=<uuid>"
  const re = new RegExp(`${label}=([0-9a-fA-F-]{36})`);
  const m = text.match(re);
  if (m?.[1]) return m[1];
  return null;
}

export function useNotificacoes(enabled: boolean, usuarioId: string | null) {
  return useQuery({
    queryKey: ["notificacoes_own", usuarioId],
    enabled: enabled && !!usuarioId,
    queryFn: async (): Promise<{ unreadCount: number; items: NotificacaoRow[] }> => {
      if (!usuarioId) return { unreadCount: 0, items: [] };

      const { count, error: cErr } = await supabase
        .from("notificacoes")
        .select("id", { count: "exact", head: true })
        .eq("usuario_id", usuarioId)
        .eq("lida", false);

      if (cErr) throw toQueryError(cErr, "Não foi possível contar notificações.");
      const unreadCount = typeof count === "number" ? count : 0;

      const { data, error } = await supabase
        .from("notificacoes")
        .select("id, usuario_id, titulo, mensagem, tipo, lida, data_criacao")
        .eq("usuario_id", usuarioId)
        .eq("lida", false)
        .order("data_criacao", { ascending: false })
        .limit(10);

      if (error) throw toQueryError(error, "Não foi possível carregar notificações.");

      return { unreadCount, items: (data ?? []) as NotificacaoRow[] };
    },
  });
}

export function useNotificacoesMarkRead(enabled: boolean, usuarioId: string | null) {
  const qc = useQueryClient();
  const nav = useNavigate();

  return useMutation({
    mutationFn: async (input: { id: string; tipo: NotificacaoTipo; mensagem: string }) => {
      if (!usuarioId) return;

      const { error } = await supabase
        .from("notificacoes")
        .update({ lida: true })
        .eq("id", input.id)
        .eq("usuario_id", usuarioId);

      if (error) throw toQueryError(error, "Não foi possível marcar como lida.");
    },
    onSuccess: async (_, input) => {
      await qc.invalidateQueries({ queryKey: ["notificacoes_own", usuarioId] });

      // Abrir item relacionado (o que o usuário pediu)
      if (input.tipo === "tarefa") {
        nav("/cs/tarefas");
        return;
      }

      if (input.tipo === "alerta") {
        const clienteId = extractUuidAfterLabel(input.mensagem, "clienteId");
        if (clienteId) {
          nav(`/?clientId=${encodeURIComponent(clienteId)}`);
        } else {
          nav("/cs/alertas");
        }
        return;
      }
    },
  });
}

