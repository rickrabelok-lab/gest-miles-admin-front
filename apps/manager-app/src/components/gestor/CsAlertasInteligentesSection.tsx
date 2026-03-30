import { useMemo, useState } from "react";
import { Bell, ExternalLink, UserRound, CheckCircle2 } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CsGestorItem } from "@/hooks/useCsGestores";
import {
  TIPO_ALERTA_LABEL,
  type AlertaSistemaEnriched,
  type AlertaSistemaNivel,
  type AlertaSistemaTipo,
  useAlertasSistemaAtivos,
  useAlertasSistemaSync,
  useAlertaResolver,
} from "@/hooks/useAlertasSistema";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type CsAlertasInteligentesSectionProps = {
  enabled: boolean;
  canSync: boolean;
  gestoresFlat: CsGestorItem[];
  onOpenClient: (clienteId: string) => void | Promise<void>;
  onOpenGestor: (gestorId: string) => void;
};

function nivelStyles(n: AlertaSistemaNivel) {
  switch (n) {
    case "critico":
      return "border-red-600/50 bg-red-600/15 text-red-950 dark:text-red-100";
    case "alto":
      return "border-orange-600/45 bg-orange-500/15 text-orange-950 dark:text-orange-100";
    case "medio":
      return "border-amber-500/45 bg-amber-500/12 text-amber-950 dark:text-amber-100";
    default:
      return "border-slate-400/40 bg-slate-500/10 text-slate-900 dark:text-slate-100";
  }
}

function nivelLabel(n: AlertaSistemaNivel) {
  switch (n) {
    case "critico":
      return "Crítico";
    case "alto":
      return "Alto";
    case "medio":
      return "Médio";
    default:
      return "Baixo";
  }
}

