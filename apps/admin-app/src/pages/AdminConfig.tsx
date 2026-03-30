import { APP_CONFIG_KEYS, DEFAULT_APP_CONFIG, useAppConfig } from "@gest-miles/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAccessScope } from "@/hooks/useAccessScope";
import { canAccessAppConfig } from "@/lib/accessScope";
import {
  formatSupabaseError,
  listConfiguracoes,
  listConfiguracoesHistorico,
  upsertConfiguracao,
  type ConfiguracaoHistoricoRow,
  type ConfiguracaoRow,
} from "@/lib/adminApi";

type FieldKind = "string" | "json";

type FieldDef = { chave: string; label: string; kind: FieldKind; hint?: string };

const GROUPS: { id: string; title: string; description: string; fields: FieldDef[] }[] = [
  {
    id: "sistema",
    title: "Sistema",
    description: "Identidade visual e nome exibido em todas as apps que usam AppConfigProvider.",
    fields: [
      { chave: APP_CONFIG_KEYS.SISTEMA_NOME, label: "Nome da app", kind: "string" },
      { chave: APP_CONFIG_KEYS.SISTEMA_LOGO_URL, label: "URL do logótipo", kind: "string", hint: "Imagem pública (https://…)" },
      { chave: APP_CONFIG_KEYS.SISTEMA_COR_PRIMARIA, label: "Cor primária (hex)", kind: "string" },
      { chave: APP_CONFIG_KEYS.SISTEMA_COR_SECUNDARIA, label: "Cor secundária (hex)", kind: "string" },
      { chave: APP_CONFIG_KEYS.SISTEMA_COR_ACCENT, label: "Cor de destaque (hex)", kind: "string" },
    ],
  },
  {
    id: "negocio",
    title: "Regras de negócio",
    description: "Score, economia e limites — consumir nos gestores/cliente via useAppConfig().",
    fields: [
      { chave: APP_CONFIG_KEYS.NEGOCIO_SCORE, label: "Cálculo de score", kind: "json" },
      { chave: APP_CONFIG_KEYS.NEGOCIO_ECONOMIA, label: "Regras de economia", kind: "json" },
      { chave: APP_CONFIG_KEYS.NEGOCIO_LIMITES, label: "Limites", kind: "json" },
    ],
  },
  {
    id: "financeiro",
    title: "Financeiro",
    description: "Referência para categorias e taxas (alinhado ao painel financeiro).",
    fields: [
      { chave: APP_CONFIG_KEYS.FINANCEIRO_CATEGORIAS, label: "Categorias", kind: "json" },
      { chave: APP_CONFIG_KEYS.FINANCEIRO_TAXAS, label: "Taxas", kind: "json" },
    ],
  },
  {
    id: "viagens",
    title: "Viagens",
    description: "Estados e janelas de alerta.",
    fields: [
      { chave: APP_CONFIG_KEYS.VIAGENS_STATUS, label: "Status padrão", kind: "json" },
      { chave: APP_CONFIG_KEYS.VIAGENS_ALERTAS, label: "Regras de alerta", kind: "json" },
    ],
  },
  {
    id: "notificacoes",
    title: "Notificações",
    description: "Templates com placeholders livres (ex.: {{nome}}).",
    fields: [{ chave: APP_CONFIG_KEYS.NOTIFICACOES_TEMPLATES, label: "Templates de mensagens", kind: "json" }],
  },
];

