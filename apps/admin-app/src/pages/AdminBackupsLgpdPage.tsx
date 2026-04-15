import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { cn } from "@/lib/utils";
import {
  type Backup,
  type BackupsLgpdState,
  type ConfigBackup,
  type SolicitacaoLGPD,
  type StatusSolicitacao,
  type TipoSolicitacaoLGPD,
  countLgpdPendentes,
  diasCorridosRestantes,
  loadBackupsLgpdState,
  loadBackupsLgpdStateFromBackend,
  newBackupId,
  newLgpdId,
  saveBackupsLgpdState,
  slaClassParaPendente,
} from "@/services/adminBackupsLgpdStore";
import { toast } from "sonner";

type FiltroDias = "7" | "30" | "all";

const TIPO_LABEL: Record<TipoSolicitacaoLGPD, string> = {
  acesso: "ACESSO AOS DADOS",
  exclusao: "EXCLUSÃO DE DADOS",
  portabilidade: "PORTABILIDADE",
  correcao: "CORREÇÃO",
  oposicao: "OPOSIÇÃO",
};

const STATUS_RESPOSTA_OPTIONS = [
  { value: "exportado", label: "Dados exportados e enviados" },
  { value: "excluido", label: "Dados excluídos conforme solicitado" },
  { value: "informado", label: "Informações enviadas ao titular" },
  { value: "negado", label: "Solicitação negada (com justificativa)" },
] as const;

const EXPORT_CHECKBOXES = [
  { id: "perfil", label: "Dados de perfil" },
  { id: "emissoes", label: "Histórico de emissões" },
  { id: "assinatura", label: "Dados de assinatura" },
  { id: "logs", label: "Logs de acesso" },
] as const;

const DATA_CATEGORIES = [
  { emoji: "👤", name: "Dados de identificação", desc: "Nome, e-mail, CPF, telefone, data de nascimento", basis: "Execução de contrato", bg: "#EFF6FF" },
  { emoji: "✈️", name: "Dados de milhas e viagens", desc: "Programas de fidelidade, saldo de milhas, emissões", basis: "Execução de contrato", bg: "#FFFBEB" },
  { emoji: "💳", name: "Dados financeiros", desc: "Histórico de pagamentos, assinaturas (sem dados de cartão)", basis: "Obrigação legal", bg: "var(--ok-bg)" },
  { emoji: "📊", name: "Dados de uso da plataforma", desc: "Logs de acesso, ações realizadas, dispositivo", basis: "Legítimo interesse", bg: "var(--ps)" },
] as const;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatBackupNomeManual(d: Date): string {
  return `backup_manual_${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}-${pad2(d.getMinutes())}.sql.gz`;
}

