import { useEffect, useMemo, useState } from "react";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { cn } from "@/lib/utils";
import {
  type AdminTicket,
  type MensagemTicket,
  type Ticket,
  type TicketCategoria,
  type TicketPrioridade,
  type TicketStatus,
  SLA_HORAS,
  computeTicketKpis,
  loadSuporteState,
  loadSuporteStateFromBackend,
  newMensagemTicketId,
  newTicketId,
  saveSuporteState,
} from "@/services/adminSuporteStore";

const STATUS_TABS: { key: "abertos" | "em_andamento" | "resolvidos" | "todos"; label: string }[] = [
  { key: "abertos", label: "Abertos" },
  { key: "em_andamento", label: "Em andamento" },
  { key: "resolvidos", label: "Resolvidos" },
  { key: "todos", label: "Todos" },
];

const STATUS_LABEL: Record<TicketStatus, string> = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  resolvido: "Resolvido",
  fechado: "Fechado",
};

const PRIORIDADE_LABEL: Record<TicketPrioridade, string> = {
  urgente: "Urgente",
  alta: "Alta",
  normal: "Normal",
  baixa: "Baixa",
};

const CATEGORIA_LABEL: Record<TicketCategoria, string> = {
  bug: "Bug / Erro",
  duvida: "Dúvida",
  financeiro: "Financeiro",
  comercial: "Comercial",
  tecnico: "Técnico",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.floor(diffMs / 60_000));
  if (mins < 60) return `há ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days}d`;
}

