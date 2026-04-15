import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { useAdminEquipe } from "@/context/AdminEquipeContext";
import { cn } from "@/lib/utils";
import {
  type CanalEnvio,
  type ComunicacoesState,
  type Mensagem,
  type TemplateCom,
  SEGMENTOS,
  computeKpis,
  estimateRecipients,
  loadComunicacoesState,
  newMensagemId,
  newTemplateId,
  saveComunicacoesState,
} from "@/services/adminComunicacoesStore";

const PLACEHOLDER_CORPO = `Olá {nome},

Temos novidades importantes para compartilhar...

Abraços,
Equipe GestMiles`;

function formatRelative(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / (86400 * 1000));
  if (days <= 0) return "hoje";
  if (days === 1) return "há 1 dia";
  return `há ${days} dias`;
}

function segmentLabel(keys: string[]): string {
  if (keys.includes("todos")) return "Todos os usuários";
  return keys
    .map((k) => SEGMENTOS.find((s) => s.key === k)?.label ?? k)
    .filter(Boolean)
    .join(" · ");
}

function applyVars(text: string, nome: string, equipe: string, plano: string): string {
  return text.replace(/\{nome\}/g, nome).replace(/\{equipe\}/g, equipe).replace(/\{plano\}/g, plano);
}

export default function AdminComunicacoesPage() {
  const { user } = useAdminAuth();
  const { equipesGrupoGestaoRaiz } = useAdminEquipe();
  const adminEmail = user?.email ?? "rick@gestmiles.com.br";
  const previewNome = "João";
  const previewEquipe = "Equipe do João Carvalho";
  const previewPlano = "Pro";

  const [state, setState] = useState<ComunicacoesState>(() => loadComunicacoesState());
  const [canal, setCanal] = useState<CanalEnvio>("email");
  const [segmentos, setSegmentos] = useState<Set<string>>(() => new Set(["todos"]));
  const [equipeEspecificaId, setEquipeEspecificaId] = useState<string | null>(null);
  const [assunto, setAssunto] = useState("");
  const [corpo, setCorpo] = useState("");
  const [schedule, setSchedule] = useState<"agora" | "agendar">("agora");
  const [agendadoLocal, setAgendadoLocal] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    d.setMinutes(0, 0, 0);
    return d.toISOString().slice(0, 16);
  });

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [createTplOpen, setCreateTplOpen] = useState(false);
  const [historicoOpen, setHistoricoOpen] = useState(false);
  const [tplDraft, setTplDraft] = useState<Partial<TemplateCom>>({ canal: "email", emoji: "📌" });

  const persist = useCallback((next: ComunicacoesState) => {
    setState(next);
    saveComunicacoesState(next);
  }, []);

  useEffect(() => {
    setState(loadComunicacoesState());
  }, []);

  const kpis = useMemo(() => computeKpis(state.mensagens), [state.mensagens]);

  const toggleSegment = (key: string) => {
    setSegmentos((prev) => {
      const next = new Set(prev);
      if (key === "todos") return new Set(["todos"]);
      next.delete("todos");
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (next.size === 0) next.add("todos");
      return next;
    });
    if (key !== "equipe_especifica") return;
  };

  const destCount = estimateRecipients([...segmentos], equipeEspecificaId);
  const showAssunto = canal === "email" || canal === "ambos";
  const charLen = corpo.length;
  const charClass = charLen > 1500 ? "gm-com-char--err" : charLen > 1200 ? "gm-com-char--warn" : "";

  const previewChannels = () => {
    const n = destCount;
    const parts: { emoji: string; label: string }[] = [];
    if (canal === "email" || canal === "ambos") parts.push({ emoji: "📧", label: `E-mail — ${n} envios` });
    if (canal === "whatsapp" || canal === "ambos") {
      const wn = canal === "ambos" ? Math.min(n, 26) : n;
      parts.push({ emoji: "💬", label: `WhatsApp — ${wn} envios` });
    }
    return parts;
  };

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const applyTemplate = (t: TemplateCom) => {
    setCanal(t.canal);
    setAssunto(t.assunto ?? "");
    setCorpo(t.corpo);
  };

  const openConfirm = () => {
    if (!corpo.trim()) return;
    if (showAssunto && !assunto.trim()) return;
    if (segmentos.has("equipe_especifica") && !equipeEspecificaId) return;
    if (destCount <= 0) return;
    setConfirmOpen(true);
  };

  const submitSend = () => {
    const cur = loadComunicacoesState();
    const count = estimateRecipients([...segmentos], equipeEspecificaId);
    const titulo = assunto.trim() || corpo.trim().slice(0, 48).replace(/\n/g, " ");
    const agendadoIso =
      schedule === "agendar" && agendadoLocal ? new Date(agendadoLocal).toISOString() : undefined;
    const enviadoEm = schedule === "agora" ? new Date().toISOString() : undefined;

    const msg: Mensagem = {
      id: newMensagemId(),
      titulo,
      canal,
      assunto: showAssunto ? assunto : undefined,
      corpo,
      segmentos: [...segmentos],
      totalDestinatarios: count,
      status: schedule === "agendar" ? "agendado" : "enviado",
      agendadoPara: agendadoIso,
      enviadoEm,
      taxaAbertura: schedule === "agora" && canal !== "whatsapp" ? 62 + Math.floor(Math.random() * 8) : undefined,
      taxaCliques: schedule === "agora" && canal !== "whatsapp" ? 8 + Math.floor(Math.random() * 5) : undefined,
      totalEntregues:
        schedule === "agora" && (canal === "whatsapp" || canal === "ambos")
          ? Math.floor(count * (0.95 + Math.random() * 0.04))
          : undefined,
      respostas:
        schedule === "agora" && (canal === "whatsapp" || canal === "ambos")
          ? Math.max(0, Math.floor(count * 0.03))
          : undefined,
    };

    persist({ ...cur, mensagens: [msg, ...cur.mensagens] });
    setConfirmOpen(false);
    setAssunto("");
    setCorpo("");
    setSegmentos(new Set(["todos"]));
    setSchedule("agora");
  };

  const saveNewTemplate = () => {
    if (!tplDraft.nome?.trim() || !tplDraft.corpo?.trim()) return;
    const cur = loadComunicacoesState();
    const t: TemplateCom = {
      id: newTemplateId(),
      nome: tplDraft.nome!.trim(),
      descricao: tplDraft.descricao?.trim() ?? "",
      canal: tplDraft.canal ?? "email",
      assunto: tplDraft.assunto,
      corpo: tplDraft.corpo!.trim(),
      emoji: tplDraft.emoji ?? "📌",
      categoria: "custom",
    };
    persist({ ...cur, templates: [...cur.templates, t] });
    setCreateTplOpen(false);
    setTplDraft({ canal: "email", emoji: "📌" });
  };

  const historicoRecente = state.mensagens.slice(0, 8);
  const tplBg = (id: string, i: number) => {
    const map: Record<string, string> = {
      "tpl-1": "var(--ok-bg)",
      "tpl-2": "var(--warn-bg)",
      "tpl-3": "#F3E8FF",
      "tpl-4": "var(--err-bg)",
      "tpl-5": "#EFF6FF",
    };
    return map[id] ?? (i % 2 === 0 ? "var(--ps)" : "var(--info-bg)");
  };

  return (
    <div className="gm-com-page">
      <div className="gm-com-page-hdr">
        <div>
          <div className="gm-com-page-title">Comunicações</div>
          <div className="gm-com-page-sub">Envie mensagens em massa por e-mail ou WhatsApp para usuários e equipes</div>
        </div>
        <div className="gm-com-page-actions">
          <button type="button" className="gm-com-btn gm-com-btn-o" onClick={() => setHistoricoOpen(true)}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
              <rect x="1.5" y="1.5" width="10" height="10" rx="2" />
              <line x1="4.5" y1="5" x2="8.5" y2="5" />
              <line x1="4.5" y1="7.5" x2="7" y2="7.5" />
            </svg>
            Histórico
          </button>
          <button type="button" className="gm-com-btn gm-com-btn-o" onClick={() => scrollTo("com-templates")}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
              <rect x="1.5" y="1.5" width="10" height="10" rx="2" />
              <line x1="4" y1="4.5" x2="9" y2="4.5" />
              <line x1="4" y1="7" x2="7" y2="7" />
            </svg>
            Templates
          </button>
        </div>
      </div>

      <div className="gm-com-kpi4">
        <div className="gm-com-kpi gm-com-kpi--pu">
          <div className="gm-com-kl">Enviados este mês</div>
          <div className="gm-com-kv">{kpis.enviadosMes.toLocaleString("pt-BR")}</div>
          <div className="gm-com-ks">mensagens totais</div>
          <div className="gm-com-kd gm-com-kd-up">
            ↑ {kpis.deltaVsAnterior >= 0 ? "+" : ""}
            {kpis.deltaVsAnterior.toLocaleString("pt-BR")} vs mês anterior
          </div>
        </div>
        <div className="gm-com-kpi gm-com-kpi--gr">
          <div className="gm-com-kl">Taxa de abertura (e-mail)</div>
          <div
            className={cn(
              "gm-com-kv",
              kpis.aberturaColor === "ok" && "text-[#16A34A]",
              kpis.aberturaColor === "warn" && "text-[#D97706]",
              kpis.aberturaColor === "err" && "text-[#DC2626]",
            )}
          >
            {kpis.taxaAberturaPct.toFixed(1).replace(".", ",")}%
          </div>
          <div className="gm-com-ks">acima da média do setor (22%)</div>
        </div>
        <div className="gm-com-kpi gm-com-kpi--wa">
          <div className="gm-com-kl">Entrega WhatsApp</div>
          <div className="gm-com-kv text-[#16A34A]">{kpis.entregaWaPct.toFixed(1).replace(".", ",")}%</div>
          <div className="gm-com-ks">de todas as mensagens WA</div>
        </div>
        <div className="gm-com-kpi gm-com-kpi--bl">
          <div className="gm-com-kl">Agendadas</div>
          <div className="gm-com-kv">{kpis.agendadas}</div>
          <div className="gm-com-ks">mensagens na fila</div>
        </div>
      </div>

      <div className="gm-com-g21">
        <div className="gm-com-card">
          <div className="gm-com-card-h">
            <div className="gm-com-card-ti">
              <div className="gm-com-card-ic gm-com-card-ic--pu">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#8A05BE" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                  <path d="M12 1L1 5l4.5 2.5L8 12l4-11Z" />
                  <line x1="5.5" y1="7.5" x2="8.5" y2="4.5" />
                </svg>
              </div>
              Nova mensagem
            </div>
            <button type="button" className="text-[11.5px] font-semibold text-[var(--p)] hover:underline" onClick={() => scrollTo("com-templates")}>
              Usar template →
            </button>
          </div>

          <div className="gm-com-card-body">
            <div className="gm-com-field">
              <span className="gm-com-flabel">Canal de envio</span>
              <div className="gm-com-channel-selector">
                <button
                  type="button"
                  className={cn("gm-com-ch-btn", canal === "email" && "gm-com-ch-btn--email")}
                  onClick={() => setCanal("email")}
                >
                  <span className="gm-com-ch-icon" aria-hidden>
                    📧
                  </span>
                  <span className="gm-com-ch-label">E-mail</span>
                </button>
                <button
                  type="button"
                  className={cn("gm-com-ch-btn", canal === "whatsapp" && "gm-com-ch-btn--wa")}
                  onClick={() => setCanal("whatsapp")}
                >
                  <span className="gm-com-ch-icon" aria-hidden>
                    💬
                  </span>
                  <span className="gm-com-ch-label">WhatsApp</span>
                </button>
                <button
                  type="button"
                  className={cn("gm-com-ch-btn", canal === "ambos" && "gm-com-ch-btn--both")}
                  onClick={() => setCanal("ambos")}
                >
                  <span className="gm-com-ch-icon" aria-hidden>
                    ⚡
                  </span>
                  <span className="gm-com-ch-label">Ambos</span>
                </button>
              </div>
            </div>

            <div className="gm-com-field">
              <span className="gm-com-flabel">
                Destinatários{" "}
                <span className="text-[10px] font-medium normal-case text-[var(--t3)]">(selecione um ou mais segmentos)</span>
              </span>
              <div className="gm-com-recipient-chips">
                {SEGMENTOS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    className={cn("gm-com-rchip", segmentos.has(s.key) && "gm-com-rchip--selected")}
                    onClick={() => toggleSegment(s.key)}
                  >
                    {s.key === "equipe_especifica" ? (
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                        <line x1="5.5" y1="1" x2="5.5" y2="10" />
                        <line x1="1" y1="5.5" x2="10" y2="5.5" />
                      </svg>
                    ) : (
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                        <circle cx="5.5" cy="3.5" r="2.5" />
                        <path d="M1 10c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" />
                      </svg>
                    )}
                    {s.label}
                    <span className="gm-com-rchip-count">{s.key === "equipe_especifica" ? (equipeEspecificaId ? "24" : "—") : s.count}</span>
                  </button>
                ))}
              </div>
              {segmentos.has("equipe_especifica") ? (
                <div className="mt-3 max-w-md">
                  <Label className="text-[11px] text-[var(--t3)]">Equipe</Label>
                  <Select value={equipeEspecificaId ?? ""} onValueChange={(v) => setEquipeEspecificaId(v || null)}>
                    <SelectTrigger className="h-10 rounded-[9px] border-[1.5px] border-[var(--bd)]">
                      <SelectValue placeholder="Selecione uma equipe" />
                    </SelectTrigger>
                    <SelectContent>
                      {equipesGrupoGestaoRaiz.map((eq) => (
                        <SelectItem key={eq.id} value={eq.id}>
                          {eq.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>

            {showAssunto ? (
              <div className="gm-com-field">
                <span className="gm-com-flabel">Assunto do e-mail</span>
                <input
                  className="gm-com-finput"
                  placeholder="Ex: Novidades da plataforma GestMiles 🚀"
                  value={assunto}
                  onChange={(e) => setAssunto(e.target.value)}
                />
              </div>
            ) : null}

            <div className="gm-com-field">
              <span className="gm-com-flabel">Mensagem</span>
              <Textarea
                className="gm-com-ftextarea min-h-[120px] rounded-[9px] border-[1.5px] border-[var(--bd)] px-3 py-3 text-[13px] leading-relaxed"
                placeholder={PLACEHOLDER_CORPO}
                value={corpo}
                onChange={(e) => setCorpo(e.target.value)}
              />
              <div className="mt-1 flex items-center justify-between gap-2">
                <div className="text-[11px] text-[var(--t3)]">
                  Variáveis:{" "}
                  <code className="rounded px-1.5 py-0.5 font-mono text-[10.5px] text-[var(--t3)]" style={{ background: "#F5F5F6" }}>
                    {"{nome}"}
                  </code>{" "}
                  <code className="rounded px-1.5 py-0.5 font-mono text-[10.5px] text-[var(--t3)]" style={{ background: "#F5F5F6" }}>
                    {"{equipe}"}
                  </code>{" "}
                  <code className="rounded px-1.5 py-0.5 font-mono text-[10.5px] text-[var(--t3)]" style={{ background: "#F5F5F6" }}>
                    {"{plano}"}
                  </code>
                </div>
                <div className={cn("gm-com-char-counter", charClass)}>
                  {charLen} / 1600
                </div>
              </div>
            </div>

            <div className="gm-com-field">
              <span className="gm-com-flabel">Quando enviar</span>
              <div className="gm-com-schedule-toggle">
                <button type="button" className={cn("gm-com-sch-opt", schedule === "agora" && "gm-com-sch-opt--active")} onClick={() => setSchedule("agora")}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <path d="M2 6a4 4 0 0 1 8 0M10 6a4 4 0 0 1-8 0" />
                  </svg>
                  Enviar agora
                </button>
                <button
                  type="button"
                  className={cn("gm-com-sch-opt", schedule === "agendar" && "gm-com-sch-opt--active")}
                  onClick={() => setSchedule("agendar")}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <rect x="1.5" y="2" width="9" height="9" rx="1.5" />
                    <line x1="4" y1="1" x2="4" y2="3.5" />
                    <line x1="8" y1="1" x2="8" y2="3.5" />
                    <line x1="1.5" y1="5" x2="10.5" y2="5" />
                  </svg>
                  Agendar
                </button>
              </div>
              {schedule === "agendar" ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    type="datetime-local"
                    className="gm-com-finput max-w-[240px]"
                    value={agendadoLocal}
                    onChange={(e) => setAgendadoLocal(e.target.value)}
                  />
                </div>
              ) : null}
            </div>

            <div className="gm-com-preview-box">
              <div className="gm-com-preview-label">Prévia do envio</div>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <div className="gm-com-preview-num">{destCount}</div>
                  <div className="gm-com-preview-sub">destinatários selecionados</div>
                </div>
                <div className="min-w-[120px] flex-1" />
                <div className="text-right">
                  <div className="mb-1 text-[10px] text-white/40">{previewEquipe}</div>
                  <div className="text-[12px] font-bold text-white/80">{adminEmail}</div>
                </div>
              </div>
              <div className="gm-com-preview-channels">
                {previewChannels().map((p) => (
                  <span key={p.label} className="gm-com-pch">
                    {p.emoji} {p.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-3.5 flex gap-2">
              <button type="button" className="gm-com-btn gm-com-btn-o flex-1" onClick={() => setPreviewOpen(true)}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                  <path d="M10 7.5V11H2V3h3.5" />
                  <path d="M8 1h4v4" />
                  <line x1="5.5" y1="7.5" x2="12" y2="1" />
                </svg>
                Pré-visualizar
              </button>
              <button type="button" className="gm-com-btn gm-com-btn-p flex-[2]" onClick={openConfirm}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                  <path d="M12 1L1 5l4.5 2.5L8 12l4-11Z" />
                </svg>
                Enviar para {destCount.toLocaleString("pt-BR")} pessoas
              </button>
            </div>
          </div>
        </div>

        <div className="gm-com-right-col">
          <div className="gm-com-card" id="com-templates">
            <div className="gm-com-card-h">
              <div className="gm-com-card-ti">
                <div className="gm-com-card-ic gm-com-card-ic--pu">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#8A05BE" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <rect x="2" y="1.5" width="9" height="10" rx="1.5" />
                    <line x1="4.5" y1="5" x2="8.5" y2="5" />
                    <line x1="4.5" y1="7.5" x2="7" y2="7.5" />
                  </svg>
                </div>
                Templates prontos
              </div>
              <button type="button" className="gm-com-btn-sm gm-com-btn-sm-p text-[11px]" onClick={() => setCreateTplOpen(true)}>
                + Criar
              </button>
            </div>
            {state.templates.map((t, i) => (
              <div key={t.id} className="gm-com-tpl-card group">
                <div className="gm-com-tpl-emoji" style={{ background: tplBg(t.id, i) }}>
                  {t.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="gm-com-tpl-name">{t.nome}</div>
                  <div className="gm-com-tpl-desc">{t.descricao}</div>
                </div>
                <button type="button" className="gm-com-btn-sm gm-com-btn-sm-p gm-com-tpl-use text-[11px]" onClick={() => applyTemplate(t)}>
                  Usar
                </button>
              </div>
            ))}
          </div>

          <div className="gm-com-card" id="com-historico">
            <div className="gm-com-card-h">
              <div className="gm-com-card-ti">
                <div className="gm-com-card-ic gm-com-card-ic--ok">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <circle cx="6.5" cy="6.5" r="5.5" />
                    <polyline points="3,6.5 5.5,9 10,4" />
                  </svg>
                </div>
                Últimos envios
              </div>
              <button type="button" className="text-[11.5px] font-semibold text-[var(--p)] hover:underline" onClick={() => setHistoricoOpen(true)}>
                Ver todos →
              </button>
            </div>
            {historicoRecente.map((m) => (
              <HistRow key={m.id} m={m} />
            ))}
          </div>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="gm-com-dialog max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Confirmar envio</DialogTitle>
          </DialogHeader>
          <div className="gm-com-preview-box mb-3">
            <div className="gm-com-preview-label">Resumo</div>
            <div className="text-2xl font-black text-white">{destCount.toLocaleString("pt-BR")}</div>
            <div className="text-[11px] text-white/50">
              {canal === "email" ? "E-mail" : canal === "whatsapp" ? "WhatsApp" : "E-mail + WhatsApp"} · {segmentLabel([...segmentos])}
            </div>
          </div>
          <div className="rounded-lg border border-[var(--warn-bd)] bg-[#FFFBEB] px-3 py-2 text-[12px] text-[#92400E]">
            Esta ação enviará {destCount.toLocaleString("pt-BR")} mensagens. Não pode ser desfeita.
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" className="bg-[#8A05BE] hover:bg-[#6A00A3]" onClick={submitSend}>
              {schedule === "agendar" ? "Agendar" : "Enviar agora"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[90vh] max-w-[520px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pré-visualização</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="email" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="email">E-mail</TabsTrigger>
              <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
            </TabsList>
            <TabsContent value="email" className="mt-4">
              <div className="rounded-lg bg-[#ECECEC] p-4">
                <div className="overflow-hidden rounded-lg bg-white shadow-sm">
                  <div className="border-b border-[var(--bd)] bg-[#fafafa] px-4 py-3">
                    <span className="text-sm font-bold text-[var(--p)]">GestMiles</span>
                  </div>
                  <div className="space-y-2 px-4 py-4 text-[13px] text-[var(--t1)]">
                    <div className="font-semibold">{showAssunto ? assunto || "(sem assunto)" : "(WhatsApp — sem assunto)"}</div>
                    <div className="whitespace-pre-wrap text-[var(--t2)]">{applyVars(corpo || "…", previewNome, previewEquipe, previewPlano)}</div>
                  </div>
                  <div className="border-t border-[var(--bd)] px-4 py-2 text-[10px] text-[var(--t3)]">Enviado para fins de pré-visualização · {adminEmail}</div>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="whatsapp" className="mt-4">
              <div className="rounded-lg p-4" style={{ background: "#ECE5DD" }}>
                <div className="ml-auto max-w-[85%] rounded-lg rounded-tr-sm bg-[#DCF8C6] px-3 py-2 shadow-sm">
                  <p className="whitespace-pre-wrap text-[13px] text-[#111]">{applyVars(corpo || "…", previewNome, previewEquipe, previewPlano)}</p>
                  <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-[#667781]">
                    {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    <span className="text-[#53BDEB]" aria-hidden>
                      ✓✓
                    </span>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <Dialog open={createTplOpen} onOpenChange={setCreateTplOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo template</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div>
              <Label>Nome</Label>
              <input className="gm-com-finput mt-1" value={tplDraft.nome ?? ""} onChange={(e) => setTplDraft((d) => ({ ...d, nome: e.target.value }))} />
            </div>
            <div>
              <Label>Descrição</Label>
              <input className="gm-com-finput mt-1" value={tplDraft.descricao ?? ""} onChange={(e) => setTplDraft((d) => ({ ...d, descricao: e.target.value }))} />
            </div>
            <div>
              <Label>Canal</Label>
              <select
                className="gm-com-fselect mt-1 h-10 w-full"
                value={tplDraft.canal ?? "email"}
                onChange={(e) => setTplDraft((d) => ({ ...d, canal: e.target.value as CanalEnvio }))}
              >
                <option value="email">E-mail</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="ambos">Ambos</option>
              </select>
            </div>
            <div>
              <Label>Assunto (e-mail)</Label>
              <input className="gm-com-finput mt-1" value={tplDraft.assunto ?? ""} onChange={(e) => setTplDraft((d) => ({ ...d, assunto: e.target.value }))} />
            </div>
            <div>
              <Label>Emoji</Label>
              <input className="gm-com-finput mt-1" value={tplDraft.emoji ?? ""} onChange={(e) => setTplDraft((d) => ({ ...d, emoji: e.target.value }))} />
            </div>
            <div>
              <Label>Corpo</Label>
              <Textarea className="mt-1 min-h-[100px]" value={tplDraft.corpo ?? ""} onChange={(e) => setTplDraft((d) => ({ ...d, corpo: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setCreateTplOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={saveNewTemplate}>
              Guardar template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historicoOpen} onOpenChange={setHistoricoOpen}>
        <DialogContent className="max-h-[85vh] max-w-[560px] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Histórico de envios</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            {state.mensagens.map((m) => (
              <div key={m.id} className="border-b border-[#f7f7f7] py-3 text-[13px] last:border-0">
                <div className="font-bold">{m.titulo}</div>
                <div className="text-[11px] text-[var(--t3)]">
                  {m.status === "agendado" ? `Agendado · ${m.agendadoPara ? new Date(m.agendadoPara).toLocaleString("pt-BR") : "—"}` : `Enviado · ${m.enviadoEm ? new Date(m.enviadoEm).toLocaleString("pt-BR") : "—"}`}{" "}
                  · {m.totalDestinatarios.toLocaleString("pt-BR")} destinatários
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HistRow({ m }: { m: Mensagem }) {
  const isAgendado = m.status === "agendado";
  const isWa = m.canal === "whatsapp";
  const isAmbos = m.canal === "ambos";
  const showEmailStats = !isAgendado && (m.canal === "email" || isAmbos);
  const showWaStats = !isAgendado && (isWa || isAmbos);
  const meta = isAgendado
    ? `${segmentLabel(m.segmentos)} · Agendado para ${m.agendadoPara ? new Date(m.agendadoPara).toLocaleString("pt-BR") : "—"}`
    : `${segmentLabel(m.segmentos)} · ${m.totalDestinatarios.toLocaleString("pt-BR")} enviados · ${formatRelative(m.enviadoEm)}`;

  return (
    <div className={cn("gm-com-hist-item", isAgendado && "bg-[#FFFBEB]")}>
      <div
        className="gm-com-hist-ch"
        style={{
          background: isAgendado ? "var(--warn-bg)" : isWa ? "#F0FDF4" : "var(--info-bg)",
        }}
      >
        {isAgendado ? "⏰" : isWa ? "💬" : isAmbos ? "⚡" : "📧"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="gm-com-hist-title">{m.titulo}</div>
        <div className="gm-com-hist-meta">{meta}</div>
        <div className="gm-com-hist-stats">
          {showEmailStats && m.taxaAbertura != null ? (
            <>
              <span className="gm-com-hist-stat text-[var(--ok)]">✓ {m.taxaAbertura}% abertura</span>
              <span className="gm-com-hist-stat text-[var(--t3)]">·</span>
              <span className="gm-com-hist-stat text-[var(--info)]">{m.taxaCliques ?? 0}% cliques</span>
            </>
          ) : null}
          {showWaStats ? (
            <>
              <span className="gm-com-hist-stat text-[var(--ok)]">
                ✓ {m.totalEntregues != null && m.totalDestinatarios ? Math.round((m.totalEntregues / m.totalDestinatarios) * 100) : 97}% entregue (WA)
              </span>
              <span className="gm-com-hist-stat text-[var(--t3)]">·</span>
              <span className="gm-com-hist-stat text-[#16A34A]">{m.respostas ?? 0} responderam</span>
            </>
          ) : null}
          {isAgendado ? <span className="gm-com-hist-stat text-[var(--warn)]">⏰ Aguardando envio</span> : null}
        </div>
      </div>
      {m.status === "enviado" && !isWa && !isAmbos ? <span className="gm-com-badge gm-com-badge--ok">Enviado</span> : null}
      {m.status === "enviado" && isWa ? (
        <span className="gm-com-badge gm-com-badge--wa">WhatsApp</span>
      ) : null}
      {m.status === "enviado" && isAmbos ? <span className="gm-com-badge gm-com-badge--ok">E-mail + WA</span> : null}
      {isAgendado ? <span className="gm-com-badge gm-com-badge--warn">Agendado</span> : null}
    </div>
  );
}
