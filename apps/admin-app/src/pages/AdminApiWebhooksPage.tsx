import { useEffect, useMemo, useState } from "react";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  type ApiKey,
  type Webhook,
  type WebhookLog,
  WEBHOOK_EVENTS,
  generateApiKey,
  generateSecret,
  loadApiWebhooksSnapshot,
  loadApiWebhooksSnapshotFromBackend,
  maskApiKey,
  newApiKeyId,
  newWebhookId,
  newWebhookLogId,
  saveApiWebhooksSnapshot,
} from "@/services/adminApiWebhooksStore";

type ActiveTab = "api_keys" | "webhooks" | "logs";

function rel(iso: string | null | undefined): string {
  if (!iso) return "nunca";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.floor(diff / 60_000));
  if (mins < 60) return `há ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days} dia${days > 1 ? "s" : ""}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function tempoLabel(log: WebhookLog): string {
  if (log.tempoResposta >= 10000) return "timeout";
  return `${log.tempoResposta}ms`;
}

export default function AdminApiWebhooksPage() {
  const [snap, setSnap] = useState(() => loadApiWebhooksSnapshot());
  const [tab, setTab] = useState<ActiveTab>("api_keys");

  const [newKeyOpen, setNewKeyOpen] = useState(false);
  const [generatedOpen, setGeneratedOpen] = useState(false);
  const [generatedKey, setGeneratedKey] = useState("");
  const [copied, setCopied] = useState(false);
  const [newKeyForm, setNewKeyForm] = useState({
    nome: "",
    descricao: "",
    ambiente: "live" as "live" | "sandbox",
    escopos: ["read"] as ("read" | "write" | "admin")[],
    limitePorHora: 1000,
  });

  const [newWebhookOpen, setNewWebhookOpen] = useState(false);
  const [newWebhookForm, setNewWebhookForm] = useState({
    url: "",
    nome: "",
    eventos: ["lead.criado"] as string[],
    secret: "",
    ativoAoCriar: true,
  });

  const [testWebhookId, setTestWebhookId] = useState<string | null>(null);
  const [testEvent, setTestEvent] = useState<string>("lead.criado");
  const [testResponse, setTestResponse] = useState<{ code: number; ms: number; body: string } | null>(null);
  const [payloadModal, setPayloadModal] = useState<WebhookLog | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadApiWebhooksSnapshotFromBackend().then((remoteSnapshot) => {
      if (cancelled) return;
      setSnap(remoteSnapshot);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = (next: typeof snap) => {
    setSnap(next);
    saveApiWebhooksSnapshot(next);
  };

  const failed24h = useMemo(
    () => snap.logs.filter((log) => !log.sucesso && Date.now() - new Date(log.criadoEm).getTime() <= 24 * 60 * 60 * 1000).length,
    [snap.logs],
  );
  const chamadasHoje = useMemo(() => snap.apiKeys.reduce((sum, key) => sum + key.totalChamadasHoje, 0), [snap.apiKeys]);
  const webhooksAtivos = useMemo(() => snap.webhooks.filter((webhook) => webhook.status === "ativo").length, [snap.webhooks]);
  const apiKeysAtivas = useMemo(() => snap.apiKeys.filter((key) => key.status === "ativa").length, [snap.apiKeys]);

  const testWebhook = useMemo(() => snap.webhooks.find((item) => item.id === testWebhookId) ?? null, [snap.webhooks, testWebhookId]);

  const payloadPreview = useMemo(
    () =>
      JSON.stringify(
        {
          id: `evt_${Math.random().toString(36).slice(2, 10)}`,
          evento: testEvent,
          timestamp: new Date().toISOString(),
          data: { clienteId: "cl_1001", leadId: "ld_099", origem: "gestmiles-admin" },
        },
        null,
        2,
      ),
    [testEvent],
  );

  const createApiKey = () => {
    if (!newKeyForm.nome.trim() || newKeyForm.escopos.length === 0) return;
    const prefix = newKeyForm.ambiente === "live" ? "sk_live_gm_" : "sk_test_gm_";
    const full = generateApiKey(prefix);
    const nextKey: ApiKey = {
      id: newApiKeyId(),
      nome: newKeyForm.nome.trim(),
      descricao: newKeyForm.descricao.trim(),
      keyMascarada: maskApiKey(full),
      prefixo: prefix,
      ambiente: newKeyForm.ambiente,
      escopos: newKeyForm.escopos,
      status: "ativa",
      limitePorHora: Math.max(1, Number(newKeyForm.limitePorHora) || 1000),
      totalChamadasHoje: 0,
      ultimoUso: null,
      criadaEm: new Date().toISOString(),
      criadaPor: "admin",
    };
    persist({ ...snap, apiKeys: [nextKey, ...snap.apiKeys] });
    setGeneratedKey(full);
    setCopied(false);
    setNewKeyOpen(false);
    setGeneratedOpen(true);
    setNewKeyForm({ nome: "", descricao: "", ambiente: "live", escopos: ["read"], limitePorHora: 1000 });
  };

  const toggleScope = (scope: "read" | "write" | "admin") => {
    setNewKeyForm((current) => {
      const has = current.escopos.includes(scope);
      const next = has ? current.escopos.filter((item) => item !== scope) : [...current.escopos, scope];
      return { ...current, escopos: next };
    });
  };

  const deleteApiKey = (key: ApiKey) => {
    const confirmed = window.confirm(`Apagar a API key "${key.nome}"? Essa acao nao pode ser desfeita.`);
    if (!confirmed) return;
    persist({ ...snap, apiKeys: snap.apiKeys.filter((item) => item.id !== key.id) });
  };

  const addWebhook = () => {
    if (!newWebhookForm.url.trim() || !/^https?:\/\//.test(newWebhookForm.url.trim()) || newWebhookForm.eventos.length === 0) return;
    const nextWebhook: Webhook = {
      id: newWebhookId(),
      url: newWebhookForm.url.trim(),
      nome: newWebhookForm.nome.trim() || "Webhook custom",
      eventos: newWebhookForm.eventos,
      status: newWebhookForm.ativoAoCriar ? "ativo" : "inativo",
      secret: newWebhookForm.secret.trim() || undefined,
      totalDisparosHoje: 0,
      taxaSucesso: 100,
    };
    persist({ ...snap, webhooks: [nextWebhook, ...snap.webhooks] });
    setNewWebhookOpen(false);
    setNewWebhookForm({ url: "", nome: "", eventos: ["lead.criado"], secret: "", ativoAoCriar: true });
  };

  const testRun = () => {
    if (!testWebhook) return;
    const success = Math.random() > 0.3;
    const code = success ? 200 : 503;
    const ms = success ? 80 + Math.floor(Math.random() * 150) : 1100 + Math.floor(Math.random() * 3000);
    const body = success ? JSON.stringify({ ok: true, received: true }, null, 2) : JSON.stringify({ ok: false, error: "timeout" }, null, 2);
    setTestResponse({ code, ms, body });
    const nextLog: WebhookLog = {
      id: newWebhookLogId(),
      webhookId: testWebhook.id,
      evento: testEvent,
      statusCode: code,
      tempoResposta: ms,
      tentativa: success ? 1 : 3,
      maxTentativas: success ? 1 : 3,
      payload: payloadPreview,
      response: body,
      criadoEm: new Date().toISOString(),
      sucesso: success,
    };
    persist({ ...snap, logs: [nextLog, ...snap.logs] });
  };

  return (
    <div className="gm-aw-page">
      <div className="gm-aw-page-hdr">
        <div>
          <div className="gm-aw-page-title">API Keys & Webhooks</div>
          <div className="gm-aw-page-sub">Gerencie integracoes externas, chaves de acesso e notificacoes de eventos</div>
        </div>
        <button className="gm-aw-btn gm-aw-btn-o" type="button">
          Ver documentacao
        </button>
      </div>

      <div className="gm-aw-kpi4">
        <div className="gm-aw-kpi pu"><div className="gm-aw-kl">API Keys ativas</div><div className="gm-aw-kv">{apiKeysAtivas}</div><div className="gm-aw-ks">chaves em uso</div></div>
        <div className="gm-aw-kpi bl"><div className="gm-aw-kl">Chamadas hoje</div><div className="gm-aw-kv">{chamadasHoje.toLocaleString("pt-BR")}</div><div className="gm-aw-ks">requisicoes a API</div><div className="gm-aw-kd gm-aw-kd-up">↑ +312 vs ontem</div></div>
        <div className="gm-aw-kpi gr"><div className="gm-aw-kl">Webhooks ativos</div><div className="gm-aw-kv">{webhooksAtivos}</div><div className="gm-aw-ks">endpoints configurados</div></div>
        <div className="gm-aw-kpi re"><div className="gm-aw-kl">Falhas webhook 24h</div><div className="gm-aw-kv text-[#DC2626]">{failed24h}</div><div className="gm-aw-ks">entregas com erro</div><div className="gm-aw-kd gm-aw-kd-dn">⚠ Requer atencao</div></div>
      </div>

      <div className="gm-aw-tabs-card">
        <div className="gm-aw-tabs">
          <button className={cn("gm-aw-tab", tab === "api_keys" && "active")} onClick={() => setTab("api_keys")}>API Keys <span className="gm-aw-tab-cnt">{snap.apiKeys.length}</span></button>
          <button className={cn("gm-aw-tab", tab === "webhooks" && "active")} onClick={() => setTab("webhooks")}>Webhooks <span className="gm-aw-tab-cnt">{snap.webhooks.length}</span></button>
          <button className={cn("gm-aw-tab", tab === "logs" && "active")} onClick={() => setTab("logs")}>Log de entregas <span className="gm-aw-tab-cnt gm-aw-tab-cnt-err">{failed24h} erros</span></button>
        </div>

        {tab === "api_keys" ? (
          <>
            <div className="gm-aw-sec-hdr">
              <div>
                <div className="gm-aw-sec-title">Chaves de API</div>
                <div className="gm-aw-sec-sub">Use as chaves para autenticar via <code>Authorization: Bearer sk_live_...</code></div>
              </div>
              <button className="gm-aw-btn gm-aw-btn-p sm" onClick={() => setNewKeyOpen(true)}>Gerar nova chave</button>
            </div>
            {snap.apiKeys.map((key) => (
              <div key={key.id} className={cn("gm-aw-key-card", key.status === "revogada" && "revogada")}>
                <div className="gm-aw-key-top">
                  <div><div className="gm-aw-key-name">{key.nome}</div><div className="gm-aw-key-desc">{key.descricao}</div></div>
                  <div className="gm-aw-key-right gm-aw-wh-actions">
                    <span className={cn("gm-aw-badge", key.status === "ativa" ? "b-ok" : "b-err")}>{key.status === "ativa" ? "Ativa" : "Revogada"}</span>
                    <button className="gm-aw-btn-sm gm-aw-btn-sm-warn" onClick={() => deleteApiKey(key)}>Apagar</button>
                  </div>
                </div>
                <div className="gm-aw-key-value"><span className="gm-aw-key-code">{key.keyMascarada}</span></div>
                <div className="gm-aw-key-meta">
                  <span>Criada em <strong>{formatDate(key.criadaEm)}</strong></span><span>·</span><span>Ultimo uso: <strong>{rel(key.ultimoUso)}</strong></span><span>·</span><span>{key.totalChamadasHoje} chamadas hoje</span><span>·</span>
                  {key.escopos.map((scope) => <span key={scope} className={cn("gm-aw-scope-pill", scope)}>{scope}</span>)}
                </div>
              </div>
            ))}
          </>
        ) : null}

        {tab === "webhooks" ? (
          <>
            <div className="gm-aw-sec-hdr">
              <div><div className="gm-aw-sec-title">Webhooks</div><div className="gm-aw-sec-sub">Receba notificacoes em tempo real quando eventos ocorrem na plataforma</div></div>
              <button className="gm-aw-btn gm-aw-btn-p sm" onClick={() => setNewWebhookOpen(true)}>Adicionar endpoint</button>
            </div>
            {snap.webhooks.map((wh) => (
              <div key={wh.id} className={cn("gm-aw-wh-card", wh.status === "com_falhas" && "falhas")}>
                <div className="gm-aw-wh-top">
                  <div><div className="gm-aw-wh-url">{wh.url}</div><div className="gm-aw-wh-sub">{wh.nome}</div></div>
                  <div className="gm-aw-wh-actions">
                    <span className={cn("gm-aw-badge", wh.status === "ativo" ? "b-ok" : wh.status === "com_falhas" ? "b-warn" : "b-off")}>{wh.status === "ativo" ? "Ativo" : wh.status === "com_falhas" ? "Com falhas" : "Inativo"}</span>
                    <button className="gm-aw-btn-sm gm-aw-btn-sm-p" onClick={() => { setTestWebhookId(wh.id); setTestEvent(wh.eventos[0] ?? "lead.criado"); setTestResponse(null); }}>Testar</button>
                  </div>
                </div>
                <div className="gm-aw-wh-events">{wh.eventos.map((ev) => <span key={ev} className="gm-aw-ev-pill">{ev}</span>)}</div>
                <div className="gm-aw-wh-stats"><div>Ultimo disparo: <strong>{rel(wh.ultimaFalha ?? wh.ultimoDisparo)}</strong></div><span>·</span><div>{wh.totalDisparosHoje} disparos hoje</div><span>·</span><div className="gm-aw-sr-wrap"><div className="gm-aw-sr-bar"><div className={cn("gm-aw-sr-fill", wh.taxaSucesso > 90 ? "ok" : wh.taxaSucesso >= 60 ? "warn" : "err")} style={{ width: `${wh.taxaSucesso}%` }} /></div><span>{wh.taxaSucesso}% sucesso</span></div></div>
              </div>
            ))}
          </>
        ) : null}

        {tab === "logs" ? (
          <table className="gm-aw-table">
            <thead><tr><th>Horario</th><th>Evento</th><th>Endpoint</th><th>Codigo</th><th>Tempo</th><th>Tentativas</th><th>Acao</th></tr></thead>
            <tbody>
              {snap.logs.map((log) => {
                const wh = snap.webhooks.find((item) => item.id === log.webhookId);
                return (
                  <tr key={log.id} className={!log.sucesso ? "fail" : ""}>
                    <td className={cn("mono", !log.sucesso && "err")}>{formatTime(log.criadoEm)}</td>
                    <td className="event">{log.evento}</td>
                    <td className="endpoint">{wh?.nome ?? "webhook"}</td>
                    <td><span className={cn("code-badge", log.statusCode >= 500 ? "code-5xx" : log.statusCode >= 400 ? "code-4xx" : "code-2xx")}>{log.statusCode}</span></td>
                    <td className={cn(log.tempoResposta < 200 ? "ok" : log.tempoResposta < 1000 ? "warn" : "err")}>{tempoLabel(log)}</td>
                    <td className={cn(log.tentativa === log.maxTentativas && !log.sucesso && "err")}>{log.tentativa} / {log.maxTentativas}{log.tentativa === log.maxTentativas && !log.sucesso ? " ❌" : ""}</td>
                    <td>{log.sucesso ? <button className="gm-aw-btn-sm gm-aw-btn-sm-o" onClick={() => setPayloadModal(log)}>Ver payload</button> : <div className="actions"><button className="gm-aw-btn-sm gm-aw-btn-sm-warn">Reenviar</button><button className="gm-aw-btn-sm gm-aw-btn-sm-o" onClick={() => setPayloadModal(log)}>Payload</button></div>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </div>

      <Dialog open={newKeyOpen} onOpenChange={setNewKeyOpen}>
        <DialogContent className="max-w-[460px]">
          <DialogHeader><DialogTitle>Gerar nova API Key</DialogTitle></DialogHeader>
          <div className="gm-aw-form">
            <label>Nome / identificacao*</label><input value={newKeyForm.nome} onChange={(e) => setNewKeyForm((v) => ({ ...v, nome: e.target.value }))} />
            <label>Descricao</label><input value={newKeyForm.descricao} onChange={(e) => setNewKeyForm((v) => ({ ...v, descricao: e.target.value }))} />
            <label>Ambiente</label><select value={newKeyForm.ambiente} onChange={(e) => setNewKeyForm((v) => ({ ...v, ambiente: e.target.value as "live" | "sandbox" }))}><option value="live">Live</option><option value="sandbox">Sandbox</option></select>
            <label>Escopos</label>
            <div className="gm-aw-events-grid">
              {(["read", "write", "admin"] as const).map((scope) => <button key={scope} className={cn("gm-aw-ev-check", newKeyForm.escopos.includes(scope) && "checked")} onClick={() => toggleScope(scope)}>{scope}</button>)}
            </div>
            <label>Limite de requisicoes/hora</label><input type="number" value={newKeyForm.limitePorHora} onChange={(e) => setNewKeyForm((v) => ({ ...v, limitePorHora: Number(e.target.value) }))} />
          </div>
          <DialogFooter><button className="gm-aw-btn gm-aw-btn-o" onClick={() => setNewKeyOpen(false)}>Cancelar</button><button className="gm-aw-btn gm-aw-btn-p" onClick={createApiKey}>Gerar chave</button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={generatedOpen} onOpenChange={setGeneratedOpen}>
        <DialogContent className="max-w-[460px]">
          <DialogHeader><DialogTitle>Chave gerada</DialogTitle></DialogHeader>
          <div className="gm-aw-generated-alert">Copie a chave agora. Ela nao sera exibida novamente.</div>
          <div className="gm-aw-generated-row"><code>{generatedKey}</code><button className={cn("gm-aw-btn-sm", copied ? "gm-aw-btn-sm-ok" : "gm-aw-btn-sm-p")} onClick={async () => { await navigator.clipboard.writeText(generatedKey); setCopied(true); }}>{copied ? "Copiado!" : "Copiar"}</button></div>
          <DialogFooter><button className="gm-aw-btn gm-aw-btn-p" onClick={() => setGeneratedOpen(false)}>Entendi, fechar</button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newWebhookOpen} onOpenChange={setNewWebhookOpen}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader><DialogTitle>Adicionar Endpoint Webhook</DialogTitle></DialogHeader>
          <div className="gm-aw-form">
            <label>URL do endpoint*</label><input value={newWebhookForm.url} onChange={(e) => setNewWebhookForm((v) => ({ ...v, url: e.target.value }))} placeholder="https://..." />
            <label>Nome/descricao</label><input value={newWebhookForm.nome} onChange={(e) => setNewWebhookForm((v) => ({ ...v, nome: e.target.value }))} />
            <label>Eventos a escutar</label>
            <div className="gm-aw-events-grid">
              {WEBHOOK_EVENTS.map((ev) => <button key={ev} className={cn("gm-aw-ev-check", newWebhookForm.eventos.includes(ev) && "checked")} onClick={() => setNewWebhookForm((v) => ({ ...v, eventos: v.eventos.includes(ev) ? v.eventos.filter((e) => e !== ev) : [...v.eventos, ev] }))}>{ev}</button>)}
            </div>
            <label>Segredo (secret) opcional</label>
            <div className="gm-aw-row"><input value={newWebhookForm.secret} onChange={(e) => setNewWebhookForm((v) => ({ ...v, secret: e.target.value }))} /><button className="gm-aw-btn-sm gm-aw-btn-sm-o" onClick={() => setNewWebhookForm((v) => ({ ...v, secret: generateSecret() }))}>Gerar</button></div>
            <div className="gm-aw-toggle-row"><span>Ativo ao criar</span><button className={cn("gm-aw-toggle", newWebhookForm.ativoAoCriar ? "on" : "off")} onClick={() => setNewWebhookForm((v) => ({ ...v, ativoAoCriar: !v.ativoAoCriar }))} /></div>
          </div>
          <DialogFooter><button className="gm-aw-btn gm-aw-btn-o" onClick={() => setNewWebhookOpen(false)}>Cancelar</button><button className="gm-aw-btn gm-aw-btn-p" onClick={addWebhook}>Adicionar webhook</button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(testWebhook)} onOpenChange={(o) => !o && setTestWebhookId(null)}>
        <DialogContent className="max-w-[520px] bg-[#0D0D12] text-white border-[#252530]">
          <DialogHeader><DialogTitle className="text-white">Testar: {testWebhook?.url}</DialogTitle></DialogHeader>
          <div className="gm-aw-form dark">
            <label>Evento</label><select value={testEvent} onChange={(e) => setTestEvent(e.target.value)}>{(testWebhook?.eventos ?? []).map((ev) => <option key={ev} value={ev}>{ev}</option>)}</select>
            <label>Payload</label><textarea className="gm-aw-dark-payload" value={payloadPreview} readOnly />
            <button className="gm-aw-btn gm-aw-btn-sm-ok" onClick={testRun}>Disparar teste</button>
            {testResponse ? <div className={cn("gm-aw-test-response", testResponse.code === 200 ? "ok" : "err")}><div>Status {testResponse.code} • {testResponse.ms}ms</div><pre>{testResponse.body}</pre></div> : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(payloadModal)} onOpenChange={(o) => !o && setPayloadModal(null)}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader><DialogTitle>Payload do evento</DialogTitle></DialogHeader>
          <pre className="gm-aw-payload">{payloadModal?.payload}</pre>
          {payloadModal?.response ? <pre className="gm-aw-payload">{payloadModal.response}</pre> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
