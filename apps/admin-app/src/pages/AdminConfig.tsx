import { APP_CONFIG_KEYS, DEFAULT_APP_CONFIG, useAppConfig } from "@gest-miles/shared";
import { Eye, EyeOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccessScope } from "@/hooks/useAccessScope";
import { useAdminAuth } from "@/context/AdminAuthContext";
import {
  formatSupabaseError,
  listConfiguracoes,
  listConfiguracoesHistorico,
  upsertConfiguracao,
  type ConfiguracaoHistoricoRow,
  type ConfiguracaoRow,
} from "@/lib/adminApi";
import { canAccessAppConfig } from "@/lib/accessScope";
import { apiFetch, hasApiUrl } from "@/lib/backendApi";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type CfgTab = "sistema" | "regras" | "financeiro" | "notificacoes" | "integracoes" | "historico" | "perigo";

type NegocioRegrasNegocio = {
  taxa_gestao_pct: number;
  taxa_emissao_pct: number;
  desconto_fidelidade_pct: number;
  validade_milhas_meses: number;
  alerta_vencimento_dias: number;
  alertar_cliente_milhas: boolean;
  kanban_colunas: string[];
  sla_resposta_leads_horas: number;
};

type FinanceiroPagamentos = {
  stripe_secret_key: string;
  stripe_webhook_secret: string;
  stripe_mode: "live" | "sandbox";
  moeda_padrao: string;
  taxa_stripe_pct: number;
  metodo_cobranca_padrao: "boleto" | "cartao" | "pix";
};

type NotificacoesCanais = {
  email_provider: "sendgrid" | "smtp" | "resend" | "off";
  email_api_key: string;
  email_remetente: string;
  nome_remetente: string;
  notif_novo_lead: boolean;
  notif_assinatura_vencendo: boolean;
  notif_cliente_inativo: boolean;
  notif_relatorio_mensal: boolean;
  notif_erro_operacional: boolean;
  whatsapp_numero: string;
  whatsapp_mensagem_boas_vindas: string;
};

type IntegracoesDetalhes = {
  n8n_webhook_url: string;
  stripe_webhook_endpoint: string;
  ultimas_chamadas: string[];
};

const ALL_CONFIG_KEYS = Object.values(APP_CONFIG_KEYS) as string[];

function cloneDefaultConfig(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(DEFAULT_APP_CONFIG)) as Record<string, unknown>;
}

function mergeRowsIntoConfig(rows: ConfiguracaoRow[]): Record<string, unknown> {
  const cfg = cloneDefaultConfig();
  for (const r of rows) {
    if (ALL_CONFIG_KEYS.includes(r.chave)) {
      cfg[r.chave] = r.valor as unknown;
    }
  }
  return cfg;
}

function getStr(cfg: Record<string, unknown>, key: string, fallback = ""): string {
  const v = cfg[key];
  if (v == null) return fallback;
  if (typeof v === "string") return v;
  return String(v);
}

function getBool(cfg: Record<string, unknown>, key: string): boolean {
  const v = cfg[key];
  return v === true || v === "true";
}

function getObj<T extends Record<string, unknown>>(cfg: Record<string, unknown>, key: string, fallback: T): T {
  const v = cfg[key];
  if (v && typeof v === "object" && !Array.isArray(v)) return { ...fallback, ...(v as T) };
  return { ...fallback };
}

const TAB_KEYS: Record<Exclude<CfgTab, "historico" | "perigo">, string[]> = {
  sistema: [
    APP_CONFIG_KEYS.SISTEMA_NOME,
    APP_CONFIG_KEYS.SISTEMA_URL_BASE,
    APP_CONFIG_KEYS.SISTEMA_LOGO_URL,
    APP_CONFIG_KEYS.SISTEMA_COR_PRIMARIA,
    APP_CONFIG_KEYS.SISTEMA_COR_SECUNDARIA,
    APP_CONFIG_KEYS.SISTEMA_COR_ACCENT,
    APP_CONFIG_KEYS.SISTEMA_TIMEZONE,
    APP_CONFIG_KEYS.SISTEMA_LOCALE,
    APP_CONFIG_KEYS.SISTEMA_CURRENCY,
  ],
  regras: [APP_CONFIG_KEYS.NEGOCIO_REGRAS_NEGOCIO],
  financeiro: [APP_CONFIG_KEYS.FINANCEIRO_PAGAMENTOS],
  notificacoes: [APP_CONFIG_KEYS.NOTIFICACOES_CANAIS],
  integracoes: [APP_CONFIG_KEYS.INTEGRACOES_DETALHES],
};

const DEFAULT_REGRAS = DEFAULT_APP_CONFIG[APP_CONFIG_KEYS.NEGOCIO_REGRAS_NEGOCIO] as NegocioRegrasNegocio;
const DEFAULT_FIN = DEFAULT_APP_CONFIG[APP_CONFIG_KEYS.FINANCEIRO_PAGAMENTOS] as FinanceiroPagamentos;
const DEFAULT_NOTIF = DEFAULT_APP_CONFIG[APP_CONFIG_KEYS.NOTIFICACOES_CANAIS] as NotificacoesCanais;
const DEFAULT_INTEG = DEFAULT_APP_CONFIG[APP_CONFIG_KEYS.INTEGRACOES_DETALHES] as IntegracoesDetalhes;

const MESES_VALIDADE = [12, 18, 24, 36] as const;

