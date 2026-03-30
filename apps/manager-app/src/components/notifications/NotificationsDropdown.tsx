import { useMemo } from "react";
import { Bell } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { useAuth } from "@/contexts/AuthContext";
import { useNotificacoes, useNotificacoesMarkRead, type NotificacaoRow, type NotificacaoTipo } from "@/hooks/useNotificacoes";
import { cn } from "@/lib/utils";

import { format } from "date-fns";

function formatDate(iso: string) {
  try {
    return format(new Date(iso), "dd/MM/yyyy HH:mm");
  } catch {
    return iso;
  }
}

function tituloForEmpty(unreadCount: number) {
  return unreadCount > 0 ? "Você tem novas notificações" : "Nenhuma notificação";
}

export default function NotificationsDropdown() {
  const { user } = useAuth();
  const enabled = !!user?.id;

  const usuarioId = user?.id ?? null;
  const { data, isLoading } = useNotificacoes(enabled, usuarioId);
  const unreadCount = data?.unreadCount ?? 0;

  const markRead = useNotificacoesMarkRead(enabled, usuarioId);

  const items = data?.items ?? [];

  const triggerLabel = useMemo(() => tituloForEmpty(unreadCount), [unreadCount]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative rounded-[16px] p-2 text-white/90 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={triggerLabel}
          title={triggerLabel}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span
              className={cn(
                "absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-white/30 bg-red-600 px-1 text-[10px] font-bold text-white",
              )}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[320px] max-w-[85vw] p-2">
        <div className="px-2 pb-1 pt-1 text-xs font-semibold text-muted-foreground">
          Notificações {unreadCount > 0 ? `(${unreadCount})` : ""}
        </div>

        {isLoading ? (
          <div className="px-2 py-2 text-xs text-muted-foreground">Carregando…</div>
        ) : items.length === 0 ? (
          <div className="px-2 py-2 text-xs text-muted-foreground">Nada por enquanto.</div>
        ) : (
          <>
            <div className="max-h-[50vh] overflow-y-auto pr-0.5">
              {items.map((n) => (
                <DropdownMenuItem
                  key={n.id}
                  className="flex cursor-pointer flex-col gap-1 rounded-xl px-2.5 py-2.5 focus:bg-accent"
                  onSelect={(e) => {
                    e.preventDefault();
                    void markRead.mutateAsync({ id: n.id, tipo: n.tipo as NotificacaoTipo, mensagem: n.mensagem });
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-[12px] font-semibold text-foreground">{n.titulo}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{formatDate(n.data_criacao)}</span>
                  </div>
                  <p className="line-clamp-2 text-[11px] text-muted-foreground">{n.mensagem}</p>
                </DropdownMenuItem>
              ))}
            </div>
            <DropdownMenuSeparator />
            <div className="px-2 pt-1 text-[11px] text-muted-foreground">
              Ao abrir, marcamos como lida automaticamente.
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