function stringifyVal(v: unknown, kind: FieldKind): string {
  if (kind === "string") {
    if (v == null) return "";
    if (typeof v === "string") return v;
    return String(v);
  }
  try {
    return JSON.stringify(v ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

export default function AdminConfigPage() {
  const { scope } = useAccessScope();
  const { refresh: refreshAppConfig } = useAppConfig();
  const [rows, setRows] = useState<ConfiguracaoRow[]>([]);
  const [hist, setHist] = useState<ConfiguracaoHistoricoRow[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const rowByChave = useMemo(() => {
    const m = new Map<string, ConfiguracaoRow>();
    for (const r of rows) m.set(r.chave, r);
    return m;
  }, [rows]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, h] = await Promise.all([listConfiguracoes(), listConfiguracoesHistorico(150)]);
      setRows(list);
      setHist(h);
      const nextDraft: Record<string, string> = {};
      for (const g of GROUPS) {
        for (const f of g.fields) {
          const row = list.find((x) => x.chave === f.chave);
          const base = row?.valor ?? DEFAULT_APP_CONFIG[f.chave];
          nextDraft[f.chave] = stringifyVal(base, f.kind);
        }
      }
      setDraft(nextDraft);
    } catch (e) {
      setError(formatSupabaseError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveField = async (chave: string, kind: FieldKind, descricao: string | null) => {
    const raw = draft[chave] ?? "";
    let valor: unknown;
    if (kind === "string") {
      valor = raw;
    } else {
      try {
        valor = JSON.parse(raw || "{}");
      } catch {
        setError("JSON inválido. Corrija antes de guardar.");
        return;
      }
    }
    setSavingKey(chave);
    setError(null);
    try {
      await upsertConfiguracao({ chave, valor, descricao });
      await load();
      await refreshAppConfig();
    } catch (e) {
      setError(formatSupabaseError(e));
    } finally {
      setSavingKey(null);
    }
  };

  if (!canAccessAppConfig(scope)) {
    return <Navigate to="/dashboard" replace />;
  }

  const moduleMissing = !loading && rows.length === 0 && !error;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-nubank-text">Configurações globais</h1>
        <p className="mt-1 text-sm text-nubank-text-secondary">
          Controlo centralizado em <code className="text-xs">configuracoes</code> (valor JSON por chave). As apps leem via{" "}
          <code className="text-xs">@gest-miles/shared</code> — <code className="text-xs">useAppConfig()</code> + Realtime. Execute{" "}
          <code className="text-xs">sql/configuracoes.sql</code> e ative Replication para <code className="text-xs">configuracoes</code> no Supabase
          para atualização instantânea em todos os clientes.
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {moduleMissing ? (
        <p className="text-sm text-muted-foreground">
          Tabela ainda não existe ou está vazia. Aplique o SQL (inclui seeds) e recarregue.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          Recarregar
        </Button>
      </div>

      <Tabs defaultValue="sistema" className="w-full">
        <TabsList className="flex h-auto min-h-10 w-full flex-wrap justify-start gap-1">
          {GROUPS.map((g) => (
            <TabsTrigger key={g.id} value={g.id} className="text-xs sm:text-sm">
              {g.title}
            </TabsTrigger>
          ))}
          <TabsTrigger value="historico" className="text-xs sm:text-sm">
            Histórico
          </TabsTrigger>
        </TabsList>

        {GROUPS.map((g) => (
          <TabsContent key={g.id} value={g.id} className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">{g.description}</p>
            {g.fields.map((f) => {
              const row = rowByChave.get(f.chave);
              return (
                <Card key={f.chave}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{f.label}</CardTitle>
                    <CardDescription className="font-mono text-xs">{f.chave}</CardDescription>
                    {row?.versao != null ? (
                      <p className="text-xs text-muted-foreground">Versão: {row.versao}</p>
                    ) : null}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {f.hint ? <p className="text-xs text-muted-foreground">{f.hint}</p> : null}
                    {loading ? (
                      <Skeleton className="h-24 w-full" />
                    ) : f.kind === "string" ? (
                      <Input
                        value={draft[f.chave] ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, [f.chave]: e.target.value }))}
                      />
                    ) : (
                      <Textarea
                        className="min-h-[160px] font-mono text-xs"
                        value={draft[f.chave] ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, [f.chave]: e.target.value }))}
                      />
                    )}
                    <Button
                      type="button"
                      size="sm"
                      disabled={loading || savingKey === f.chave}
                      onClick={() => void saveField(f.chave, f.kind, row?.descricao ?? null)}
                    >
                      {savingKey === f.chave ? "A guardar…" : "Guardar"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>
        ))}

        <TabsContent value="historico" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Histórico de alterações</CardTitle>
              <CardDescription>
                Registos automáticos por trigger: valor anterior, novo valor e versão após cada mudança de{" "}
                <code className="text-xs">valor</code>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[720px] border-collapse text-xs">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="p-2">Quando</th>
                      <th className="p-2">Chave</th>
                      <th className="p-2">Versão</th>
                      <th className="p-2">Valor anterior</th>
                      <th className="p-2">Valor novo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={5} className="p-3">
                          <Skeleton className="h-8 w-full" />
                        </td>
                      </tr>
                    ) : hist.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-3 text-muted-foreground">
                          Sem histórico.
                        </td>
                      </tr>
                    ) : (
                      hist.map((h) => (
                        <tr key={h.id} className="border-t align-top">
                          <td className="whitespace-nowrap p-2">{h.alterado_em ? new Date(h.alterado_em).toLocaleString("pt-BR") : "—"}</td>
                          <td className="p-2 font-mono">{h.chave}</td>
                          <td className="p-2">{h.versao}</td>
                          <td className="max-w-[200px] truncate p-2 font-mono" title={JSON.stringify(h.valor_anterior)}>
                            {h.valor_anterior == null ? "—" : JSON.stringify(h.valor_anterior)}
                          </td>
                          <td className="max-w-[200px] truncate p-2 font-mono" title={JSON.stringify(h.valor_novo)}>
                            {JSON.stringify(h.valor_novo)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