function formatBackupNomeAuto(d: Date): string {
  return `backup_${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}-${pad2(d.getMinutes())}.sql.gz`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatUltimoBackupLabel(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const t = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (isSameDay(d, now)) return `Hoje, ${t}`;
  if (isSameDay(d, yesterday)) return `Ontem, ${t}`;
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} · ${t}`;
}

function formatProximoBackupLabel(config: ConfigBackup): string {
  if (!config.backupAutomaticoAtivo) return "Desativado";
  const now = new Date();
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  const [hh, mm] = config.horarioBackup.split(":").map((x) => Number(x));
  if (Number.isFinite(hh)) next.setHours(hh, Number.isFinite(mm) ? mm : 0, 0, 0);
  return `${next.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "short" })} às ${config.horarioBackup}`;
}

function formatTamanho(n: number): string {
  return `${n.toFixed(1).replace(".", ",")} GB`;
}

function formatBackupListMeta(b: Backup): string {
  const d = new Date(b.criadoEm);
  const partTipo =
    b.tipo === "automatico" ? "Automático" : `Manual por ${b.criadoPor ?? "Admin"}`;
  const partData = d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return `${partTipo} · ${formatTamanho(b.tamanhoGB)} · ${partData}`;
}

function formatRecebida(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

function backupDentroRetencao(b: Backup, diasRetencao: number): boolean {
  const limite = Date.now() - diasRetencao * 86_400_000;
  return new Date(b.criadoEm).getTime() >= limite;
}

function filtrarPorJanela(backups: Backup[], filtro: FiltroDias): Backup[] {
  if (filtro === "all") return backups;
  const dias = filtro === "7" ? 7 : 30;
  const limite = Date.now() - dias * 86_400_000;
  return backups.filter((b) => new Date(b.criadoEm).getTime() >= limite);
}

function tipoEmoji(t: TipoSolicitacaoLGPD): string {
  if (t === "acesso") return "📋";
  if (t === "exclusao") return "🗑️";
  if (t === "portabilidade") return "📤";
  if (t === "correcao") return "✏️";
  return "🛡️";
}

function tipoBg(t: TipoSolicitacaoLGPD): string {
  if (t === "acesso") return "#EFF6FF";
  if (t === "exclusao") return "#FEF2F2";
  if (t === "portabilidade") return "#F0FDF4";
  if (t === "correcao") return "#FFFBEB";
  return "#F5F5F6";
}

function mapRespostaToStatus(v: (typeof STATUS_RESPOSTA_OPTIONS)[number]["value"]): StatusSolicitacao {
  return v === "negado" ? "negado" : "concluido";
}

export default function AdminBackupsLgpdPage() {
  const { perfilNome } = useAdminAuth();
  const [state, setState] = useState<BackupsLgpdState>(() => loadBackupsLgpdState());
  const [filtroDias, setFiltroDias] = useState<FiltroDias>("30");
  const [retencaoOpen, setRetencaoOpen] = useState(false);
  const [retencaoDraft, setRetencaoDraft] = useState(String(loadBackupsLgpdState().config.diasRetencao));
  const [respondOpen, setRespondOpen] = useState(false);
  const [novaOpen, setNovaOpen] = useState(false);
  const [selectedSolicitacaoId, setSelectedSolicitacaoId] = useState<string | null>(null);
  const [respostaStatus, setRespostaStatus] = useState<(typeof STATUS_RESPOSTA_OPTIONS)[number]["value"]>("informado");
  const [respostaTexto, setRespostaTexto] = useState("");
  const [enviarEmail, setEnviarEmail] = useState(true);
  const [exportIncluir, setExportIncluir] = useState<Record<string, boolean>>({
    perfil: true,
    emissoes: true,
    assinatura: true,
    logs: true,
  });
  const [novaForm, setNovaForm] = useState<{
    tipo: TipoSolicitacaoLGPD;
    titular: string;
    email: string;
    descricao: string;
  }>({ tipo: "acesso", titular: "", email: "", descricao: "" });

  useEffect(() => {
    setState(loadBackupsLgpdState());
    void loadBackupsLgpdStateFromBackend().then((remote) => setState(remote));
    const fn = () => setState(loadBackupsLgpdState());
    window.addEventListener("gm-admin-backups-lgpd-updated", fn);
    return () => window.removeEventListener("gm-admin-backups-lgpd-updated", fn);
  }, []);

  const ultimoBackupIso = useMemo(() => {
    const completos = state.backups.filter((b) => b.status === "completo");
    if (!completos.length) return null;
    return completos.reduce((best, b) => (new Date(b.criadoEm) > new Date(best.criadoEm) ? b : best)).criadoEm;
  }, [state.backups]);

  const ultimoBackup = useMemo(() => {
    if (!ultimoBackupIso) return null;
    return state.backups.find((b) => b.criadoEm === ultimoBackupIso) ?? null;
  }, [state.backups, ultimoBackupIso]);

  const backupsRetidosCount = useMemo(
    () => state.backups.filter((b) => backupDentroRetencao(b, state.config.diasRetencao)).length,
    [state.backups, state.config.diasRetencao],
  );

  const pendentes = useMemo(() => countLgpdPendentes(state), [state]);

  const backupsFiltrados = useMemo(() => filtrarPorJanela(state.backups, filtroDias), [state.backups, filtroDias]);

  const selectedSolicitacao = useMemo(
    () => (selectedSolicitacaoId ? state.solicitacoes.find((s) => s.id === selectedSolicitacaoId) ?? null : null),
    [selectedSolicitacaoId, state.solicitacoes],
  );

  const persist = useCallback((next: BackupsLgpdState) => {
    setState(next);
    saveBackupsLgpdState(next);
  }, []);

  const runBackupManual = useCallback(() => {
    const now = new Date();
    const next: Backup = {
      id: newBackupId(),
      nomeArquivo: formatBackupNomeManual(now),
      tipo: "manual",
      tamanhoGB: Math.round((2.1 + Math.random() * 0.4) * 10) / 10,
      status: "completo",
      criadoEm: now.toISOString(),
      criadoPor: perfilNome ?? "Admin",
      urlDownload: `bk-${Date.now()}`,
      expiraEm: new Date(now.getTime() + state.config.diasRetencao * 86_400_000).toISOString(),
    };
    persist({ ...state, backups: [next, ...state.backups] });
    toast.success("Backup manual registrado.");
  }, [perfilNome, persist, state]);

  const runForcarBackup = useCallback(() => {
    if (!state.config.backupAutomaticoAtivo) {
      toast.message("Ative o backup automático ou use «Backup manual agora».");
      return;
    }
    const now = new Date();
    const next: Backup = {
      id: newBackupId(),
      nomeArquivo: formatBackupNomeAuto(now),
      tipo: "automatico",
      tamanhoGB: Math.round((2.2 + Math.random() * 0.5) * 10) / 10,
      status: "completo",
      criadoEm: now.toISOString(),
      urlDownload: `bk-${Date.now()}`,
      expiraEm: new Date(now.getTime() + state.config.diasRetencao * 86_400_000).toISOString(),
    };
    persist({ ...state, backups: [next, ...state.backups] });
    toast.success("Backup forçado concluído.");
  }, [persist, state]);

  const downloadManifest = useCallback(
    (b: Backup) => {
      const body = JSON.stringify(
        {
          arquivo: b.nomeArquivo,
          tipo: b.tipo,
          tamanhoGB: b.tamanhoGB,
          criadoEm: b.criadoEm,
          observacao: "Manifesto simulado — o ficheiro de backup real é gerido na infraestrutura.",
        },
        null,
        2,
      );
      const blob = new Blob([body], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${b.nomeArquivo.replace(/\.[^.]+$/, "")}-manifest.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Download do manifesto iniciado.");
    },
    [],
  );

  const openResponder = (s: SolicitacaoLGPD) => {
    setSelectedSolicitacaoId(s.id);
    setRespostaStatus("informado");
    setRespostaTexto(s.respostaTexto ?? "");
    setEnviarEmail(true);
    setExportIncluir({ perfil: true, emissoes: true, assinatura: true, logs: true });
    setRespondOpen(true);
  };

  const salvarResposta = () => {
    if (!selectedSolicitacao) return;
    const status = mapRespostaToStatus(respostaStatus);
    const inclusao =
      selectedSolicitacao.tipo === "acesso" || selectedSolicitacao.tipo === "portabilidade"
        ? EXPORT_CHECKBOXES.filter((c) => exportIncluir[c.id]).map((c) => c.id)
        : undefined;
    const updated = state.solicitacoes.map((s) =>
      s.id === selectedSolicitacao.id
        ? {
            ...s,
            status,
            respondidaEm: new Date().toISOString(),
            respostaTexto: respostaTexto.trim() || undefined,
            enviarEmail,
            inclusaoExport: inclusao,
          }
        : s,
    );
    persist({ ...state, solicitacoes: updated });
    setRespondOpen(false);
    toast.success(enviarEmail ? "Resposta guardada (simulação de e-mail)." : "Resposta guardada.");
  };

  const salvarNovaSolicitacao = () => {
    if (!novaForm.email.trim() || !novaForm.titular.trim()) {
      toast.error("Preencha titular e e-mail.");
      return;
    }
    const recebida = new Date().toISOString();
    const prazo = new Date(new Date(recebida).getTime() + 15 * 86_400_000).toISOString();
    const novo: SolicitacaoLGPD = {
      id: newLgpdId(),
      tipo: novaForm.tipo,
      titular: novaForm.titular.trim(),
      email: novaForm.email.trim(),
      descricao: novaForm.descricao.trim() || "—",
      status: "pendente",
      recebidaEm: recebida,
      prazoLegal: prazo,
    };
    persist({ ...state, solicitacoes: [novo, ...state.solicitacoes] });
    setNovaOpen(false);
    setNovaForm({ tipo: "acesso", titular: "", email: "", descricao: "" });
    toast.success("Solicitação registada.");
  };

  const setToggle = (key: keyof Pick<ConfigBackup, "backupAutomaticoAtivo" | "notifEmailAtivo" | "cloudExternaAtivo">, value: boolean) => {
    persist({ ...state, config: { ...state.config, [key]: value } });
  };

  const salvarRetencao = () => {
    const n = Number(retencaoDraft);
    if (!Number.isFinite(n) || n < 1 || n > 365) {
      toast.error("Retenção entre 1 e 365 dias.");
      return;
    }
    persist({ ...state, config: { ...state.config, diasRetencao: Math.round(n) } });
    setRetencaoOpen(false);
    toast.success("Política de retenção atualizada.");
  };

  const renderSlaLinha = (s: SolicitacaoLGPD) => {
    if (s.status === "concluido" || s.status === "negado") {
      const usado = s.respondidaEm
        ? Math.max(1, Math.ceil((new Date(s.respondidaEm).getTime() - new Date(s.recebidaEm).getTime()) / 86_400_000))
        : 0;
      return (
        <div className="gm-bl-lgpd-date">
          Concluído em {usado} dia{usado !== 1 ? "s" : ""} ·{" "}
          <span className="gm-bl-sla-ok">✓ Dentro do prazo</span>
        </div>
      );
    }
    const dias = diasCorridosRestantes(s.prazoLegal);
    const sla = slaClassParaPendente(dias);
    if (sla === "vencido") {
      return (
        <div className="gm-bl-lgpd-date">
          Recebido em {formatRecebida(s.recebidaEm)} · <span className="gm-bl-sla-vencido">🔴 PRAZO VENCIDO</span>
        </div>
      );
    }
    if (sla === "err") {
      return (
        <div className="gm-bl-lgpd-date">
          Recebido em {formatRecebida(s.recebidaEm)} · <span className="gm-bl-sla-err">⏰ {dias} dia{dias !== 1 ? "s" : ""} restantes</span>
        </div>
      );
    }
    if (sla === "warn") {
      return (
        <div className="gm-bl-lgpd-date">
          Recebido em {formatRecebida(s.recebidaEm)} · <span className="gm-bl-sla-warn">⏰ Prazo: {dias} dias restantes</span>
        </div>
      );
    }
    return (
      <div className="gm-bl-lgpd-date">
        Recebido em {formatRecebida(s.recebidaEm)} · <span className="gm-bl-sla-ok">⏰ {dias} dias restantes</span>
      </div>
    );
  };

  return (
    <div className="gm-bl-page">
      <div className="gm-bl-head">
        <div>
          <div className="gm-bl-title">Backups & LGPD</div>
          <div className="gm-bl-sub">
            Proteção de dados, cópias de segurança e conformidade com a Lei Geral de Proteção de Dados
          </div>
        </div>
        <div className="gm-bl-head-actions">
          <button
            type="button"
            className="gm-bl-btn-o"
            onClick={() => toast.info("Associe a URL da política nas páginas públicas do produto.")}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
              <rect x="1.5" y="1.5" width="10" height="10" rx="2" />
              <line x1="4.5" y1="5" x2="8.5" y2="5" />
              <line x1="4.5" y1="7.5" x2="7" y2="7.5" />
            </svg>
            Política de privacidade
          </button>
          <button type="button" className="gm-bl-btn-p" onClick={runBackupManual}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <ellipse cx="6.5" cy="4" rx="5" ry="2" />
              <path d="M1.5 4v5c0 1.1 2.2 2 5 2s5-.9 5-2V4" />
              <path d="M1.5 6.5c0 1.1 2.2 2 5 2s5-.9 5-2" />
            </svg>
            Backup manual agora
          </button>
        </div>
      </div>

      <div className="gm-bl-kpi4">
        <div className="gm-bl-kpi gr">
          <div className="gm-bl-kl">Último backup</div>
          <div className={cn("gm-bl-kv", "gm-bl-kv-ok")}>{formatUltimoBackupLabel(ultimoBackupIso)}</div>
          <div className="gm-bl-ks">backup automático diário</div>
        </div>
        <div className="gm-bl-kpi pu">
          <div className="gm-bl-kl">Backups retidos</div>
          <div className="gm-bl-kv">{backupsRetidosCount}</div>
          <div className="gm-bl-ks">últimos {state.config.diasRetencao} dias (política atual)</div>
        </div>
        <div className="gm-bl-kpi am">
          <div className="gm-bl-kl">Solicitações LGPD</div>
          <div className={cn("gm-bl-kv", pendentes > 0 && "gm-bl-kv-warn")}>{pendentes}</div>
          <div className="gm-bl-ks">aguardando resposta (prazo: 15 dias)</div>
        </div>
        <div className="gm-bl-kpi bl">
          <div className="gm-bl-kl">Conformidade LGPD</div>
          <div className="gm-bl-kv gm-bl-kv-info">{state.conformidade.scorePercent}%</div>
          <div className="gm-bl-ks">score de adequação estimado</div>
        </div>
      </div>

      <div className="gm-bl-g2">
        <div className="gm-bl-col">
          <div className="gm-bl-backup-hero">
            <div className="gm-bl-bh-left">
              <div className="gm-bl-bh-label">Status do backup</div>
              <div className="gm-bl-bh-status">
                <span className="gm-bl-bh-dot" />
                Sistema protegido
              </div>
              <div className="gm-bl-bh-sub">
                Último backup: {ultimoBackup ? formatUltimoBackupLabel(ultimoBackup.criadoEm).toLowerCase() : "—"} ·{" "}
                {ultimoBackup ? formatTamanho(ultimoBackup.tamanhoGB) : "—"}
              </div>
            </div>
            <div className="gm-bl-bh-right">
              <div className="gm-bl-bh-next-label">Próximo backup automático</div>
              <div className="gm-bl-bh-next">{formatProximoBackupLabel(state.config)}</div>
              <button type="button" className="gm-bl-btn-sm gm-bl-btn-sm-ok gm-bl-bh-force" onClick={runForcarBackup}>
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
                  <path d="M1 6a5 5 0 0 1 9-3M10 5a5 5 0 0 1-9 3" />
                  <polyline points="7,1 9,3 7,5" />
                </svg>
                Forçar agora
              </button>
            </div>
          </div>

          <div className="gm-bl-card">
            <div className="gm-bl-card-h">
              <div className="gm-bl-card-ti">
                <div className="gm-bl-card-ic gm-bl-ic-ok">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <ellipse cx="6.5" cy="4" rx="5" ry="2" />
                    <path d="M1.5 4v5c0 1.1 2.2 2 5 2s5-.9 5-2V4" />
                    <path d="M1.5 6.5c0 1.1 2.2 2 5 2s5-.9 5-2" />
                  </svg>
                </div>
                Backups disponíveis
              </div>
              <select
                className="gm-bl-select"
                value={filtroDias}
                onChange={(e) => setFiltroDias(e.target.value as FiltroDias)}
                aria-label="Período"
              >
                <option value="7">Últimos 7 dias</option>
                <option value="30">Últimos 30 dias</option>
                <option value="all">Todos</option>
              </select>
            </div>
            {backupsFiltrados.map((b) => (
              <div key={b.id} className="gm-bl-backup-item">
                <div className={cn("gm-bl-bk-ic", b.tipo === "automatico" ? "gm-bl-bk-auto" : "gm-bl-bk-manual")}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <polyline points="2,7 5.5,10.5 12,4" />
                  </svg>
                </div>
                <div className="gm-bl-bk-info">
                  <div className="gm-bl-bk-name">{b.nomeArquivo}</div>
                  <div className="gm-bl-bk-meta">{formatBackupListMeta(b)}</div>
                </div>
                <span className={cn("gm-bl-badge", b.tipo === "automatico" ? "gm-bl-b-ok" : "gm-bl-b-pu")}>
                  {b.tipo === "automatico" ? "Completo" : "Manual"}
                </span>
                <button type="button" className="gm-bl-ic-btn" title="Baixar manifesto" onClick={() => downloadManifest(b)}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
                    <path d="M2 8.5V10h8V8.5" />
                    <path d="M6 1.5v6" />
                    <polyline points="3.5,5.5 6,8 8.5,5.5" />
                  </svg>
                </button>
              </div>
            ))}
            <div className="gm-bl-card-foot">
              <span>
                {backupsRetidosCount} backups retidos · política: {state.config.diasRetencao} dias
              </span>
              <button type="button" className="gm-bl-link" onClick={() => { setRetencaoDraft(String(state.config.diasRetencao)); setRetencaoOpen(true); }}>
                Configurar retenção →
              </button>
            </div>
          </div>

          <div className="gm-bl-card">
            <div className="gm-bl-card-h">
              <div className="gm-bl-card-ti">
                <div className="gm-bl-card-ic gm-bl-ic-pu">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#8A05BE" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <circle cx="6.5" cy="6.5" r="2" />
                    <path d="M6.5 1v1.5M6.5 10V11.5M1 6.5h1.5M10 6.5H11.5" />
                  </svg>
                </div>
                Configurações de backup
              </div>
            </div>
            <div className="gm-bl-toggle-row">
              <div>
                <div className="gm-bl-tog-title">Backup automático diário</div>
                <div className="gm-bl-tog-sub">Todos os dias às {state.config.horarioBackup} (UTC-3)</div>
              </div>
              <button
                type="button"
                className={cn("gm-bl-toggle", state.config.backupAutomaticoAtivo ? "on" : "off")}
                onClick={() => setToggle("backupAutomaticoAtivo", !state.config.backupAutomaticoAtivo)}
                aria-pressed={state.config.backupAutomaticoAtivo}
                aria-label="Backup automático diário"
              />
            </div>
            <div className="gm-bl-toggle-row">
              <div>
                <div className="gm-bl-tog-title">Notificação por e-mail</div>
                <div className="gm-bl-tog-sub">Alerta quando backup falha</div>
              </div>
              <button
                type="button"
                className={cn("gm-bl-toggle", state.config.notifEmailAtivo ? "on" : "off")}
                onClick={() => setToggle("notifEmailAtivo", !state.config.notifEmailAtivo)}
                aria-pressed={state.config.notifEmailAtivo}
                aria-label="Notificação por e-mail"
              />
            </div>
            <div className="gm-bl-toggle-row last">
              <div>
                <div className="gm-bl-tog-title">Backup em nuvem externa</div>
                <div className="gm-bl-tog-sub">Cópia redundante (S3 / GCS)</div>
              </div>
              <button
                type="button"
                className={cn("gm-bl-toggle", state.config.cloudExternaAtivo ? "on" : "off")}
                onClick={() => setToggle("cloudExternaAtivo", !state.config.cloudExternaAtivo)}
                aria-pressed={state.config.cloudExternaAtivo}
                aria-label="Backup em nuvem externa"
              />
            </div>
          </div>
        </div>

        <div className="gm-bl-col">
          <div className="gm-bl-card">
            <div className="gm-bl-card-h">
              <div className="gm-bl-card-ti">
                <div className="gm-bl-card-ic gm-bl-ic-info">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <path d="M6.5 1L1.5 3.5v4C1.5 10.5 3.8 12.5 6.5 13c2.7-.5 5-2.5 5-5.5v-4L6.5 1Z" />
                  </svg>
                </div>
                Conformidade LGPD
              </div>
              <span className="gm-bl-score">{state.conformidade.scorePercent}%</span>
            </div>
            <div className="gm-bl-conf-body">
              <div className="gm-bl-conf-row">
                {state.conformidade.politicaPublicada ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <polyline points="2,7 5.5,10.5 12,4" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <path d="M7 2L2 11h10L7 2Z" />
                    <line x1="7" y1="6" x2="7" y2="8" />
                    <circle cx="7" cy="10" r=".5" fill="#D97706" />
                  </svg>
                )}
                <span className="gm-bl-conf-txt">Política de privacidade publicada</span>
                {state.conformidade.politicaPublicada ? <span className="gm-bl-conf-ok">✓</span> : <span className="gm-bl-conf-warn">Pendente</span>}
              </div>
              <div className="gm-bl-conf-row">
                {state.conformidade.logConsentimentos ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <polyline points="2,7 5.5,10.5 12,4" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <path d="M7 2L2 11h10L7 2Z" />
                    <line x1="7" y1="6" x2="7" y2="8" />
                    <circle cx="7" cy="10" r=".5" fill="#D97706" />
                  </svg>
                )}
                <span className="gm-bl-conf-txt">Log de consentimentos ativo</span>
                {state.conformidade.logConsentimentos ? <span className="gm-bl-conf-ok">✓</span> : <span className="gm-bl-conf-warn">Pendente</span>}
              </div>
              <div className="gm-bl-conf-row">
                {state.conformidade.canalAtivo ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <polyline points="2,7 5.5,10.5 12,4" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <path d="M7 2L2 11h10L7 2Z" />
                    <line x1="7" y1="6" x2="7" y2="8" />
                    <circle cx="7" cy="10" r=".5" fill="#D97706" />
                  </svg>
                )}
                <span className="gm-bl-conf-txt">Canal de solicitações LGPD ativo</span>
                {state.conformidade.canalAtivo ? <span className="gm-bl-conf-ok">✓</span> : <span className="gm-bl-conf-warn">Pendente</span>}
              </div>
              <div className="gm-bl-conf-row">
                {state.conformidade.dpoDesignado ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <polyline points="2,7 5.5,10.5 12,4" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <path d="M7 2L2 11h10L7 2Z" />
                    <line x1="7" y1="6" x2="7" y2="8" />
                    <circle cx="7" cy="10" r=".5" fill="#D97706" />
                  </svg>
                )}
                <span className="gm-bl-conf-txt">DPO (Encarregado) designado</span>
                {state.conformidade.dpoDesignado ? <span className="gm-bl-conf-ok">✓</span> : <span className="gm-bl-conf-warn">Pendente</span>}
              </div>
              <div className="gm-bl-conf-row">
                {state.conformidade.ripdOk ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <polyline points="2,7 5.5,10.5 12,4" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <path d="M7 2L2 11h10L7 2Z" />
                    <line x1="7" y1="6" x2="7" y2="8" />
                    <circle cx="7" cy="10" r=".5" fill="#D97706" />
                  </svg>
                )}
                <span className="gm-bl-conf-txt">RIPD (Relatório de impacto)</span>
                {state.conformidade.ripdOk ? <span className="gm-bl-conf-ok">✓</span> : <span className="gm-bl-conf-warn">Pendente</span>}
              </div>
            </div>
          </div>

          <div className="gm-bl-card">
            <div className="gm-bl-card-h">
              <div className="gm-bl-card-ti">
                <div className="gm-bl-card-ic gm-bl-ic-warn">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <circle cx="6.5" cy="4.5" r="2.5" />
                    <path d="M1.5 12.5c0-2.5 2.2-4 5-4s5 1.5 5 4" />
                    <line x1="9" y1="7" x2="12" y2="7" />
                  </svg>
                </div>
                Solicitações de titulares
              </div>
              <button type="button" className="gm-bl-btn-sm gm-bl-btn-sm-p" onClick={() => setNovaOpen(true)}>
                + Nova resposta
              </button>
            </div>
            {state.solicitacoes.map((s) => (
              <div
                key={s.id}
                className={cn("gm-bl-lgpd-item", (s.status === "concluido" || s.status === "negado") && "resolved")}
              >
                <div className="gm-bl-lgpd-ic" style={{ background: tipoBg(s.tipo) }}>
                  {tipoEmoji(s.tipo)}
                </div>
                <div className="gm-bl-lgpd-info">
                  <div>
                    <span className={cn("gm-bl-lgpd-type", `t-${s.tipo}`)}>{TIPO_LABEL[s.tipo]}</span>
                  </div>
                  <div className="gm-bl-lgpd-name">{s.email}</div>
                  <div className="gm-bl-lgpd-email">{s.descricao}</div>
                  {renderSlaLinha(s)}
                </div>
                <div className="gm-bl-lgpd-actions">
                  <span
                    className={cn(
                      "gm-bl-badge",
                      s.status === "pendente" && "gm-bl-b-warn",
                      s.status === "em_andamento" && "gm-bl-b-info",
                      (s.status === "concluido" || s.status === "negado") && "gm-bl-b-ok",
                    )}
                  >
                    {s.status === "pendente" ? "Pendente" : s.status === "em_andamento" ? "Em andamento" : s.status === "negado" ? "Negado" : "Concluído"}
                  </span>
                  {s.status === "pendente" || s.status === "em_andamento" ? (
                    <button type="button" className="gm-bl-btn-sm gm-bl-btn-sm-p gm-bl-resp-btn" onClick={() => openResponder(s)}>
                      Responder
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
            {pendentes > 0 ? (
              <div className="gm-bl-lgpd-foot">
                ⚠ {pendentes} solicitações aguardam resposta em até 15 dias (LGPD Art. 18)
              </div>
            ) : null}
          </div>

          <div className="gm-bl-card" id="gm-bl-mapeamento">
            <div className="gm-bl-card-h">
              <div className="gm-bl-card-ti">
                <div className="gm-bl-card-ic gm-bl-ic-pu">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#8A05BE" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <rect x="1.5" y="1.5" width="10" height="10" rx="2" />
                    <line x1="4.5" y1="5" x2="8.5" y2="5" />
                    <line x1="4.5" y1="7.5" x2="8.5" y2="7.5" />
                  </svg>
                </div>
                Dados tratados
              </div>
              <button type="button" className="gm-bl-link" onClick={() => document.getElementById("gm-bl-mapeamento")?.scrollIntoView({ behavior: "smooth" })}>
                Ver mapeamento →
              </button>
            </div>
            {DATA_CATEGORIES.map((row) => (
              <div key={row.name} className="gm-bl-data-cat">
                <div className="gm-bl-dc-icon" style={{ background: row.bg }}>
                  {row.emoji}
                </div>
                <div>
                  <div className="gm-bl-dc-name">{row.name}</div>
                  <div className="gm-bl-dc-desc">{row.desc}</div>
                  <span className="gm-bl-dc-basis">{row.basis}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Dialog open={retencaoOpen} onOpenChange={setRetencaoOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Retenção de backups (dias)</DialogTitle>
          </DialogHeader>
          <Input value={retencaoDraft} onChange={(e) => setRetencaoDraft(e.target.value)} inputMode="numeric" />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setRetencaoOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" className="bg-[#8A05BE] hover:bg-[#6A00A3]" onClick={salvarRetencao}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={novaOpen} onOpenChange={setNovaOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova solicitação de titular</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={novaForm.tipo} onValueChange={(v) => setNovaForm((f) => ({ ...f, tipo: v as TipoSolicitacaoLGPD }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TIPO_LABEL) as TipoSolicitacaoLGPD[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {TIPO_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nome do titular</Label>
              <Input value={novaForm.titular} onChange={(e) => setNovaForm((f) => ({ ...f, titular: e.target.value }))} />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input value={novaForm.email} onChange={(e) => setNovaForm((f) => ({ ...f, email: e.target.value }))} type="email" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={novaForm.descricao} onChange={(e) => setNovaForm((f) => ({ ...f, descricao: e.target.value }))} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNovaOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" className="bg-[#8A05BE] hover:bg-[#6A00A3]" onClick={salvarNovaSolicitacao}>
              Registar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={respondOpen} onOpenChange={setRespondOpen}>
        <DialogContent className="gm-bl-modal max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex flex-col gap-2 text-left">
              {selectedSolicitacao ? (
                <>
                  <span className={cn("gm-bl-lgpd-type inline-flex w-fit", `t-${selectedSolicitacao.tipo}`)}>
                    {TIPO_LABEL[selectedSolicitacao.tipo]}
                  </span>
                  <span className="text-base font-semibold text-[#1F1F1F]">{selectedSolicitacao.titular}</span>
                  <span className="text-xs font-normal text-[#9B9B9B]">
                    Solicitação recebida em {formatRecebida(selectedSolicitacao.recebidaEm)} · Prazo:{" "}
                    {new Date(selectedSolicitacao.prazoLegal).toLocaleDateString("pt-BR")} (
                    {diasCorridosRestantes(selectedSolicitacao.prazoLegal)} dias restantes)
                  </span>
                </>
              ) : null}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <Label>O que foi feito</Label>
              <Select value={respostaStatus} onValueChange={(v) => setRespostaStatus(v as (typeof STATUS_RESPOSTA_OPTIONS)[number]["value"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_RESPOSTA_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Resposta para o titular</Label>
              <Textarea value={respostaTexto} onChange={(e) => setRespostaTexto(e.target.value)} rows={4} placeholder="Texto a comunicar ao titular" />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-[#ECECEC] px-3 py-2">
              <span className="text-sm font-medium text-[#1F1F1F]">Enviar por e-mail ao titular</span>
              <Switch checked={enviarEmail} onCheckedChange={setEnviarEmail} />
            </div>
            {selectedSolicitacao && (selectedSolicitacao.tipo === "acesso" || selectedSolicitacao.tipo === "portabilidade") ? (
              <div className="rounded-lg border border-[#ECECEC] p-3">
                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-[#9B9B9B]">Dados a incluir</div>
                <div className="flex flex-col gap-2">
                  {EXPORT_CHECKBOXES.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={exportIncluir[c.id]} onCheckedChange={(v) => setExportIncluir((prev) => ({ ...prev, [c.id]: Boolean(v) }))} />
                      {c.label}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setRespondOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" className="bg-[#8A05BE] hover:bg-[#6A00A3]" onClick={salvarResposta}>
              Salvar resposta e notificar titular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