/** Evita crash na UI se a BD tiver JSON antigo ou tipos incorretos (ex.: kanban sem array). */
function normalizeNegocioRegras(raw: unknown): NegocioRegrasNegocio {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  let kanban: string[] = DEFAULT_REGRAS.kanban_colunas;
  const k = o.kanban_colunas;
  if (Array.isArray(k)) {
    kanban = k.map((x) => String(x).trim()).filter(Boolean);
  } else if (typeof k === "string") {
    kanban = k
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (kanban.length === 0) kanban = [...DEFAULT_REGRAS.kanban_colunas];

  let validade = Number(o.validade_milhas_meses ?? DEFAULT_REGRAS.validade_milhas_meses);
  if (!MESES_VALIDADE.includes(validade as (typeof MESES_VALIDADE)[number])) {
    validade = DEFAULT_REGRAS.validade_milhas_meses;
  }

  return {
    taxa_gestao_pct: Number(o.taxa_gestao_pct ?? DEFAULT_REGRAS.taxa_gestao_pct),
    taxa_emissao_pct: Number(o.taxa_emissao_pct ?? DEFAULT_REGRAS.taxa_emissao_pct),
    desconto_fidelidade_pct: Number(o.desconto_fidelidade_pct ?? DEFAULT_REGRAS.desconto_fidelidade_pct),
    validade_milhas_meses: validade,
    alerta_vencimento_dias: Number(o.alerta_vencimento_dias ?? DEFAULT_REGRAS.alerta_vencimento_dias),
    alertar_cliente_milhas: Boolean(o.alertar_cliente_milhas ?? DEFAULT_REGRAS.alertar_cliente_milhas),
    kanban_colunas: kanban,
    sla_resposta_leads_horas: Number(o.sla_resposta_leads_horas ?? DEFAULT_REGRAS.sla_resposta_leads_horas),
  };
}

export default function AdminConfigPage() {
  const { scope } = useAccessScope();
  const { perfilNome, session } = useAdminAuth();
  const { refresh: refreshAppConfig } = useAppConfig();

  const [tab, setTab] = useState<CfgTab>("sistema");
  const [hist, setHist] = useState<ConfiguracaoHistoricoRow[]>([]);
  const [config, setConfig] = useState<Record<string, unknown>>(() => cloneDefaultConfig());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const [showStripeSec, setShowStripeSec] = useState(false);
  const [showStripeWh, setShowStripeWh] = useState(false);
  const [showEmailKey, setShowEmailKey] = useState(false);
  const [testingStripeConnection, setTestingStripeConnection] = useState(false);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const [dragLogo, setDragLogo] = useState(false);

  const [dangerOpen, setDangerOpen] = useState(false);
  const [dangerKind, setDangerKind] = useState<"cache" | "reset" | "maint" | "logs" | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, h] = await Promise.all([listConfiguracoes(), listConfiguracoesHistorico(200)]);
      setHist(h);
      setConfig(mergeRowsIntoConfig(list));
      let max: string | null = null;
      for (const r of list) {
        if (!r.updated_at) continue;
        if (!max || r.updated_at > max) max = r.updated_at;
      }
      setLastSavedAt(max);
    } catch (e) {
      setError(formatSupabaseError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const upsertKeys = async (keys: string[]) => {
    setSaving(true);
    setError(null);
    try {
      for (const chave of keys) {
        const valor = config[chave];
        await upsertConfiguracao({ chave, valor: valor as never, descricao: null });
      }
      const now = new Date().toISOString();
      setLastSavedAt(now);
      toast.success("Alterações guardadas.");
      await load();
      await refreshAppConfig();
    } catch (e) {
      const msg = formatSupabaseError(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const saveTab = (t: Exclude<CfgTab, "historico" | "perigo">) => void upsertKeys(TAB_KEYS[t]);

  const saveAll = async () => {
    setSaving(true);
    setError(null);
    try {
      for (const chave of Object.keys(DEFAULT_APP_CONFIG)) {
        await upsertConfiguracao({ chave, valor: config[chave] as never, descricao: null });
      }
      setLastSavedAt(new Date().toISOString());
      toast.success("Todas as alterações foram guardadas.");
      await load();
      await refreshAppConfig();
    } catch (e) {
      const msg = formatSupabaseError(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const cancelEdits = () => {
    void load();
    toast.message("Alterações descartadas.");
  };

  const regras = normalizeNegocioRegras(config[APP_CONFIG_KEYS.NEGOCIO_REGRAS_NEGOCIO]);
  const fin = getObj<FinanceiroPagamentos>(config, APP_CONFIG_KEYS.FINANCEIRO_PAGAMENTOS, DEFAULT_FIN);
  const notif = getObj<NotificacoesCanais>(config, APP_CONFIG_KEYS.NOTIFICACOES_CANAIS, DEFAULT_NOTIF);
  const integ = getObj<IntegracoesDetalhes>(config, APP_CONFIG_KEYS.INTEGRACOES_DETALHES, DEFAULT_INTEG);

  const testStripeConnection = async () => {
    const token = session?.access_token;
    if (!token) {
      toast.error("Sessão inválida. Entre novamente para testar a conexão.");
      return;
    }
    if (!hasApiUrl()) {
      toast.error("Backend Stripe não configurado. Defina VITE_API_USE_SAME_ORIGIN=1 e VITE_API_PROXY_TARGET.");
      return;
    }
    if (!fin.stripe_secret_key?.trim()) {
      toast.error("Preencha a Stripe Secret Key antes de testar.");
      return;
    }
    if (!fin.stripe_webhook_secret?.trim()) {
      toast.error("Preencha o Stripe Webhook Secret antes de testar.");
      return;
    }

    setTestingStripeConnection(true);
    try {
      const data = await apiFetch<{ accountId: string; latencyMs: number; mode: "live" | "sandbox" }>(
        "/api/stripe/admin/connection-test",
        {
          method: "POST",
          token,
          body: JSON.stringify({
            secretKey: fin.stripe_secret_key.trim(),
            webhookSecret: fin.stripe_webhook_secret.trim(),
            mode: fin.stripe_mode,
          }),
        },
      );
      toast.success(
        `Conexão Stripe OK (${data.mode}) • conta ${data.accountId} • ${Math.max(1, data.latencyMs)}ms`,
      );
    } catch (e) {
      toast.error(formatSupabaseError(e));
    } finally {
      setTestingStripeConnection(false);
    }
  };
  const taxasReadonly = getObj(config, APP_CONFIG_KEYS.FINANCEIRO_TAXAS, { iva_padrao: 0, taxa_servico_pct: 0 });

  const stripeConnected = Boolean(fin.stripe_secret_key?.trim());

  const lastSaveLabel = useMemo(() => {
    if (!lastSavedAt) return "—";
    const d = new Date(lastSavedAt);
    return `${d.toLocaleDateString("pt-BR")} · ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  }, [lastSavedAt]);

  const patchConfig = (key: string, value: unknown) => {
    setConfig((c) => ({ ...c, [key]: value }));
  };

  const onLogoFile = (file: File | null) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Ficheiro acima de 2MB.");
      return;
    }
    const r = new FileReader();
    r.onload = () => {
      const data = typeof r.result === "string" ? r.result : "";
      patchConfig(APP_CONFIG_KEYS.SISTEMA_LOGO_URL, data);
    };
    r.readAsDataURL(file);
  };

  const openDanger = (k: typeof dangerKind) => {
    setDangerKind(k);
    setConfirmText("");
    setDangerOpen(true);
  };

  const runDanger = async () => {
    if (confirmText !== "CONFIRMAR" || !dangerKind) return;
    setSaving(true);
    setError(null);
    try {
      if (dangerKind === "cache") {
        await refreshAppConfig();
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
        toast.success("Cache limpo.");
      } else if (dangerKind === "reset") {
        const def = cloneDefaultConfig();
        for (const chave of Object.keys(DEFAULT_APP_CONFIG)) {
          await upsertConfiguracao({ chave, valor: def[chave] as never, descricao: null });
        }
        setConfig(def);
        await refreshAppConfig();
        await load();
        toast.success("Configurações repostas nos valores padrão.");
      } else if (dangerKind === "maint") {
        const v = !getBool(config, APP_CONFIG_KEYS.SISTEMA_MANUTENCAO);
        await upsertConfiguracao({ chave: APP_CONFIG_KEYS.SISTEMA_MANUTENCAO, valor: v, descricao: null });
        await load();
        await refreshAppConfig();
        toast.success(v ? "Modo manutenção ativado." : "Modo manutenção desativado.");
      } else if (dangerKind === "logs") {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 90);
        const { error: delErr } = await supabase.from("logs_acoes").delete().lt("created_at", cutoff.toISOString());
        if (delErr) throw delErr;
        toast.success("Logs antigos removidos (se permitido por RLS).");
      }
      setDangerOpen(false);
      setDangerKind(null);
    } catch (e) {
      toast.error(formatSupabaseError(e));
      setError(formatSupabaseError(e));
    } finally {
      setSaving(false);
    }
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copiado.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  if (!canAccessAppConfig(scope)) {
    return <Navigate to="/dashboard" replace />;
  }

  const appNome = getStr(config, APP_CONFIG_KEYS.SISTEMA_NOME, "Gest Miles");
  const corPri = getStr(config, APP_CONFIG_KEYS.SISTEMA_COR_PRIMARIA, "#8A05BE");
  const corSec = getStr(config, APP_CONFIG_KEYS.SISTEMA_COR_SECUNDARIA, "#06b6d4");
  const corAcc = getStr(config, APP_CONFIG_KEYS.SISTEMA_COR_ACCENT, "#22c55e");
  const logoUrl = getStr(config, APP_CONFIG_KEYS.SISTEMA_LOGO_URL, "");

  const SectionFooter = ({ tabId }: { tabId: Exclude<CfgTab, "historico" | "perigo"> }) => (
    <div className="gm-cfg-sec-footer">
      <div className="gm-cfg-sec-footer-meta">
        Último save: {perfilNome ?? "Admin"} · {lastSaveLabel}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className={cn("btn-outline gm-cfg-btn-cancel")} style={{ height: 34 }} onClick={() => cancelEdits()} disabled={saving || loading}>
          Cancelar alterações
        </button>
        <button type="button" className="btn-primary" style={{ height: 34, fontSize: 12, padding: "0 12px" }} onClick={() => void saveTab(tabId)} disabled={saving || loading}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 7.5V10h2.5L10 4.5 7.5 2 2 7.5Z" />
          </svg>
          Salvar alterações
        </button>
      </div>
    </div>
  );

  return (
    <div className="gm-cfg-page">
      <div className="gm-cfg-hdr">
        <div>
          <div className="gm-cfg-title">Configurações</div>
          <div className="gm-cfg-sub">Controle centralizado da plataforma — identidade, integrações e regras</div>
        </div>
        <div className="gm-cfg-hdr-actions">
          <div className="gm-cfg-saved-badge">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <polyline points="1.5,5 4,7.5 8.5,2" />
            </svg>
            Salvo em {lastSaveLabel}
          </div>
          <button type="button" className="btn-outline" style={{ height: 36 }} onClick={() => void load()} disabled={loading || saving}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M2 9.5V11h3M12 5V2H9" />
              <path d="M2 7a5 5 0 0 1 9-2.2M11 6a5 5 0 0 1-9 2.2" />
            </svg>
            Recarregar
          </button>
          <button type="button" className="btn-primary" style={{ height: 36 }} onClick={() => void saveAll()} disabled={loading || saving}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 8.5V11h2.5L11 4.5 8.5 2 2 8.5Z" />
              <line x1="7" y1="3.5" x2="9.5" y2="6" />
            </svg>
            Salvar todas as alterações
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="gm-cfg-tabs-wrap">
        <div className="gm-cfg-tabs">
          {(
            [
              ["sistema", "Sistema"],
              ["regras", "Regras de negócio"],
              ["financeiro", "Financeiro"],
              ["notificacoes", "Notificações"],
              ["integracoes", "Integrações"],
              ["historico", "Histórico"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={cn("gm-cfg-tab", tab === id && "active")}
              onClick={() => setTab(id as CfgTab)}
            >
              {label}
            </button>
          ))}
          <button type="button" className={cn("gm-cfg-tab danger", tab === "perigo" && "active")} onClick={() => setTab("perigo")}>
            Zona de perigo
          </button>
        </div>

        {tab === "sistema" ? (
          <>
            <div className="gm-cfg-section">
              <div className="gm-cfg-section-title">
                <div className="gm-cfg-sec-ic" style={{ background: "var(--ps)", border: "1px solid var(--pb)" }}>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#8A05BE" strokeWidth="1.5" strokeLinecap="round">
                    <circle cx="6.5" cy="5.5" r="2.5" />
                    <rect x="1.5" y="1.5" width="10" height="10" rx="2" />
                  </svg>
                </div>
                <span className="gm-cfg-sec-label">Identidade visual</span>
                <span style={{ fontSize: 11, color: "var(--t3)", fontWeight: 400 }}>— exibida em todas as páginas públicas</span>
              </div>
              <div className="gm-cfg-form-grid gm-cfg-g2" style={{ marginBottom: 14 }}>
                <div className="gm-cfg-field">
                  <label className="gm-cfg-flabel">
                    Nome da app <span className="gm-cfg-fkey">sistema.app_nome</span>
                  </label>
                  <input
                    className="gm-cfg-finput"
                    value={getStr(config, APP_CONFIG_KEYS.SISTEMA_NOME)}
                    onChange={(e) => patchConfig(APP_CONFIG_KEYS.SISTEMA_NOME, e.target.value)}
                  />
                </div>
                <div className="gm-cfg-field">
                  <label className="gm-cfg-flabel">
                    URL base <span className="gm-cfg-fkey">sistema.url_base</span>
                  </label>
                  <input
                    className="gm-cfg-finput"
                    placeholder="https://gestmiles.com.br"
                    value={getStr(config, APP_CONFIG_KEYS.SISTEMA_URL_BASE)}
                    onChange={(e) => patchConfig(APP_CONFIG_KEYS.SISTEMA_URL_BASE, e.target.value)}
                  />
                </div>
              </div>

              <div className="gm-cfg-form-grid" style={{ gridTemplateColumns: "1fr 140px", gap: 14, marginBottom: 14 }}>
                <div className="gm-cfg-field">
                  <label className="gm-cfg-flabel">
                    Logo da plataforma <span className="gm-cfg-fkey">sistema.logo_url</span>
                  </label>
                  <input type="file" ref={logoInputRef} className="hidden" accept="image/png,image/svg+xml,image/jpeg" onChange={(e) => onLogoFile(e.target.files?.[0] ?? null)} />
                  <input
                    className="gm-cfg-finput"
                    style={{ marginBottom: 8 }}
                    placeholder="https://... (URL pública da imagem PNG/SVG)"
                    value={getStr(config, APP_CONFIG_KEYS.SISTEMA_LOGO_URL).startsWith("data:") ? "" : getStr(config, APP_CONFIG_KEYS.SISTEMA_LOGO_URL)}
                    onChange={(e) => patchConfig(APP_CONFIG_KEYS.SISTEMA_LOGO_URL, e.target.value)}
                  />
                  <div
                    className={cn("gm-cfg-upload-zone", dragLogo && "border-[var(--p)] bg-[var(--ps)]")}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragLogo(true);
                    }}
                    onDragLeave={() => setDragLogo(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragLogo(false);
                      onLogoFile(e.dataTransfer.files?.[0] ?? null);
                    }}
                    onClick={() => logoInputRef.current?.click()}
                    role="presentation"
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#9B9B9B" strokeWidth="1.5" strokeLinecap="round">
                        <path d="M3 10v3h10v-3M8 2v8M5.5 4.5L8 2l2.5 2.5" />
                      </svg>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--t2)" }}>
                        Arrastar imagem ou <span style={{ color: "var(--p)" }}>clique para fazer upload</span>
                      </span>
                    </div>
                    <div style={{ fontSize: 10.5, color: "var(--t3)", marginTop: 4 }}>PNG, SVG — máx. 2MB · recomendado: 200×60px</div>
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div className="gm-cfg-logo-preview">
                    {logoUrl && !logoUrl.startsWith("data:") ? (
                      <img src={logoUrl} alt="Logo" />
                    ) : logoUrl.startsWith("data:") ? (
                      <img src={logoUrl} alt="Logo" />
                    ) : (
                      <div className="gm-cfg-logo-preview-text">
                        {appNome.split(" ")[0]}
                        <span>{appNome.split(" ").slice(1).join(" ") || "Miles"}</span>
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 6 }}>Preview atual</div>
                </div>
              </div>

              <div className="gm-cfg-form-grid gm-cfg-g3" style={{ marginBottom: 18 }}>
                {[
                  { k: APP_CONFIG_KEYS.SISTEMA_COR_PRIMARIA, label: "Cor primária", v: corPri },
                  { k: APP_CONFIG_KEYS.SISTEMA_COR_SECUNDARIA, label: "Cor secundária", v: corSec },
                  { k: APP_CONFIG_KEYS.SISTEMA_COR_ACCENT, label: "Cor de destaque", v: corAcc },
                ].map(({ k, label, v }) => (
                  <div key={k} className="gm-cfg-field">
                    <label className="gm-cfg-flabel">
                      {label} <span className="gm-cfg-fkey">{k.replace("sistema.", "sistema.")}</span>
                    </label>
                    <div className="gm-cfg-color-field">
                      <div className="gm-cfg-color-preview">
                        <div className="gm-cfg-color-swatch" style={{ background: v }} />
                        <input
                          type="color"
                          value={v.length === 7 ? v : "#8A05BE"}
                          onChange={(e) => patchConfig(k, e.target.value)}
                          aria-label={label}
                        />
                      </div>
                      <input
                        className="gm-cfg-finput"
                        style={{ fontFamily: "monospace", fontSize: 12.5 }}
                        value={v}
                        onChange={(e) => patchConfig(k, e.target.value)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="gm-cfg-section gm-cfg-section-bordered">
              <div className="gm-cfg-section-title">
                <div className="gm-cfg-sec-ic" style={{ background: "var(--info-bg)", border: "1px solid var(--info-bd)" }}>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round">
                    <circle cx="6.5" cy="6.5" r="5.5" />
                    <line x1="6.5" y1="4" x2="6.5" y2="6.5" />
                    <circle cx="6.5" cy="9" r=".5" fill="#2563EB" />
                  </svg>
                </div>
                <span className="gm-cfg-sec-label">Sistema &amp; Localização</span>
              </div>
              <div className="gm-cfg-form-grid gm-cfg-g3" style={{ marginBottom: 18 }}>
                <div className="gm-cfg-field">
                  <label className="gm-cfg-flabel">
                    Fuso horário <span className="gm-cfg-fkey">sistema.timezone</span>
                  </label>
                  <select
                    className="gm-cfg-fselect"
                    value={getStr(config, APP_CONFIG_KEYS.SISTEMA_TIMEZONE, "America/Sao_Paulo")}
                    onChange={(e) => patchConfig(APP_CONFIG_KEYS.SISTEMA_TIMEZONE, e.target.value)}
                  >
                    <option value="America/Sao_Paulo">America/Sao_Paulo (UTC-3)</option>
                    <option value="America/Manaus">America/Manaus (UTC-4)</option>
                    <option value="America/Belem">America/Belem (UTC-3)</option>
                  </select>
                </div>
                <div className="gm-cfg-field">
                  <label className="gm-cfg-flabel">
                    Idioma padrão <span className="gm-cfg-fkey">sistema.locale</span>
                  </label>
                  <select
                    className="gm-cfg-fselect"
                    value={getStr(config, APP_CONFIG_KEYS.SISTEMA_LOCALE, "pt-BR")}
                    onChange={(e) => patchConfig(APP_CONFIG_KEYS.SISTEMA_LOCALE, e.target.value)}
                  >
                    <option value="pt-BR">pt-BR — Português (Brasil)</option>
                    <option value="en-US">en-US — English</option>
                    <option value="es">es — Español</option>
                  </select>
                </div>
                <div className="gm-cfg-field">
                  <label className="gm-cfg-flabel">
                    Moeda padrão <span className="gm-cfg-fkey">sistema.currency</span>
                  </label>
                  <select
                    className="gm-cfg-fselect"
                    value={getStr(config, APP_CONFIG_KEYS.SISTEMA_CURRENCY, "BRL")}
                    onChange={(e) => patchConfig(APP_CONFIG_KEYS.SISTEMA_CURRENCY, e.target.value)}
                  >
                    <option value="BRL">BRL — Real Brasileiro (R$)</option>
                    <option value="USD">USD — Dólar Americano ($)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="gm-cfg-section gm-cfg-section-bordered">
              <div className="gm-cfg-section-title">
                <div className="gm-cfg-sec-ic" style={{ background: "var(--ok-bg)", border: "1px solid var(--ok-bd)" }}>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M3.5 6.5L6 9 9.5 4" />
                    <rect x="1.5" y="1.5" width="10" height="10" rx="2" />
                  </svg>
                </div>
                <span className="gm-cfg-sec-label">Integrações ativas</span>
              </div>
              <div className="gm-cfg-integ-grid">
                <div className="gm-cfg-integ-card">
                  <div className="gm-cfg-integ-logo" style={{ background: "#F5F5F6" }}>
                    💳
                  </div>
                  <div>
                    <div className="gm-cfg-integ-name">Stripe</div>
                    <div className="gm-cfg-integ-desc">Pagamentos e assinaturas</div>
                  </div>
                  <div className="gm-cfg-integ-status">
                    <span className={cn("gm-cfg-badge", stripeConnected ? "b-ok" : "b-off")}>{stripeConnected ? "Conectado" : "Não configurado"}</span>
                    <button type="button" className="gm-cfg-btn-sm-p" onClick={() => setTab("financeiro")}>
                      Configurar
                    </button>
                  </div>
                </div>
                <div className="gm-cfg-integ-card">
                  <div className="gm-cfg-integ-logo" style={{ background: "#DCFCE7" }}>
                    💬
                  </div>
                  <div>
                    <div className="gm-cfg-integ-name">WhatsApp API</div>
                    <div className="gm-cfg-integ-desc">Notificações e contato</div>
                  </div>
                  <div className="gm-cfg-integ-status">
                    <span className="gm-cfg-badge b-off">{notif.whatsapp_numero?.trim() ? "Parcial" : "Não configurado"}</span>
                    <button type="button" className="gm-cfg-btn-sm-p" onClick={() => setTab("notificacoes")}>
                      Conectar
                    </button>
                  </div>
                </div>
                <div className="gm-cfg-integ-card">
                  <div className="gm-cfg-integ-logo" style={{ background: "#EFF6FF" }}>
                    📧
                  </div>
                  <div>
                    <div className="gm-cfg-integ-name">SendGrid / SMTP</div>
                    <div className="gm-cfg-integ-desc">E-mails transacionais</div>
                  </div>
                  <div className="gm-cfg-integ-status">
                    <span className="gm-cfg-badge b-off">{notif.email_provider !== "off" ? "Parcial" : "Não configurado"}</span>
                    <button type="button" className="gm-cfg-btn-sm-p" onClick={() => setTab("notificacoes")}>
                      Conectar
                    </button>
                  </div>
                </div>
                <div className="gm-cfg-integ-card">
                  <div className="gm-cfg-integ-logo" style={{ background: "#F3E8FF" }}>
                    ⚡
                  </div>
                  <div>
                    <div className="gm-cfg-integ-name">n8n / Zapier</div>
                    <div className="gm-cfg-integ-desc">Automações e webhooks</div>
                  </div>
                  <div className="gm-cfg-integ-status">
                    <span className="gm-cfg-badge b-off">{integ.n8n_webhook_url?.trim() ? "Parcial" : "Não configurado"}</span>
                    <button type="button" className="gm-cfg-btn-sm-p" onClick={() => setTab("integracoes")}>
                      Conectar
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <SectionFooter tabId="sistema" />
          </>
        ) : null}

        {tab === "regras" ? (
          <>
            <div className="gm-cfg-section">
              <div className="gm-cfg-section-title">
                <div className="gm-cfg-sec-ic" style={{ background: "var(--ps)", border: "1px solid var(--pb)" }}>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#8A05BE" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M2.5 6.5h8M6.5 2.5v8" />
                  </svg>
                </div>
                <span className="gm-cfg-sec-label">Comissões e taxas</span>
              </div>
              <div className="gm-cfg-form-grid gm-cfg-g3" style={{ marginBottom: 18 }}>
                {(
                  [
                    ["taxa_gestao_pct", "Taxa de gestão padrão (%)"],
                    ["taxa_emissao_pct", "Taxa de emissão (%)"],
                    ["desconto_fidelidade_pct", "Desconto fidelidade (%)"],
                  ] as const
                ).map(([field, lab]) => (
                  <div key={field} className="gm-cfg-field">
                    <label className="gm-cfg-flabel">{lab}</label>
                    <input
                      type="number"
                      className="gm-cfg-finput"
                      value={Number.isFinite(regras[field]) ? regras[field] : ""}
                      onChange={(e) =>
                        patchConfig(APP_CONFIG_KEYS.NEGOCIO_REGRAS_NEGOCIO, {
                          ...regras,
                          [field]: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="gm-cfg-section gm-cfg-section-bordered">
              <div className="gm-cfg-section-title">
                <span className="gm-cfg-sec-label">Regras de milhas</span>
              </div>
              <div className="gm-cfg-form-grid gm-cfg-g2" style={{ marginBottom: 12 }}>
                <div className="gm-cfg-field">
                  <label className="gm-cfg-flabel">Validade padrão de milhas (meses)</label>
                  <select
                    className="gm-cfg-fselect"
                    value={regras.validade_milhas_meses}
                    onChange={(e) =>
                      patchConfig(APP_CONFIG_KEYS.NEGOCIO_REGRAS_NEGOCIO, {
                        ...regras,
                        validade_milhas_meses: Number(e.target.value),
                      })
                    }
                  >
                    {MESES_VALIDADE.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="gm-cfg-field">
                  <label className="gm-cfg-flabel">Alerta de vencimento (dias antes)</label>
                  <input
                    type="number"
                    className="gm-cfg-finput"
                    value={Number.isFinite(regras.alerta_vencimento_dias) ? regras.alerta_vencimento_dias : ""}
                    onChange={(e) =>
                      patchConfig(APP_CONFIG_KEYS.NEGOCIO_REGRAS_NEGOCIO, {
                        ...regras,
                        alerta_vencimento_dias: Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
              <div className="gm-cfg-notif-row">
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Alertar cliente quando milhas vencem</div>
                  <div style={{ fontSize: 11, color: "var(--t3)" }}>Envio automático de aviso</div>
                </div>
                <button
                  type="button"
                  className={cn("gm-op-toggle", regras.alertar_cliente_milhas ? "on" : "off")}
                  onClick={() =>
                    patchConfig(APP_CONFIG_KEYS.NEGOCIO_REGRAS_NEGOCIO, {
                      ...regras,
                      alertar_cliente_milhas: !regras.alertar_cliente_milhas,
                    })
                  }
                  aria-pressed={regras.alertar_cliente_milhas}
                />
              </div>
            </div>
            <div className="gm-cfg-section gm-cfg-section-bordered">
              <div className="gm-cfg-section-title">
                <span className="gm-cfg-sec-label">Kanban / Leads</span>
              </div>
              <div className="gm-cfg-field" style={{ marginBottom: 12 }}>
                <label className="gm-cfg-flabel">Colunas do Kanban (separadas por | )</label>
                <input
                  className="gm-cfg-finput"
                  value={Array.isArray(regras.kanban_colunas) ? regras.kanban_colunas.join(" | ") : ""}
                  onChange={(e) =>
                    patchConfig(APP_CONFIG_KEYS.NEGOCIO_REGRAS_NEGOCIO, {
                      ...regras,
                      kanban_colunas: e.target.value
                        .split("|")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </div>
              <div className="gm-cfg-field">
                <label className="gm-cfg-flabel">SLA de resposta a leads (horas)</label>
                <input
                  type="number"
                  className="gm-cfg-finput"
                  value={Number.isFinite(regras.sla_resposta_leads_horas) ? regras.sla_resposta_leads_horas : ""}
                  onChange={(e) =>
                    patchConfig(APP_CONFIG_KEYS.NEGOCIO_REGRAS_NEGOCIO, {
                      ...regras,
                      sla_resposta_leads_horas: Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>
            <SectionFooter tabId="regras" />
          </>
        ) : null}

        {tab === "financeiro" ? (
          <>
            <div className="gm-cfg-section">
              <div className="gm-cfg-section-title">
                <span className="gm-cfg-sec-label">Stripe</span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: 12,
                  padding: "10px 12px",
                  border: "1px solid var(--bd)",
                  borderRadius: 12,
                  background: "#fafafa",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Estado da integração</div>
                  <div style={{ fontSize: 11, color: "var(--t3)" }}>
                    Use Sandbox para validar; mude para Live apenas após teste completo de webhook.
                  </div>
                </div>
                <Badge variant={fin.stripe_mode === "live" ? "default" : "secondary"}>
                  {fin.stripe_mode === "live" ? "Live" : "Sandbox"}
                </Badge>
              </div>
              <div className="gm-cfg-field" style={{ marginBottom: 12 }}>
                <label className="gm-cfg-flabel">Stripe Secret Key</label>
                <div className="gm-cfg-pw-wrap">
                  <input
                    type={showStripeSec ? "text" : "password"}
                    className="gm-cfg-finput"
                    autoComplete="off"
                    value={fin.stripe_secret_key}
                    onChange={(e) => patchConfig(APP_CONFIG_KEYS.FINANCEIRO_PAGAMENTOS, { ...fin, stripe_secret_key: e.target.value })}
                  />
                  <button type="button" className="gm-cfg-pw-toggle" onClick={() => setShowStripeSec((v) => !v)} aria-label="Mostrar/ocultar">
                    {showStripeSec ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="gm-cfg-field" style={{ marginBottom: 12 }}>
                <label className="gm-cfg-flabel">Stripe Webhook Secret</label>
                <div className="gm-cfg-pw-wrap">
                  <input
                    type={showStripeWh ? "text" : "password"}
                    className="gm-cfg-finput"
                    autoComplete="off"
                    value={fin.stripe_webhook_secret}
                    onChange={(e) => patchConfig(APP_CONFIG_KEYS.FINANCEIRO_PAGAMENTOS, { ...fin, stripe_webhook_secret: e.target.value })}
                  />
                  <button type="button" className="gm-cfg-pw-toggle" onClick={() => setShowStripeWh((v) => !v)} aria-label="Mostrar/ocultar">
                    {showStripeWh ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="gm-cfg-notif-row">
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Modo</div>
                  <div style={{ fontSize: 11, color: "var(--t3)" }}>Live cobra cartões reais</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className={cn("gm-cfg-badge", fin.stripe_mode === "sandbox" ? "warn" : "b-ok")} style={fin.stripe_mode === "live" ? { borderColor: "var(--ok-bd)" } : undefined}>
                    {fin.stripe_mode === "live" ? "Live" : "Sandbox"}
                  </span>
                  <button
                    type="button"
                    className={cn("gm-op-toggle", fin.stripe_mode === "live" ? "on" : "off")}
                    onClick={() =>
                      patchConfig(APP_CONFIG_KEYS.FINANCEIRO_PAGAMENTOS, {
                        ...fin,
                        stripe_mode: fin.stripe_mode === "live" ? "sandbox" : "live",
                      })
                    }
                    aria-label="Alternar modo Stripe"
                  />
                </div>
              </div>
              <button
                type="button"
                className="btn-outline"
                style={{ borderColor: "var(--info-bd)", color: "var(--info)", marginTop: 8, minWidth: 220 }}
                onClick={() => void testStripeConnection()}
                disabled={testingStripeConnection}
              >
                {testingStripeConnection ? "A testar conexão..." : "Testar conexão Stripe"}
              </button>
              <p style={{ fontSize: 11, color: "var(--t3)", marginTop: 8 }}>
                O teste valida a Stripe Secret Key e o formato do Webhook Secret num backend seguro.
              </p>
            </div>
            <div className="gm-cfg-section gm-cfg-section-bordered">
              <div className="gm-cfg-section-title">
                <span className="gm-cfg-sec-label">Moeda e taxas</span>
              </div>
              <div className="gm-cfg-form-grid gm-cfg-g3">
                <div className="gm-cfg-field">
                  <label className="gm-cfg-flabel">Moeda padrão</label>
                  <select
                    className="gm-cfg-fselect"
                    value={fin.moeda_padrao}
                    onChange={(e) => patchConfig(APP_CONFIG_KEYS.FINANCEIRO_PAGAMENTOS, { ...fin, moeda_padrao: e.target.value })}
                  >
                    <option value="BRL">BRL</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
                <div className="gm-cfg-field">
                  <label className="gm-cfg-flabel">Taxa Stripe (%)</label>
                  <input className="gm-cfg-finput" style={{ background: "#f5f5f6", color: "var(--t3)" }} readOnly value={String(fin.taxa_stripe_pct)} />
                </div>
                <div className="gm-cfg-field">
                  <label className="gm-cfg-flabel">Método de cobrança padrão</label>
                  <select
                    className="gm-cfg-fselect"
                    value={fin.metodo_cobranca_padrao}
                    onChange={(e) =>
                      patchConfig(APP_CONFIG_KEYS.FINANCEIRO_PAGAMENTOS, {
                        ...fin,
                        metodo_cobranca_padrao: e.target.value as FinanceiroPagamentos["metodo_cobranca_padrao"],
                      })
                    }
                  >
                    <option value="boleto">Boleto</option>
                    <option value="cartao">Cartão</option>
                    <option value="pix">PIX</option>
                  </select>
                </div>
              </div>
              <p style={{ fontSize: 11, color: "var(--t3)", marginTop: 8 }}>Taxas internas (iva/serviço): {JSON.stringify(taxasReadonly)}</p>
            </div>
            <SectionFooter tabId="financeiro" />
          </>
        ) : null}

        {tab === "notificacoes" ? (
          <>
            <div className="gm-cfg-section">
              <div className="gm-cfg-section-title">
                <span className="gm-cfg-sec-label">E-mail (SMTP / SendGrid)</span>
              </div>
              <div className="gm-cfg-form-grid gm-cfg-g2" style={{ marginBottom: 14 }}>
                <div className="gm-cfg-field">
                  <label className="gm-cfg-flabel">Provider</label>
                  <select
                    className="gm-cfg-fselect"
                    value={notif.email_provider}
                    onChange={(e) =>
                      patchConfig(APP_CONFIG_KEYS.NOTIFICACOES_CANAIS, {
                        ...notif,
                        email_provider: e.target.value as NotificacoesCanais["email_provider"],
                      })
                    }
                  >
                    <option value="sendgrid">SendGrid</option>
                    <option value="smtp">SMTP</option>
                    <option value="resend">Resend</option>
                    <option value="off">Desativado</option>
                  </select>
                </div>
                <div className="gm-cfg-field">
                  <label className="gm-cfg-flabel">API Key</label>
                  <div className="gm-cfg-pw-wrap">
                    <input
                      type={showEmailKey ? "text" : "password"}
                      className="gm-cfg-finput"
                      value={notif.email_api_key}
                      onChange={(e) => patchConfig(APP_CONFIG_KEYS.NOTIFICACOES_CANAIS, { ...notif, email_api_key: e.target.value })}
                    />
                    <button type="button" className="gm-cfg-pw-toggle" onClick={() => setShowEmailKey((v) => !v)}>
                      {showEmailKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div className="gm-cfg-field">
                  <label className="gm-cfg-flabel">E-mail remetente</label>
                  <input
                    type="email"
                    className="gm-cfg-finput"
                    value={notif.email_remetente}
                    onChange={(e) => patchConfig(APP_CONFIG_KEYS.NOTIFICACOES_CANAIS, { ...notif, email_remetente: e.target.value })}
                  />
                </div>
                <div className="gm-cfg-field">
                  <label className="gm-cfg-flabel">Nome do remetente</label>
                  <input
                    className="gm-cfg-finput"
                    value={notif.nome_remetente}
                    onChange={(e) => patchConfig(APP_CONFIG_KEYS.NOTIFICACOES_CANAIS, { ...notif, nome_remetente: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <div className="gm-cfg-section gm-cfg-section-bordered">
              <div className="gm-cfg-section-title">
                <span className="gm-cfg-sec-label">Alertas automáticos</span>
              </div>
              {(
                [
                  ["notif_novo_lead", "Novo lead captado", "Notificar admin a cada novo lead no formulário público"],
                  ["notif_assinatura_vencendo", "Assinatura vencendo", "7 dias antes do vencimento"],
                  ["notif_cliente_inativo", "Cliente inativo", "Quando cliente não acede há 14+ dias"],
                  ["notif_relatorio_mensal", "Relatório mensal", "Resumo no 1º dia de cada mês"],
                  ["notif_erro_operacional", "Erro operacional", "Quando há erro nos logs do sistema"],
                ] as const
              ).map(([key, title, sub]) => (
                <div key={key} className="gm-cfg-notif-row">
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
                    <div style={{ fontSize: 11, color: "var(--t3)" }}>{sub}</div>
                  </div>
                  <button
                    type="button"
                    className={cn("gm-op-toggle", notif[key] ? "on" : "off")}
                    onClick={() => patchConfig(APP_CONFIG_KEYS.NOTIFICACOES_CANAIS, { ...notif, [key]: !notif[key] })}
                    aria-pressed={notif[key]}
                  />
                </div>
              ))}
            </div>
            <div className="gm-cfg-section gm-cfg-section-bordered">
              <div className="gm-cfg-section-title">
                <span className="gm-cfg-sec-label">WhatsApp</span>
              </div>
              <div className="gm-cfg-field" style={{ marginBottom: 12 }}>
                <label className="gm-cfg-flabel">Número do gestor</label>
                <input
                  className="gm-cfg-finput"
                  placeholder="+55 11 99999-9999"
                  value={notif.whatsapp_numero}
                  onChange={(e) => patchConfig(APP_CONFIG_KEYS.NOTIFICACOES_CANAIS, { ...notif, whatsapp_numero: e.target.value })}
                />
              </div>
              <div className="gm-cfg-field">
                <label className="gm-cfg-flabel">Mensagem padrão de boas-vindas</label>
                <textarea
                  className="gm-cfg-ftextarea"
                  value={notif.whatsapp_mensagem_boas_vindas}
                  onChange={(e) => patchConfig(APP_CONFIG_KEYS.NOTIFICACOES_CANAIS, { ...notif, whatsapp_mensagem_boas_vindas: e.target.value })}
                />
              </div>
            </div>
            <SectionFooter tabId="notificacoes" />
          </>
        ) : null}

        {tab === "integracoes" ? (
          <>
            <div className="gm-cfg-section">
              <div className="gm-cfg-integ-card" style={{ marginBottom: 12, flexWrap: "wrap" }}>
                <div className="gm-cfg-integ-logo" style={{ background: "#F5F5F6" }}>
                  💳
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div className="gm-cfg-integ-name">Stripe</div>
                  <div className="gm-cfg-integ-desc">Chaves na aba Financeiro · Webhook para eventos de pagamento</div>
                  <div style={{ fontSize: 11, marginTop: 6, fontFamily: "monospace", wordBreak: "break-all" }}>
                    {integ.stripe_webhook_endpoint || import.meta.env.VITE_STRIPE_WEBHOOK_URL || "(defina VITE_STRIPE_WEBHOOK_URL ou guarde o endpoint em integracoes.detalhes)"}
                  </div>
                </div>
                <div className="gm-cfg-integ-status" style={{ flexWrap: "wrap" }}>
                  <button type="button" className="gm-cfg-btn-sm-p" onClick={() => window.open("https://dashboard.stripe.com/", "_blank")}>
                    Abrir Stripe Dashboard
                  </button>
                  <button
                    type="button"
                    className="btn-outline"
                    style={{ height: 28, fontSize: 11 }}
                    onClick={() => copyText(integ.stripe_webhook_endpoint || String(import.meta.env.VITE_STRIPE_WEBHOOK_URL || ""))}
                  >
                    Copiar webhook
                  </button>
                </div>
              </div>
              <div className="gm-cfg-field" style={{ marginBottom: 12 }}>
                <label className="gm-cfg-flabel">URL do webhook Stripe (armazenada)</label>
                <input
                  className="gm-cfg-finput"
                  value={integ.stripe_webhook_endpoint}
                  onChange={(e) => patchConfig(APP_CONFIG_KEYS.INTEGRACOES_DETALHES, { ...integ, stripe_webhook_endpoint: e.target.value })}
                />
              </div>
            </div>
            <div className="gm-cfg-section gm-cfg-section-bordered">
              <div className="gm-cfg-section-title">
                <span className="gm-cfg-sec-label">n8n / Zapier</span>
              </div>
              <div className="gm-cfg-field" style={{ marginBottom: 12 }}>
                <label className="gm-cfg-flabel">Webhook URL</label>
                <input
                  className="gm-cfg-finput"
                  value={integ.n8n_webhook_url}
                  onChange={(e) => patchConfig(APP_CONFIG_KEYS.INTEGRACOES_DETALHES, { ...integ, n8n_webhook_url: e.target.value })}
                />
              </div>
              <button type="button" className="btn-outline" style={{ height: 32, marginBottom: 12 }} onClick={() => copyText(integ.n8n_webhook_url)}>
                Copiar URL
              </button>
              <div style={{ fontSize: 12, color: "var(--t3)" }}>
                Últimas chamadas (local): {(integ.ultimas_chamadas ?? []).length === 0 ? "Nenhum registo." : integ.ultimas_chamadas.join(", ")}
              </div>
            </div>
            <SectionFooter tabId="integracoes" />
          </>
        ) : null}

        {tab === "historico" ? (
          <div className="gm-cfg-section" style={{ paddingBottom: 22 }}>
            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : hist.length === 0 ? (
              <p style={{ textAlign: "center", color: "var(--t3)", padding: 24 }}>Sem histórico de alterações.</p>
            ) : (
              hist.map((h) => (
                <div key={h.id} className="gm-cfg-hist-item">
                  <div className="gm-cfg-hist-ic">
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="#8A05BE" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M7 1.5L9 3.5 3.5 9H1.5V7L7 1.5Z" />
                    </svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--t1)" }}>
                      Campo <span style={{ fontFamily: "monospace" }}>{h.chave}</span> atualizado
                    </div>
                    <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 2 }}>
                      Versão {h.versao} · {h.alterado_em ? new Date(h.alterado_em).toLocaleString("pt-BR") : "—"}
                    </div>
                    <div style={{ fontSize: 11, marginTop: 6, wordBreak: "break-word" }}>
                      <span style={{ color: "var(--err)" }}>{h.valor_anterior == null ? "—" : JSON.stringify(h.valor_anterior)}</span>
                      {" → "}
                      <span style={{ color: "var(--ok)" }}>{JSON.stringify(h.valor_novo)}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}

        {tab === "perigo" ? (
          <>
            <div className="gm-cfg-danger-header">
              <span style={{ fontSize: 16 }}>▲</span> Zona de perigo · Ações irreversíveis
            </div>
            <div style={{ padding: "16px 18px 22px" }}>
              {(
                [
                  ["cache", "Limpar cache global", "Remove cache do browser e atualiza AppConfig.", "cache"] as const,
                  ["reset", "Resetar configurações para padrão", "Restaura todas as chaves para DEFAULT_APP_CONFIG.", "reset"],
                  ["maint", getBool(config, APP_CONFIG_KEYS.SISTEMA_MANUTENCAO) ? "Desativar modo manutenção" : "Ativar modo manutenção", "Flag em sistema.manutencao (consumir nas apps).", "maint"],
                  ["logs", "Excluir todos os logs antigos", "Remove logs_acoes com mais de 90 dias (requer RLS).", "logs"],
                ] as const
              ).map(([id, title, desc, kind]) => (
                <div key={id} className="gm-cfg-danger-item">
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--err)" }}>{title}</div>
                    <div style={{ fontSize: 12, color: "#B91C1C", marginTop: 2 }}>{desc}</div>
                  </div>
                  <button type="button" className="btn-ok" style={{ background: "var(--err-bg)", borderColor: "var(--err-bd)", color: "var(--err)" }} onClick={() => openDanger(kind)}>
                    Executar
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>

      <Dialog open={dangerOpen} onOpenChange={setDangerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar ação destrutiva</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Digite CONFIRMAR para prosseguir.</p>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="CONFIRMAR" autoComplete="off" />
          <DialogFooter>
            <button type="button" className="btn-outline" onClick={() => setDangerOpen(false)}>
              Cancelar
            </button>
            <button type="button" className="btn-primary" disabled={confirmText !== "CONFIRMAR" || saving} onClick={() => void runDanger()}>
              Executar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