function formatData(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const TIPOS: AlertaSistemaTipo[] = [
  "NPS_LOW",
  "CSAT_LOW",
  "CSAT_DROP",
  "GESTOR_SCORE_DROP",
  "CLIENT_INACTIVITY",
  "MILES_EXPIRING",
  "DEMANDA_ATRASADA",
  "MILES_CONCENTRATION",
];

const NIVEIS: AlertaSistemaNivel[] = ["critico", "alto", "medio", "baixo"];

export default function CsAlertasInteligentesSection({
  enabled,
  canSync,
  gestoresFlat,
  onOpenClient,
  onOpenGestor,
}: CsAlertasInteligentesSectionProps) {
  const { data: rows = [], isLoading, error } = useAlertasSistemaAtivos(enabled);
  const sync = useAlertasSistemaSync();
  const resolver = useAlertaResolver();

  const [filtroTipo, setFiltroTipo] = useState<string>("all");
  const [filtroNivel, setFiltroNivel] = useState<string>("all");
  const [filtroGestor, setFiltroGestor] = useState<string>("all");

  const gestorOptions = useMemo(() => {
    const m = new Map<string, string>();
    gestoresFlat.forEach((g) => m.set(g.gestorId, g.gestorNome));
    rows.forEach((r) => {
      if (r.gestor_id && !m.has(r.gestor_id)) m.set(r.gestor_id, r.gestorNome);
    });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [gestoresFlat, rows]);

  const filtrados = useMemo(() => {
    return rows.filter((r) => {
      if (filtroTipo !== "all" && r.tipo_alerta !== filtroTipo) return false;
      if (filtroNivel !== "all" && r.nivel !== filtroNivel) return false;
      if (filtroGestor !== "all" && r.gestor_id !== filtroGestor) return false;
      return true;
    });
  }, [rows, filtroTipo, filtroNivel, filtroGestor]);

  if (!enabled) return null;

  return (
    <section className="mb-4">
      <Card
        className={cn(
          "rounded-xl border-2 border-amber-500/50 bg-gradient-to-b from-amber-50/90 to-white shadow-[0_8px_30px_-8px_rgba(245,158,11,0.35)] dark:border-amber-500/35 dark:from-amber-950/25 dark:to-card dark:shadow-none",
        )}
      >
        <CardHeader className="pb-2 pt-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white shadow-md">
                <Bell className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <p className="text-base font-bold tracking-tight text-foreground">Alertas inteligentes</p>
                <p className="text-xs text-muted-foreground">
                  Riscos detectados automaticamente (NPS, CSAT, scores, inatividade, milhas, demandas). Ordenados por
                  gravidade. Dados limitados pela sua equipe (RLS).
                </p>
              </div>
            </div>
            {canSync && (
              <Button
                type="button"
                size="sm"
                variant="default"
                className="shrink-0 bg-amber-600 text-white hover:bg-amber-700"
                disabled={sync.isPending}
                onClick={() =>
                  void sync.mutateAsync().then(
                    (n) => toast.success(`Sincronização concluída (${n} novo(s) registro(s)).`),
                    (e) => toast.error(e instanceof Error ? e.message : "Falha ao sincronizar."),
                  )
                }
              >
                {sync.isPending ? "Sincronizando…" : "Atualizar alertas"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pb-4 pt-0">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground">Tipo</p>
              <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  {TIPOS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_ALERTA_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground">Nível</p>
              <Select value={filtroNivel} onValueChange={setFiltroNivel}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os níveis</SelectItem>
                  {NIVEIS.map((n) => (
                    <SelectItem key={n} value={n}>
                      {nivelLabel(n)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground">Gestor</p>
              <Select value={filtroGestor} onValueChange={setFiltroGestor}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os gestores</SelectItem>
                  {gestorOptions.map(([id, nome]) => (
                    <SelectItem key={id} value={id}>
                      {nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoading && (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando alertas…</p>
          )}
          {error && (
            <p className="py-4 text-center text-sm text-destructive">
              {error instanceof Error ? error.message : "Erro ao carregar alertas."}
            </p>
          )}
          {!isLoading && !error && filtrados.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum alerta ativo com estes filtros.
              {canSync ? " Toque em «Atualizar alertas» para gerar a partir dos dados atuais." : ""}
            </p>
          )}
          {!isLoading && !error && filtrados.length > 0 && (
            <ul className="max-h-[min(70vh,520px)] space-y-2.5 overflow-y-auto pr-0.5">
              {filtrados.map((a) => (
                <AlertaCard
                  key={a.id}
                  alerta={a}
                  onOpenClient={onOpenClient}
                  onOpenGestor={onOpenGestor}
                  onResolver={(id) =>
                    void resolver.mutateAsync(id).then(
                      () => toast.success("Alerta marcado como resolvido."),
                      (e) => toast.error(e instanceof Error ? e.message : "Falha ao resolver."),
                    )
                  }
                  resolving={resolver.isPending}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

type AlertaCardProps = {
  alerta: AlertaSistemaEnriched;
  onOpenClient: (clienteId: string) => void | Promise<void>;
  onOpenGestor: (gestorId: string) => void;
  onResolver: (id: string) => void;
  resolving: boolean;
};

function AlertaCard({
  alerta: a,
  onOpenClient,
  onOpenGestor,
  onResolver,
  resolving,
}: AlertaCardProps) {
  return (
    <li
      className={cn(
        "rounded-xl border px-3 py-2.5 text-sm shadow-sm dark:shadow-none",
        nivelStyles(a.nivel),
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold">{TIPO_ALERTA_LABEL[a.tipo_alerta]}</span>
        <span className="rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide dark:bg-white/10">
          {nivelLabel(a.nivel)}
        </span>
      </div>
      <p className="mt-1.5 text-xs leading-snug opacity-95">{a.mensagem}</p>
      <div className="mt-2 space-y-0.5 text-[11px] opacity-90">
        <p>
          <span className="font-medium">Cliente: </span>
          {a.cliente_id ? a.clienteNome : "—"}
        </p>
        <p>
          <span className="font-medium">Gestor: </span>
          {a.gestor_id ? a.gestorNome : "—"}
        </p>
        <p className="text-[10px] opacity-80">{formatData(a.data_criacao)}</p>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {a.cliente_id && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8 gap-1 text-xs"
            onClick={() => void onOpenClient(a.cliente_id!)}
          >
            <ExternalLink className="h-3 w-3" />
            Abrir cliente
          </Button>
        )}
        {a.gestor_id && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8 gap-1 text-xs"
            onClick={() => onOpenGestor(a.gestor_id!)}
          >
            <UserRound className="h-3 w-3" />
            Abrir gestor
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1 border-emerald-600/40 text-xs text-emerald-800 hover:bg-emerald-50 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
          disabled={resolving}
          onClick={() => onResolver(a.id)}
        >
          <CheckCircle2 className="h-3 w-3" />
          Resolver
        </Button>
      </div>
    </li>
  );
}