function dateTimeLabel(iso: string): string {
  return `hoje às ${new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

function formatAvgResponse(mins: number): string {
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function slaInfo(ticket: Ticket): { text: string; className: "ok" | "warn" | "err"; widthPct: number } {
  const totalMs = SLA_HORAS[ticket.prioridade] * 60 * 60 * 1000;
  const elapsedMs = Date.now() - new Date(ticket.criadoEm).getTime();
  const consumed = Math.max(0, Math.min(1, elapsedMs / totalMs));
  const remainMs = new Date(ticket.slaDeadline).getTime() - Date.now();
  const remainMinutes = Math.ceil(remainMs / 60_000);
  const remainHours = remainMinutes / 60;
  const slaClass: "ok" | "warn" | "err" = remainHours > 2 ? "ok" : remainHours >= 1 ? "warn" : "err";
  const label = remainMinutes > 0 ? `${remainMinutes}min restantes` : "SLA vencido";
  return { text: `SLA: ${label}`, className: slaClass, widthPct: Math.round(consumed * 100) };
}

function ticketMatchesTab(ticket: Ticket, tab: (typeof STATUS_TABS)[number]["key"]): boolean {
  if (tab === "todos") return true;
  if (tab === "abertos") return ticket.status === "aberto";
  if (tab === "em_andamento") return ticket.status === "em_andamento";
  return ticket.status === "resolvido";
}

export default function AdminSuportePage() {
  const { user, perfilNome } = useAdminAuth();
  const [state, setState] = useState(() => loadSuporteState());
  const [statusTab, setStatusTab] = useState<(typeof STATUS_TABS)[number]["key"]>("abertos");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [isNotaInterna, setIsNotaInterna] = useState(false);
  const [newTicketOpen, setNewTicketOpen] = useState(false);
  const [newTicket, setNewTicket] = useState({
    solicitanteId: "",
    assunto: "",
    categoria: "bug" as TicketCategoria,
    prioridade: "normal" as TicketPrioridade,
    descricao: "",
    atribuidoAId: "",
  });

  useEffect(() => {
    setState(loadSuporteState());
    void loadSuporteStateFromBackend().then((remoteState) => setState(remoteState));
    const onUpdate = () => {
      setState(loadSuporteState());
      void loadSuporteStateFromBackend().then((remoteState) => setState(remoteState));
    };
    window.addEventListener("gm-admin-suporte-updated", onUpdate);
    return () => window.removeEventListener("gm-admin-suporte-updated", onUpdate);
  }, []);

  useEffect(() => {
    if (!selectedId && state.tickets.length > 0) {
      setSelectedId(state.tickets[0]!.id);
    }
  }, [selectedId, state.tickets]);

  const kpis = useMemo(() => computeTicketKpis(state.tickets, state.mensagens), [state]);

  const ticketCounters = useMemo(
    () => ({
      abertos: state.tickets.filter((ticket) => ticket.status === "aberto").length,
      em_andamento: state.tickets.filter((ticket) => ticket.status === "em_andamento").length,
      resolvidos: state.tickets.filter((ticket) => ticket.status === "resolvido").length,
    }),
    [state.tickets],
  );

  const filteredTickets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return [...state.tickets]
      .filter((ticket) => ticketMatchesTab(ticket, statusTab))
      .filter((ticket) => {
        if (!normalized) return true;
        return (
          ticket.assunto.toLowerCase().includes(normalized) ||
          ticket.id.toLowerCase().includes(normalized) ||
          ticket.solicitanteNome.toLowerCase().includes(normalized)
        );
      })
      .sort((a, b) => new Date(b.atualizadoEm).getTime() - new Date(a.atualizadoEm).getTime());
  }, [query, state.tickets, statusTab]);

  const selectedTicket = useMemo(
    () => state.tickets.find((ticket) => ticket.id === selectedId) ?? filteredTickets[0] ?? null,
    [filteredTickets, selectedId, state.tickets],
  );

  const mensagensTicket = useMemo(() => {
    if (!selectedTicket) return [];
    return state.mensagens
      .filter((mensagem) => mensagem.ticketId === selectedTicket.id)
      .sort((a, b) => new Date(a.criadaEm).getTime() - new Date(b.criadaEm).getTime());
  }, [selectedTicket, state.mensagens]);

  const persist = (nextTickets: Ticket[], nextMensagens: MensagemTicket[]) => {
    const nextState = { ...state, tickets: nextTickets, mensagens: nextMensagens };
    setState(nextState);
    saveSuporteState(nextState);
  };

  const updateSelectedTicket = (patch: Partial<Ticket>) => {
    if (!selectedTicket) return;
    const nowIso = new Date().toISOString();
    const updatedTickets = state.tickets.map((ticket) =>
      ticket.id === selectedTicket.id
        ? {
            ...ticket,
            ...patch,
            atualizadoEm: nowIso,
          }
        : ticket,
    );
    persist(updatedTickets, state.mensagens);
  };

  const sendReply = (resolveTicket: boolean) => {
    if (!selectedTicket || !reply.trim()) return;
    const nowIso = new Date().toISOString();
    const currentAdminName = perfilNome ?? "Admin";
    const newMessage: MensagemTicket = {
      id: newMensagemTicketId(),
      ticketId: selectedTicket.id,
      autorId: user?.id ?? "admin-local",
      autorNome: currentAdminName,
      autorTipo: "admin",
      conteudo: reply.trim(),
      notaInterna: isNotaInterna,
      criadaEm: nowIso,
    };
    const updatedMessages = [...state.mensagens, newMessage];
    const updatedTickets = state.tickets.map((ticket) => {
      if (ticket.id !== selectedTicket.id) return ticket;
      return {
        ...ticket,
        naoLido: false,
        status: resolveTicket ? "resolvido" : ticket.status === "aberto" ? "em_andamento" : ticket.status,
        atualizadoEm: nowIso,
      };
    });
    persist(updatedTickets, updatedMessages);
    setReply("");
    setIsNotaInterna(false);
  };

  const createTicket = () => {
    if (!newTicket.solicitanteId || !newTicket.assunto.trim() || !newTicket.descricao.trim()) return;
    const solicitante = state.solicitantes.find((item) => item.id === newTicket.solicitanteId);
    if (!solicitante) return;

    const nowIso = new Date().toISOString();
    const ticketId = newTicketId(state.tickets);
    const created: Ticket = {
      id: ticketId,
      assunto: newTicket.assunto.trim(),
      status: "aberto",
      prioridade: newTicket.prioridade,
      categoria: newTicket.categoria,
      solicitanteId: solicitante.id,
      solicitanteNome: solicitante.nome,
      atribuidoAId: newTicket.atribuidoAId || undefined,
      criadoEm: nowIso,
      atualizadoEm: nowIso,
      slaDeadline: new Date(Date.now() + SLA_HORAS[newTicket.prioridade] * 60 * 60 * 1000).toISOString(),
      naoLido: true,
    };
    const firstMsg: MensagemTicket = {
      id: newMensagemTicketId(),
      ticketId,
      autorId: solicitante.id,
      autorNome: solicitante.nome,
      autorTipo: "usuario",
      conteudo: newTicket.descricao.trim(),
      notaInterna: false,
      criadaEm: nowIso,
    };
    persist([created, ...state.tickets], [...state.mensagens, firstMsg]);
    setSelectedId(ticketId);
    setNewTicketOpen(false);
    setStatusTab("abertos");
    setNewTicket({
      solicitanteId: "",
      assunto: "",
      categoria: "bug",
      prioridade: "normal",
      descricao: "",
      atribuidoAId: "",
    });
  };

  const selectedSla = selectedTicket ? slaInfo(selectedTicket) : null;

  return (
    <div className="gm-sup-page">
      <div className="gm-sup-kpi4">
        <div className="gm-sup-kpi re">
          <div className="gm-sup-kl">Abertos</div>
          <div className="gm-sup-kv text-[#DC2626]">{kpis.abertos}</div>
          <div className="gm-sup-ks">aguardando resposta</div>
        </div>
        <div className="gm-sup-kpi am">
          <div className="gm-sup-kl">Em andamento</div>
          <div className="gm-sup-kv text-[#D97706]">{kpis.emAndamento}</div>
          <div className="gm-sup-ks">em tratamento</div>
        </div>
        <div className="gm-sup-kpi gr">
          <div className="gm-sup-kl">Resolvidos hoje</div>
          <div className="gm-sup-kv text-[#16A34A]">{kpis.resolvidosHoje}</div>
          <div className="gm-sup-ks">finalizados nas últimas 24h</div>
        </div>
        <div className="gm-sup-kpi bl">
          <div className="gm-sup-kl">Tempo médio de resposta</div>
          <div className="gm-sup-kv text-[#2563EB]">{formatAvgResponse(kpis.tempoMedioRespostaMinutos)}</div>
          <div className="gm-sup-ks">meta: {"<"} 4 horas</div>
        </div>
      </div>

      <div className="gm-sup-inbox">
        <div className="gm-sup-ticket-list">
          <div className="gm-sup-tl-header">
            <div className="gm-sup-tl-title">
              <span>Tickets</span>
              <button type="button" className="gm-sup-btn-p gm-sup-btn-p-sm" onClick={() => setNewTicketOpen(true)}>
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <line x1="5.5" y1="1" x2="5.5" y2="10" />
                  <line x1="1" y1="5.5" x2="10" y2="5.5" />
                </svg>
                Novo
              </button>
            </div>
          </div>

          <div className="gm-sup-status-tabs">
            {STATUS_TABS.map((tab) => (
              <button key={tab.key} type="button" className={cn("gm-sup-st", statusTab === tab.key && "active")} onClick={() => setStatusTab(tab.key)}>
                {tab.label}
                {tab.key !== "todos" ? (
                  <span
                    className={cn(
                      "gm-sup-st-cnt",
                      tab.key === "abertos" && "cnt-err",
                      tab.key === "em_andamento" && "cnt-warn",
                      tab.key === "resolvidos" && "cnt-ok",
                    )}
                  >
                    {ticketCounters[tab.key]}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="gm-sup-search">
            <svg className="gm-sup-si" width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
              <circle cx="6" cy="6" r="4" />
              <line x1="9.5" y1="9.5" x2="12.5" y2="12.5" />
            </svg>
            <input className="gm-sup-sin" placeholder="Buscar ticket..." value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>

          <div className="gm-sup-tickets-scroll">
            {filteredTickets.map((ticket) => {
              const firstMessage = state.mensagens.find((mensagem) => mensagem.ticketId === ticket.id);
              const sla = slaInfo(ticket);
              return (
                <button
                  key={ticket.id}
                  type="button"
                  className={cn("gm-sup-ticket-item", selectedTicket?.id === ticket.id && "active", ticket.naoLido && "unread")}
                  onClick={() => setSelectedId(ticket.id)}
                >
                  <div className="gm-sup-ti-top">
                    <div className="gm-sup-ti-user">
                      <div className="gm-sup-ti-av">{initials(ticket.solicitanteNome)}</div>
                      <span className="gm-sup-ti-name">{ticket.solicitanteNome}</span>
                    </div>
                    <span className="gm-sup-ti-time">{relativeTime(ticket.atualizadoEm)}</span>
                  </div>
                  <div className="gm-sup-ti-subject">{ticket.assunto}</div>
                  <div className="gm-sup-ti-preview">{firstMessage?.conteudo ?? "Sem mensagens no ticket."}</div>
                  <div className="gm-sup-ti-badges">
                    <span className={cn("gm-sup-prio", `gm-sup-prio-${ticket.prioridade}`)}>{PRIORIDADE_LABEL[ticket.prioridade]}</span>
                    <span className="gm-sup-cat">{CATEGORIA_LABEL[ticket.categoria]}</span>
                  </div>
                  {(ticket.prioridade === "urgente" || ticket.prioridade === "alta") && ticket.status !== "resolvido" ? (
                    <>
                      <div className={cn("gm-sup-ti-sla", `sla-${sla.className}`)}>
                        <div className="dot" />
                        <span>{sla.text}</span>
                      </div>
                      <div className={cn("gm-sup-sla-bar", `sla-${sla.className}`)} style={{ width: `${sla.widthPct}%` }} />
                    </>
                  ) : null}
                  {ticket.naoLido ? <div className="gm-sup-unread-dot" /> : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="gm-sup-ticket-detail">
          {selectedTicket ? (
            <>
              <div className="gm-sup-td-header">
                <div className="gm-sup-td-id">
                  #{selectedTicket.id} · {STATUS_LABEL[selectedTicket.status]} há {relativeTime(selectedTicket.criadoEm).replace("há ", "")}
                </div>
                <div className="gm-sup-td-subject">{selectedTicket.assunto}</div>
                <div className="gm-sup-td-meta">
                  <div className="gm-sup-td-meta-item">
                    <div className="gm-sup-td-avatar">{initials(selectedTicket.solicitanteNome)}</div>
                    <span>{selectedTicket.solicitanteNome}</span>
                  </div>
                  <span className="gm-sup-sep">·</span>
                  <span className={cn("gm-sup-prio", `gm-sup-prio-${selectedTicket.prioridade}`)}>{PRIORIDADE_LABEL[selectedTicket.prioridade]}</span>
                  <span className="gm-sup-cat">{CATEGORIA_LABEL[selectedTicket.categoria]}</span>
                  <span className={cn("gm-sup-badge", `st-${selectedTicket.status}`)}>{STATUS_LABEL[selectedTicket.status]}</span>
                  {selectedSla ? <span className="gm-sup-sla-text">{selectedSla.text.replace("SLA: ", "⏰ SLA: ")}</span> : null}
                </div>
              </div>

              <div className="gm-sup-td-actions">
                <select className="gm-sup-fselect" value={selectedTicket.status} onChange={(event) => updateSelectedTicket({ status: event.target.value as TicketStatus })}>
                  <option value="aberto">🔴 Aberto</option>
                  <option value="em_andamento">🟡 Em andamento</option>
                  <option value="resolvido">🟢 Resolvido</option>
                  <option value="fechado">⚫ Fechado</option>
                </select>
                <select
                  className="gm-sup-fselect"
                  value={selectedTicket.prioridade}
                  onChange={(event) => updateSelectedTicket({ prioridade: event.target.value as TicketPrioridade })}
                >
                  <option value="urgente">Urgente</option>
                  <option value="alta">Alta</option>
                  <option value="normal">Normal</option>
                  <option value="baixa">Baixa</option>
                </select>
                <select className="gm-sup-fselect" value={selectedTicket.categoria} onChange={(event) => updateSelectedTicket({ categoria: event.target.value as TicketCategoria })}>
                  <option value="bug">Bug / Erro</option>
                  <option value="duvida">Dúvida</option>
                  <option value="financeiro">Financeiro</option>
                  <option value="comercial">Comercial</option>
                  <option value="tecnico">Técnico</option>
                </select>
                <select className="gm-sup-fselect ml-auto" value={selectedTicket.atribuidoAId ?? ""} onChange={(event) => updateSelectedTicket({ atribuidoAId: event.target.value })}>
                  <option value="">Atribuir a: Não definido</option>
                  {state.admins.map((admin) => (
                    <option key={admin.id} value={admin.id}>
                      Atribuir a: {admin.nome}
                    </option>
                  ))}
                </select>
                <button type="button" className="gm-sup-btn-sm gm-sup-btn-sm-ok" onClick={() => updateSelectedTicket({ status: "resolvido" })}>
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <polyline points="1,5.5 4,8.5 10,2" />
                  </svg>
                  Resolver
                </button>
              </div>

              <div className="gm-sup-conversation">
                <div className="gm-sup-sys-msg">
                  <span>Ticket atribuído a Rick Rabelo • há 20 minutos</span>
                </div>
                {mensagensTicket.map((mensagem) => (
                  <div key={mensagem.id} className={cn("gm-sup-msg", mensagem.autorTipo === "admin" && "admin", mensagem.autorTipo === "usuario" && "user")}>
                    <div className="gm-sup-msg-av">{initials(mensagem.autorNome)}</div>
                    <div className="gm-sup-msg-body">
                      <div className="gm-sup-msg-meta">
                        <span className="gm-sup-msg-sender">{mensagem.autorNome}</span>
                        <span className="gm-sup-msg-time">{dateTimeLabel(mensagem.criadaEm)}</span>
                        {mensagem.autorTipo === "admin" ? <span className="gm-sup-badge admin">Admin</span> : null}
                        {mensagem.notaInterna ? <span className="gm-sup-badge note">Nota interna</span> : null}
                      </div>
                      <div className={cn("gm-sup-msg-bubble", mensagem.notaInterna && "internal")}>
                        {mensagem.conteudo.split("\n").map((line, index) =>
                          line.includes("Error 500:") ? (
                            <code key={`${mensagem.id}-${index}`} className="gm-sup-code">
                              {line}
                            </code>
                          ) : (
                            <p key={`${mensagem.id}-${index}`}>{line || <br />}</p>
                          ),
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="gm-sup-reply-box">
                <textarea
                  className="gm-sup-reply-textarea"
                  placeholder="Escreva sua resposta... Use {nome} para personalizar..."
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                />
                <div className="gm-sup-reply-actions">
                  <button type="button" className="gm-sup-btn-sm gm-sup-btn-sm-o">
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                      <rect x="1.5" y="1.5" width="8" height="8" rx="1.5" />
                      <line x1="4" y1="4.5" x2="7" y2="4.5" />
                      <line x1="4" y1="6.5" x2="6" y2="6.5" />
                    </svg>
                    Templates
                  </button>
                  <button type="button" className={cn("gm-sup-btn-sm gm-sup-btn-sm-o", isNotaInterna && "active")} onClick={() => setIsNotaInterna((current) => !current)}>
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                      <path d="M2 8.5V10h1.5L9.5 4 8 2.5 2 8.5Z" />
                    </svg>
                    Nota interna
                  </button>
                  <div className="gm-sup-reply-right">
                    <button type="button" className="gm-sup-btn-sm gm-sup-btn-sm-ok" onClick={() => sendReply(true)}>
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                        <polyline points="1,5.5 4,8.5 10,2" />
                      </svg>
                      Responder e resolver
                    </button>
                    <button type="button" className="gm-sup-btn-p" onClick={() => sendReply(false)}>
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                        <path d="M10 1L1 4.5l3.5 2L8 3.5l-1.5 3.5 2 2L10 1Z" />
                      </svg>
                      Enviar resposta
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="gm-sup-empty">Selecione um ticket para visualizar os detalhes.</div>
          )}
        </div>
      </div>

      <Dialog open={newTicketOpen} onOpenChange={setNewTicketOpen}>
        <DialogContent className="gm-sup-modal max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Novo ticket</DialogTitle>
          </DialogHeader>
          <div className="gm-sup-modal-body">
            <div className="gm-sup-field">
              <label htmlFor="sup-solicitante">Solicitante*</label>
              <select
                id="sup-solicitante"
                value={newTicket.solicitanteId}
                onChange={(event) => setNewTicket((current) => ({ ...current, solicitanteId: event.target.value }))}
              >
                <option value="">Selecione um usuário</option>
                {state.solicitantes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="gm-sup-field">
              <label htmlFor="sup-assunto">Assunto*</label>
              <input
                id="sup-assunto"
                value={newTicket.assunto}
                onChange={(event) => setNewTicket((current) => ({ ...current, assunto: event.target.value }))}
                placeholder="Ex: Erro ao confirmar pagamento"
              />
            </div>
            <div className="gm-sup-row-2">
              <div className="gm-sup-field">
                <label htmlFor="sup-categoria">Categoria</label>
                <select
                  id="sup-categoria"
                  value={newTicket.categoria}
                  onChange={(event) => setNewTicket((current) => ({ ...current, categoria: event.target.value as TicketCategoria }))}
                >
                  <option value="bug">Bug / Erro</option>
                  <option value="duvida">Dúvida</option>
                  <option value="financeiro">Financeiro</option>
                  <option value="comercial">Comercial</option>
                  <option value="tecnico">Técnico</option>
                </select>
              </div>
              <div className="gm-sup-field">
                <label htmlFor="sup-prioridade">Prioridade</label>
                <select
                  id="sup-prioridade"
                  value={newTicket.prioridade}
                  onChange={(event) => setNewTicket((current) => ({ ...current, prioridade: event.target.value as TicketPrioridade }))}
                >
                  <option value="urgente">Urgente</option>
                  <option value="alta">Alta</option>
                  <option value="normal">Normal</option>
                  <option value="baixa">Baixa</option>
                </select>
              </div>
            </div>
            <div className="gm-sup-field">
              <label htmlFor="sup-descricao">Descrição*</label>
              <textarea
                id="sup-descricao"
                value={newTicket.descricao}
                onChange={(event) => setNewTicket((current) => ({ ...current, descricao: event.target.value }))}
              />
            </div>
            <div className="gm-sup-field">
              <label htmlFor="sup-atribuido">Atribuir a</label>
              <select
                id="sup-atribuido"
                value={newTicket.atribuidoAId}
                onChange={(event) => setNewTicket((current) => ({ ...current, atribuidoAId: event.target.value }))}
              >
                <option value="">Sem responsável</option>
                {state.admins.map((admin: AdminTicket) => (
                  <option key={admin.id} value={admin.id}>
                    {admin.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter className="gm-sup-modal-footer">
            <button type="button" className="gm-sup-btn-o" onClick={() => setNewTicketOpen(false)}>
              Cancelar
            </button>
            <button type="button" className="gm-sup-btn-p" onClick={createTicket}>
              Criar ticket
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
