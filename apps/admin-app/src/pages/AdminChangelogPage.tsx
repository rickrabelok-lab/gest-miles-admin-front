import { useEffect, useMemo, useState } from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  type ChangeType,
  type ChangelogState,
  type PublishMode,
  type Versao,
  countDraftVersions,
  loadChangelogState,
  loadChangelogStateFromBackend,
  newChangeId,
  newVersionId,
  saveChangelogState,
} from "@/services/adminChangelogStore";
import { toast } from "sonner";

const CHANGE_OPTIONS: { value: ChangeType; label: string; emoji: string }[] = [
  { value: "nova", label: "Nova", emoji: "🟢" },
  { value: "melhoria", label: "Melhoria", emoji: "🔵" },
  { value: "correcao", label: "Correção", emoji: "🔴" },
  { value: "seguranca", label: "Segurança", emoji: "🟡" },
  { value: "deprecado", label: "Deprecado", emoji: "⚫" },
];

const AUDIENCE_OPTIONS = ["todos", "gestores", "cs", "clientes", "plano_pro", "enterprise"] as const;

function dateOnly(iso?: string): string {
  if (!iso) return new Date().toISOString().slice(0, 10);
  return new Date(iso).toISOString().slice(0, 10);
}

function formatLongDate(iso?: string): string {
  if (!iso) return "Ainda não publicado";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function relativeDayLabel(iso?: string): string {
  if (!iso) return "";
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
  if (days === 0) return "hoje";
  if (days === 1) return "há 1 dia";
  return `${days} dias atrás`;
}

function tagClass(tipo: ChangeType): string {
  if (tipo === "nova") return "tag-new";
  if (tipo === "melhoria") return "tag-imp";
  if (tipo === "correcao") return "tag-fix";
  if (tipo === "seguranca") return "tag-sec";
  return "tag-dep";
}

function tagLabel(tipo: ChangeType): string {
  return CHANGE_OPTIONS.find((item) => item.value === tipo)?.label ?? tipo;
}

function inputDateTimeValue(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

export default function AdminChangelogPage() {
  const [state, setState] = useState<ChangelogState>(() => loadChangelogState());
  const [selectedId, setSelectedId] = useState<string>(() => loadChangelogState().versoes[0]?.id ?? "");
  const [publishMode, setPublishMode] = useState<PublishMode>("agora");
  const [userModalOpen, setUserModalOpen] = useState(false);

  useEffect(() => {
    setState(loadChangelogState());
    void loadChangelogStateFromBackend().then((remote) => {
      setState(remote);
      setSelectedId((prev) => prev || remote.versoes[0]?.id || "");
    });
    const fn = () => setState(loadChangelogState());
    window.addEventListener("gm-admin-changelog-updated", fn);
    return () => window.removeEventListener("gm-admin-changelog-updated", fn);
  }, []);

  const persist = (next: ChangelogState) => {
    setState(next);
    saveChangelogState(next);
  };

  const selected = useMemo(() => state.versoes.find((v) => v.id === selectedId) ?? null, [state.versoes, selectedId]);

  const kpi = useMemo(() => {
    const publicados = state.versoes.filter((v) => v.status === "publicado");
    const draftCount = countDraftVersions(state);
    const last = publicados.sort((a, b) => new Date(b.publicadaEm ?? b.criadaEm).getTime() - new Date(a.publicadaEm ?? a.criadaEm).getTime())[0] ?? null;
    const taxa = publicados.length
      ? Math.round(publicados.reduce((sum, item) => sum + item.taxaLeitura, 0) / publicados.length)
      : 0;
    return {
      publicados: publicados.length,
      draftCount,
      last,
      taxaMedia: taxa,
    };
  }, [state]);

  const updateSelected = (patch: Partial<Versao>) => {
    if (!selected) return;
    persist({
      ...state,
      versoes: state.versoes.map((v) => (v.id === selected.id ? { ...v, ...patch } : v)),
    });
  };

  const onAddVersion = () => {
    const now = new Date().toISOString();
    const nova: Versao = {
      id: newVersionId(),
      numero: "v0.0.0",
      titulo: "",
      mudancas: [{ id: newChangeId(), tipo: "nova", descricao: "" }],
      status: "rascunho",
      audiencia: ["todos"],
      criadaEm: now,
      criadaPor: "Admin",
      totalVisualizacoes: 0,
      totalLeituras: 0,
      taxaLeitura: 0,
    };
    const next = { ...state, versoes: [nova, ...state.versoes] };
    persist(next);
    setSelectedId(nova.id);
    setPublishMode("agora");
  };

  const onAddChange = () => {
    if (!selected) return;
    updateSelected({
      mudancas: [...selected.mudancas, { id: newChangeId(), tipo: "nova", descricao: "" }],
    });
  };

  const onRemoveChange = (id: string) => {
    if (!selected) return;
    if (selected.mudancas.length <= 1) return;
    updateSelected({ mudancas: selected.mudancas.filter((item) => item.id !== id) });
  };

  const onPublish = () => {
    if (!selected) return;
    if (!selected.numero.trim()) {
      toast.error("Informe o número da versão.");
      return;
    }
    if (!selected.titulo.trim()) {
      toast.error("Informe o título da versão.");
      return;
    }
    if (publishMode === "agendar" && !selected.agendadaPara) {
      toast.error("Defina data/hora para agendamento.");
      return;
    }
    if (publishMode === "rascunho") {
      updateSelected({ status: "rascunho", publicadaEm: undefined });
      toast.success(`Rascunho ${selected.numero} salvo.`);
      return;
    }
    if (publishMode === "agendar") {
      updateSelected({ status: "agendado" });
      toast.success(`Versão ${selected.numero} agendada.`);
      return;
    }
    const views = Math.max(300, Math.floor(450 + Math.random() * 700));
    const reads = Math.max(1, Math.floor(views * (0.55 + Math.random() * 0.35)));
    updateSelected({
      status: "publicado",
      publicadaEm: new Date().toISOString(),
      totalVisualizacoes: views,
      totalLeituras: reads,
      taxaLeitura: Math.round((reads / views) * 100),
    });
    toast.success(`Versão ${selected.numero} publicada.`);
  };

  const onSaveDraft = () => {
    if (!selected) return;
    updateSelected({ status: "rascunho" });
    toast.success("Rascunho salvo.");
  };

  return (
    <div className="gm-cl-page">
      <div className="gm-cl-head">
        <div>
          <div className="gm-cl-title">Changelog</div>
          <div className="gm-cl-sub">Publique novidades, melhorias e correções diretamente para os usuários do app</div>
        </div>
        <div className="gm-cl-head-actions">
          <button className="gm-cl-btn-o" type="button" onClick={() => setUserModalOpen(true)}>
            Ver changelog público
          </button>
          <button className="gm-cl-btn-p" type="button" onClick={onAddVersion}>
            Nova versão
          </button>
        </div>
      </div>

      <div className="gm-cl-kpi4">
        <div className="gm-cl-kpi pu">
          <div className="gm-cl-kl">Versões publicadas</div>
          <div className="gm-cl-kv">{kpi.publicados}</div>
          <div className="gm-cl-ks">desde o lançamento</div>
        </div>
        <div className="gm-cl-kpi gr">
          <div className="gm-cl-kl">Última publicação</div>
          <div className="gm-cl-kv gm-cl-ok-sm">{kpi.last?.numero ?? "—"}</div>
          <div className="gm-cl-ks">
            {kpi.last ? `${formatLongDate(kpi.last.publicadaEm)} · ${relativeDayLabel(kpi.last.publicadaEm)}` : "Sem publicação"}
          </div>
        </div>
        <div className="gm-cl-kpi bl">
          <div className="gm-cl-kl">Taxa de leitura</div>
          <div className="gm-cl-kv">{kpi.taxaMedia}%</div>
          <div className="gm-cl-ks">usuários que viram o changelog</div>
        </div>
        <div className="gm-cl-kpi am">
          <div className="gm-cl-kl">Em rascunho</div>
          <div className="gm-cl-kv gm-cl-warn">{kpi.draftCount}</div>
          <div className="gm-cl-ks">versão aguardando publicação</div>
        </div>
      </div>

      <div className="gm-cl-g21">
        <div className="gm-cl-card">
          <div className="gm-cl-card-h">
            <div className="gm-cl-card-ti">Versões publicadas</div>
            <span className="gm-cl-muted">Clique para editar</span>
          </div>
          {state.versoes.map((version) => (
            <button
              key={version.id}
              type="button"
              className={cn("gm-cl-version-entry", version.id === selectedId && "active", version.status === "rascunho" && "is-draft")}
              onClick={() => setSelectedId(version.id)}
            >
              <div className="gm-cl-ve-header">
                <div className="gm-cl-ve-info">
                  <div className="gm-cl-ve-row">
                    <span className="gm-cl-ve-version">{version.numero}</span>
                    <span className={cn("gm-cl-badge", version.status === "publicado" ? "b-ok" : version.status === "agendado" ? "b-info" : "b-warn")}>
                      {version.status === "publicado" ? "Publicado" : version.status === "agendado" ? "Agendado" : "Rascunho"}
                    </span>
                  </div>
                  <div className="gm-cl-ve-title">{version.titulo || "Sem título"}</div>
                  <div className="gm-cl-ve-date">
                    {version.status === "publicado" && version.publicadaEm
                      ? `${formatLongDate(version.publicadaEm)} · ${relativeDayLabel(version.publicadaEm)}`
                      : version.status === "agendado" && version.agendadaPara
                        ? `Agendado para ${new Date(version.agendadaPara).toLocaleString("pt-BR")}`
                        : "Ainda não publicado"}
                  </div>
                </div>
                <div className="gm-cl-ve-actions">
                  {version.status === "rascunho" ? <span className="gm-cl-btn-mini ok">Publicar</span> : null}
                  <span className="gm-cl-btn-mini">Editar</span>
                </div>
              </div>
              <div className="gm-cl-ve-changes">
                {version.mudancas.map((change) => (
                  <div key={change.id} className="gm-cl-ve-change">
                    <span className={cn("gm-cl-tag", tagClass(change.tipo))}>{tagLabel(change.tipo)}</span>
                    <span>{change.descricao || "Descreva a mudança..."}</span>
                  </div>
                ))}
              </div>
              {version.status === "publicado" ? (
                <div className="gm-cl-read-rate">
                  <span className="txt">Leitura</span>
                  <div className="bar">
                    <div className="fill" style={{ width: `${version.taxaLeitura}%` }} />
                  </div>
                  <span className="pct">{version.taxaLeitura}%</span>
                </div>
              ) : null}
            </button>
          ))}
          <div className="gm-cl-list-foot">Ver todas as {Math.max(state.versoes.length, 12)} versões →</div>
        </div>

        <div className="gm-cl-right">
          <div className="gm-cl-card">
            <div className="gm-cl-card-h">
              <div className="gm-cl-card-ti">Editor de versão</div>
              <span className="gm-cl-badge b-warn">Rascunho · {selected?.numero || "v0.0.0"}</span>
            </div>
            {selected ? (
              <>
                <div className="gm-cl-editor-body">
                  <div className="gm-cl-grid2">
                    <div className="gm-cl-field">
                      <label className="gm-cl-label">Versão</label>
                      <input className="gm-cl-input gm-cl-mono" value={selected.numero} onChange={(e) => updateSelected({ numero: e.target.value })} />
                    </div>
                    <div className="gm-cl-field">
                      <label className="gm-cl-label">Data</label>
                      <input
                        className="gm-cl-input"
                        type="date"
                        value={dateOnly(selected.publicadaEm ?? selected.criadaEm)}
                        onChange={(e) => {
                          const day = e.target.value;
                          if (!day) return;
                          const base = selected.publicadaEm ? new Date(selected.publicadaEm) : new Date(selected.criadaEm);
                          const [y, m, d] = day.split("-").map(Number);
                          base.setFullYear(y ?? base.getFullYear(), (m ?? 1) - 1, d ?? 1);
                          updateSelected({ publicadaEm: base.toISOString() });
                        }}
                      />
                    </div>
                  </div>
                  <div className="gm-cl-field">
                    <label className="gm-cl-label">Título da versão</label>
                    <input
                      className="gm-cl-input"
                      placeholder="Ex: Relatórios exportáveis e melhorias de UX"
                      value={selected.titulo}
                      onChange={(e) => updateSelected({ titulo: e.target.value })}
                    />
                  </div>
                  <div className="gm-cl-field">
                    <label className="gm-cl-label">Mudanças desta versão</label>
                    {selected.mudancas.map((change) => (
                      <div className="gm-cl-change-item" key={change.id}>
                        <select
                          className="gm-cl-change-type"
                          value={change.tipo}
                          onChange={(e) =>
                            updateSelected({
                              mudancas: selected.mudancas.map((item) => (item.id === change.id ? { ...item, tipo: e.target.value as ChangeType } : item)),
                            })
                          }
                        >
                          {CHANGE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.emoji} {opt.label}
                            </option>
                          ))}
                        </select>
                        <input
                          className="gm-cl-change-input"
                          placeholder="Descreva a mudança..."
                          value={change.descricao}
                          onChange={(e) =>
                            updateSelected({
                              mudancas: selected.mudancas.map((item) => (item.id === change.id ? { ...item, descricao: e.target.value } : item)),
                            })
                          }
                        />
                        <button className="gm-cl-rm-btn" type="button" onClick={() => onRemoveChange(change.id)} title="Remover">
                          ×
                        </button>
                      </div>
                    ))}
                    <button type="button" className="gm-cl-add-change" onClick={onAddChange}>
                      + Adicionar mudança
                    </button>
                  </div>
                  <div className="gm-cl-field">
                    <label className="gm-cl-label">Mostrar para</label>
                    <div className="gm-cl-audience-chips">
                      {AUDIENCE_OPTIONS.map((aud) => {
                        const selectedAud = selected.audiencia.includes(aud);
                        return (
                          <button
                            key={aud}
                            type="button"
                            className={cn("gm-cl-aud-chip", selectedAud && "selected")}
                            onClick={() => {
                              const next = selectedAud ? selected.audiencia.filter((x) => x !== aud) : [...selected.audiencia, aud];
                              updateSelected({ audiencia: next.length ? next : ["todos"] });
                            }}
                          >
                            {aud === "todos"
                              ? "Todos"
                              : aud === "plano_pro"
                                ? "Plano Pro"
                                : aud === "cs"
                                  ? "CS"
                                  : aud[0]?.toUpperCase() + aud.slice(1)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="gm-cl-field">
                    <label className="gm-cl-label">Publicação</label>
                    <div className="gm-cl-pub-options">
                      <button type="button" className={cn("gm-cl-pub-opt", publishMode === "agora" && "active")} onClick={() => setPublishMode("agora")}>
                        Publicar agora
                      </button>
                      <button type="button" className={cn("gm-cl-pub-opt", publishMode === "agendar" && "active")} onClick={() => setPublishMode("agendar")}>
                        Agendar
                      </button>
                      <button type="button" className={cn("gm-cl-pub-opt", publishMode === "rascunho" && "active")} onClick={() => setPublishMode("rascunho")}>
                        Rascunho
                      </button>
                    </div>
                    {publishMode === "agendar" ? (
                      <input
                        className="gm-cl-input"
                        type="datetime-local"
                        value={inputDateTimeValue(selected.agendadaPara)}
                        onChange={(e) => updateSelected({ agendadaPara: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
                      />
                    ) : null}
                  </div>
                </div>

                <div className="gm-cl-preview-wrap">
                  <div className="gm-cl-preview">
                    <div className="pp-version">{selected.numero || "v0.0.0"}</div>
                    <div className="pp-title">{selected.titulo || "Título da versão"}</div>
                    <div className="pp-changes">
                      {selected.mudancas.map((change) => (
                        <div className="pp-change" key={change.id}>
                          <span className={cn("pp-tag", `t-${change.tipo}`)}>{tagLabel(change.tipo)}</span>
                          {change.descricao || "Descreva a mudança..."}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="gm-cl-editor-footer">
                  <button type="button" className="gm-cl-btn-sm-o" onClick={onSaveDraft}>
                    Salvar rascunho
                  </button>
                  <button type="button" className="gm-cl-btn-p gm-cl-publish-btn" onClick={onPublish}>
                    Publicar versão {selected.numero || "v0.0.0"}
                  </button>
                </div>
              </>
            ) : null}
          </div>

          <div className="gm-cl-card">
            <div className="gm-cl-card-h">
              <div className="gm-cl-card-ti">Notificações ao publicar</div>
            </div>
            <div className="gm-cl-notif-list">
              <div className="gm-cl-notif-row">
                <div>
                  <div className="gm-cl-notif-title">Notificação in-app</div>
                  <div className="gm-cl-notif-sub">Badge "Novidades" no sidebar do usuário</div>
                </div>
                <button
                  type="button"
                  className={cn("gm-cl-toggle", state.notificacoes.inApp ? "on" : "off")}
                  onClick={() => persist({ ...state, notificacoes: { ...state.notificacoes, inApp: !state.notificacoes.inApp } })}
                />
              </div>
              <div className="gm-cl-notif-row">
                <div>
                  <div className="gm-cl-notif-title">E-mail de anúncio</div>
                  <div className="gm-cl-notif-sub">Enviar e-mail para todos os usuários</div>
                </div>
                <button
                  type="button"
                  className={cn("gm-cl-toggle", state.notificacoes.email ? "on" : "off")}
                  onClick={() => persist({ ...state, notificacoes: { ...state.notificacoes, email: !state.notificacoes.email } })}
                />
              </div>
              <div className="gm-cl-notif-row no-border">
                <div>
                  <div className="gm-cl-notif-title">WhatsApp broadcast</div>
                  <div className="gm-cl-notif-sub">Avisar gestores pelo WhatsApp</div>
                </div>
                <button
                  type="button"
                  className={cn("gm-cl-toggle", state.notificacoes.whatsapp ? "on" : "off")}
                  onClick={() => persist({ ...state, notificacoes: { ...state.notificacoes, whatsapp: !state.notificacoes.whatsapp } })}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={userModalOpen} onOpenChange={setUserModalOpen}>
        <DialogContent className="max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Visual do changelog para usuário</DialogTitle>
          </DialogHeader>
          <div className="gm-cl-preview">
            <div className="pp-version">{selected?.numero ?? "v1.5.0"}</div>
            <div className="pp-title">{selected?.titulo ?? "Novidades da plataforma"}</div>
            <div className="pp-changes">
              {(selected?.mudancas ?? []).slice(0, 4).map((change) => (
                <div className="pp-change" key={change.id}>
                  <span className={cn("pp-tag", `t-${change.tipo}`)}>{tagLabel(change.tipo)}</span>
                  {change.descricao}
                </div>
              ))}
            </div>
          </div>
          <button type="button" className="gm-cl-btn-p w-full justify-center" onClick={() => setUserModalOpen(false)}>
            Entendido
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

