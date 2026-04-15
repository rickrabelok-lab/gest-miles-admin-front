import { useMemo, useState } from "react";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { cn } from "@/lib/utils";

type ReportTipo =
  | "receita_mrr"
  | "crescimento_usuarios"
  | "emissoes_gestor"
  | "leads_conversao"
  | "milhas_gerenciadas"
  | "performance_equipe";

type ReportFormato = "pdf" | "csv" | "xlsx";
type ReportStatus = "gerando" | "pronto" | "falhou";

interface ReportItem {
  id: string;
  tipo: ReportTipo;
  formato: ReportFormato;
  status: ReportStatus;
  nome: string;
  meta: string;
  tamanhoKb?: number;
  geradoEm: number;
}

interface ReportTypeMeta {
  tipo: ReportTipo;
  nome: string;
  descricao: string;
  emoji: string;
  className: string;
  bgClass: string;
  formatos: ReportFormato[];
}

type Frequencia = "diario" | "semanal" | "mensal" | "trimestral";

interface RelatorioAgendado {
  id: string;
  tipo: ReportTipo;
  formato: ReportFormato;
  frequencia: Frequencia;
  emailDestino: string;
  status: "ativo" | "pausado";
}

const REPORT_TYPES: ReportTypeMeta[] = [
  {
    tipo: "receita_mrr",
    nome: "Receita & MRR",
    descricao: "MRR, ARR, churn, receita por plano e crescimento mensal",
    emoji: "💰",
    className: "gm-rel-rc-finance",
    bgClass: "gm-rel-bg-finance",
    formatos: ["csv", "pdf", "xlsx"],
  },
  {
    tipo: "crescimento_usuarios",
    nome: "Crescimento de usuários",
    descricao: "Novos cadastros, DAU, MAU e retenção por período",
    emoji: "👥",
    className: "gm-rel-rc-users",
    bgClass: "gm-rel-bg-users",
    formatos: ["csv", "pdf"],
  },
  {
    tipo: "emissoes_gestor",
    nome: "Emissões por gestor",
    descricao: "Emissões realizadas, milhas usadas e economia por gestor",
    emoji: "✈️",
    className: "gm-rel-rc-ops",
    bgClass: "gm-rel-bg-ops",
    formatos: ["csv", "xlsx"],
  },
  {
    tipo: "leads_conversao",
    nome: "Leads & Conversão",
    descricao: "Funil de captação, taxa de conversão e origem dos leads",
    emoji: "🎯",
    className: "gm-rel-rc-marketing",
    bgClass: "gm-rel-bg-marketing",
    formatos: ["csv", "pdf"],
  },
  {
    tipo: "milhas_gerenciadas",
    nome: "Milhas gerenciadas",
    descricao: "Volume total, programas mais usados e economia gerada",
    emoji: "⭐",
    className: "gm-rel-rc-miles",
    bgClass: "gm-rel-bg-miles",
    formatos: ["csv", "pdf", "xlsx"],
  },
  {
    tipo: "performance_equipe",
    nome: "Performance por equipe",
    descricao: "Ranking de gestores, clientes ativos e score de produtividade",
    emoji: "🏆",
    className: "gm-rel-rc-team",
    bgClass: "gm-rel-bg-team",
    formatos: ["csv", "pdf"],
  },
];

function formatLabel(formato: ReportFormato): string {
  if (formato === "xlsx") return "Excel";
  return formato.toUpperCase();
}

function formatRelative(when: number): string {
  const diffMs = Date.now() - when;
  const hour = 60 * 60 * 1000;
  if (diffMs < hour) {
    const mins = Math.max(1, Math.round(diffMs / (60 * 1000)));
    return `há ${mins} min`;
  }
  if (diffMs < 24 * hour) {
    const hrs = Math.max(1, Math.round(diffMs / hour));
    return `há ${hrs}h`;
  }
  const d = new Date(when);
  return d.toLocaleDateString("pt-BR");
}

function fakeDownload(name: string, format: ReportFormato) {
  const content = `Relatório ${name}\nGerado em ${new Date().toISOString()}\n`;
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.toLowerCase().replace(/\s+/g, "-")}.${format === "xlsx" ? "xlsx" : format}`;
  a.click();
  URL.revokeObjectURL(url);
}

function nowId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`;
}

export default function AdminRelatoriosPage() {
  const { perfilNome, user } = useAdminAuth();
  const adminEmail =
    (user?.email && user.email.trim()) ||
    `${(perfilNome ?? "admin").toLowerCase().replace(/\s+/g, ".")}@gestmiles.com.br`;
  const selectedTeamName = "João Carvalho";

  const [selectedTipo, setSelectedTipo] = useState<ReportTipo>("receita_mrr");
  const [periodo, setPeriodo] = useState("este_mes");
  const [rangeDe, setRangeDe] = useState("2026-04-01");
  const [rangeAte, setRangeAte] = useState("2026-04-14");
  const [formato, setFormato] = useState<ReportFormato>("pdf");
  const [incluiGraficos, setIncluiGraficos] = useState(true);
  const [enviarEmail, setEnviarEmail] = useState(false);
  const [filtrarEquipe, setFiltrarEquipe] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const [agendarTipo, setAgendarTipo] = useState<ReportTipo>("receita_mrr");
  const [agendarFormato, setAgendarFormato] = useState<ReportFormato>("pdf");
  const [agendarFreq, setAgendarFreq] = useState<Frequencia>("mensal");
  const [agendarEmail, setAgendarEmail] = useState(adminEmail);

  const [historico, setHistorico] = useState<ReportItem[]>([
    {
      id: "hist_1",
      tipo: "receita_mrr",
      formato: "pdf",
      status: "pronto",
      nome: "Receita & MRR — Abril/2026",
      meta: "PDF · 284 KB · Rick Rabelo · há 2 horas",
      tamanhoKb: 284,
      geradoEm: Date.now() - 2 * 60 * 60 * 1000,
    },
    {
      id: "hist_2",
      tipo: "emissoes_gestor",
      formato: "xlsx",
      status: "pronto",
      nome: "Emissões por gestor — Mar/2026",
      meta: "XLSX · 156 KB · Rick Rabelo · ontem",
      tamanhoKb: 156,
      geradoEm: Date.now() - 28 * 60 * 60 * 1000,
    },
    {
      id: "hist_3",
      tipo: "milhas_gerenciadas",
      formato: "csv",
      status: "pronto",
      nome: "Milhas gerenciadas — T1 2026",
      meta: "CSV · 89 KB · Rick Rabelo · 10/04/2026",
      tamanhoKb: 89,
      geradoEm: Date.now() - 5 * 24 * 60 * 60 * 1000,
    },
    {
      id: "hist_4",
      tipo: "crescimento_usuarios",
      formato: "pdf",
      status: "gerando",
      nome: "Crescimento de usuários — Abril/2026",
      meta: "PDF · Gerando... · Rick Rabelo · agora",
      geradoEm: Date.now(),
    },
  ]);

  const [agendados, setAgendados] = useState<RelatorioAgendado[]>([
    {
      id: "sch_1",
      tipo: "receita_mrr",
      formato: "pdf",
      frequencia: "mensal",
      emailDestino: adminEmail,
      status: "ativo",
    },
    {
      id: "sch_2",
      tipo: "emissoes_gestor",
      formato: "xlsx",
      frequencia: "semanal",
      emailDestino: adminEmail,
      status: "ativo",
    },
    {
      id: "sch_3",
      tipo: "milhas_gerenciadas",
      formato: "csv",
      frequencia: "trimestral",
      emailDestino: adminEmail,
      status: "ativo",
    },
  ]);

  const selectedMeta = useMemo(
    () => REPORT_TYPES.find((item) => item.tipo === selectedTipo) ?? REPORT_TYPES[0],
    [selectedTipo],
  );

  const kpi = useMemo(() => {
    const now = Date.now();
    const geradosMes = historico.filter(
      (item) => item.status === "pronto" && now - item.geradoEm < 30 * 24 * 60 * 60 * 1000,
    );
    const maisGeradoMap = new Map<ReportTipo, number>();
    geradosMes.forEach((item) => {
      maisGeradoMap.set(item.tipo, (maisGeradoMap.get(item.tipo) ?? 0) + 1);
    });
    const winner = [...maisGeradoMap.entries()].sort((a, b) => b[1] - a[1])[0];
    const winnerTipo = winner?.[0] ?? "receita_mrr";
    const winnerCount = winner?.[1] ?? 0;
    const winnerName = REPORT_TYPES.find((item) => item.tipo === winnerTipo)?.nome ?? "Receita";
    const latest = [...historico].sort((a, b) => b.geradoEm - a.geradoEm)[0];
    const latestName = latest ? latest.nome : "—";
    return {
      geradosMes: geradosMes.length,
      latestText: latest ? `${formatRelative(latest.geradoEm)} · ${latestName}` : "Sem exportações",
      agendadosAtivos: agendados.filter((item) => item.status === "ativo").length,
      maisGeradoNome: winnerName,
      maisGeradoCount: winnerCount,
    };
  }, [historico, agendados]);

  const onSelectTipo = (tipo: ReportTipo) => {
    setSelectedTipo(tipo);
    const nextMeta = REPORT_TYPES.find((item) => item.tipo === tipo);
    if (nextMeta && !nextMeta.formatos.includes(formato)) {
      setFormato(nextMeta.formatos[0] ?? "pdf");
    }
  };

  const onGenerate = () => {
    if (isGenerating) return;
    setIsGenerating(true);
    const title = `${selectedMeta.nome} — ${
      periodo === "este_mes"
        ? "Abril/2026"
        : periodo === "mes_anterior"
          ? "Março/2026"
          : periodo === "ultimo_tri"
            ? "T1 2026"
            : periodo === "ultimo_sem"
              ? "Último semestre"
              : periodo === "este_ano"
                ? "2026"
                : `${rangeDe} a ${rangeAte}`
    }`;
    const id = nowId("hist");
    const newItem: ReportItem = {
      id,
      tipo: selectedTipo,
      formato,
      status: "gerando",
      nome: title,
      meta: `${formatLabel(formato).toUpperCase()} · Gerando... · ${perfilNome ?? "Admin"} · agora`,
      geradoEm: Date.now(),
    };
    setHistorico((prev) => [newItem, ...prev]);
    window.setTimeout(() => {
      setHistorico((prev) =>
        prev.map((item) =>
          item.id !== id
            ? item
            : {
                ...item,
                status: "pronto",
                tamanhoKb: 180,
                meta: `${formatLabel(formato).toUpperCase()} · 180 KB · ${perfilNome ?? "Admin"} · agora`,
              },
        ),
      );
      setIsGenerating(false);
      fakeDownload(selectedMeta.nome, formato);
    }, 1400);
  };

  const onSaveSchedule = () => {
    const tipoMeta = REPORT_TYPES.find((item) => item.tipo === agendarTipo) ?? REPORT_TYPES[0];
    setAgendados((prev) => [
      {
        id: nowId("sch"),
        tipo: agendarTipo,
        formato: agendarFormato,
        frequencia: agendarFreq,
        emailDestino: agendarEmail.trim() || adminEmail,
        status: "ativo",
      },
      ...prev,
    ]);
    setScheduleOpen(false);
    setAgendarTipo(tipoMeta.tipo);
  };

  const allowFormat = (fmt: ReportFormato) => selectedMeta.formatos.includes(fmt);

  return (
    <div className="gm-rel-page">
      <div className="gm-rel-page-head">
        <div>
          <div className="gm-rel-title">Relatórios Exportáveis</div>
          <div className="gm-rel-sub">
            Gere, agende e baixe relatórios em PDF, CSV ou Excel de toda a plataforma
          </div>
        </div>
      </div>

      <div className="gm-rel-kpi4">
        <div className="gm-rel-kpi gm-rel-kpi-pu">
          <div className="gm-rel-kl">Gerados este mês</div>
          <div className="gm-rel-kv">{kpi.geradosMes}</div>
          <div className="gm-rel-ks">relatórios exportados</div>
          <div className="gm-rel-kd gm-rel-kd-up">↑ +8 vs mês anterior</div>
        </div>
        <div className="gm-rel-kpi gm-rel-kpi-gr">
          <div className="gm-rel-kl">Última exportação</div>
          <div className="gm-rel-kv gm-rel-kv-sm">{kpi.latestText.split(" · ")[0] ?? "—"}</div>
          <div className="gm-rel-ks">{kpi.latestText.split(" · ").slice(1).join(" · ")}</div>
        </div>
        <div className="gm-rel-kpi gm-rel-kpi-am">
          <div className="gm-rel-kl">Relatórios agendados</div>
          <div className="gm-rel-kv">{kpi.agendadosAtivos}</div>
          <div className="gm-rel-ks">envios automáticos ativos</div>
        </div>
        <div className="gm-rel-kpi gm-rel-kpi-bl">
          <div className="gm-rel-kl">Mais gerado</div>
          <div className="gm-rel-kv gm-rel-kv-green gm-rel-kv-sm">{kpi.maisGeradoNome}</div>
          <div className="gm-rel-ks">{kpi.maisGeradoCount} gerações este mês</div>
        </div>
      </div>

      <div className="gm-rel-g21">
        <div className="gm-rel-col">
          <div className="gm-rel-card">
            <div className="gm-rel-card-h">
              <div className="gm-rel-card-ti">
                <div className="gm-rel-card-ic gm-rel-card-ic-pu">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#8A05BE" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <rect x="2" y="1.5" width="9" height="10" rx="2" />
                    <line x1="4.5" y1="5" x2="8.5" y2="5" />
                    <line x1="4.5" y1="7.5" x2="8.5" y2="7.5" />
                    <polyline points="4.5,10 5.5,11 7.5,9" />
                  </svg>
                </div>
                Tipos de relatório
              </div>
              <span className="gm-rel-card-sub">Clique em um para selecionar e gerar</span>
            </div>
            <div className="gm-rel-reports-grid">
              {REPORT_TYPES.map((item) => (
                <button
                  key={item.tipo}
                  type="button"
                  className={cn(
                    "gm-rel-report-card",
                    item.className,
                    selectedTipo === item.tipo && "selected",
                  )}
                  onClick={() => onSelectTipo(item.tipo)}
                >
                  <div className={cn("gm-rel-rc-icon", item.bgClass)}>{item.emoji}</div>
                  <div className="gm-rel-rc-name">{item.nome}</div>
                  <div className="gm-rel-rc-desc">{item.descricao}</div>
                  <div className="gm-rel-rc-formats">
                    {item.formatos.includes("csv") ? <span className="gm-rel-rc-fmt fmt-csv">CSV</span> : null}
                    {item.formatos.includes("pdf") ? <span className="gm-rel-rc-fmt fmt-pdf">PDF</span> : null}
                    {item.formatos.includes("xlsx") ? <span className="gm-rel-rc-fmt fmt-xlsx">XLSX</span> : null}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="gm-rel-card">
            <div className="gm-rel-card-h">
              <div className="gm-rel-card-ti">
                <div className="gm-rel-card-ic gm-rel-card-ic-ok">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <circle cx="6.5" cy="6.5" r="5.5" />
                    <path d="M6.5 4v2.5l1.5 1.5" />
                  </svg>
                </div>
                Histórico de exportações
              </div>
              <span className="gm-rel-link">Ver todos →</span>
            </div>

            {historico.map((item) => {
              const tmeta = REPORT_TYPES.find((x) => x.tipo === item.tipo) ?? REPORT_TYPES[0];
              return (
                <div key={item.id} className={cn("gm-rel-hist-item", item.status === "gerando" && "gm-rel-hist-item-warn")}>
                  <div className={cn("gm-rel-hist-ic", tmeta.bgClass)}>{tmeta.emoji}</div>
                  <div className="gm-rel-flex-1">
                    <div className="gm-rel-hist-name">{item.nome}</div>
                    <div className="gm-rel-hist-meta">{item.meta}</div>
                  </div>
                  <span
                    className={cn(
                      "badge",
                      item.status === "pronto" && "badge-ok",
                      item.status === "gerando" && "badge badge-warn",
                      item.status === "falhou" && "badge-err",
                    )}
                  >
                    {item.status === "pronto" ? "Pronto" : item.status === "gerando" ? "Gerando" : "Falhou"}
                  </span>
                  <button
                    type="button"
                    className={cn("gm-rel-ic-btn gm-rel-ic-btn-dl", item.status !== "pronto" && "disabled")}
                    disabled={item.status !== "pronto"}
                    onClick={() => fakeDownload(item.nome, item.formato)}
                    title="Baixar"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
                      <path d="M2 8.5V10h8V8.5" />
                      <path d="M6 1.5v6" />
                      <polyline points="3.5,5.5 6,8 8.5,5.5" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="gm-rel-col">
          <div className="gm-rel-card">
            <div className="gm-rel-card-h">
              <div className="gm-rel-card-ti">
                <div className="gm-rel-card-ic gm-rel-card-ic-pu">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#8A05BE" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <path d="M2 9.5V11h1.5L11 3.5 9.5 2 2 9.5Z" />
                    <line x1="7.5" y1="3.5" x2="9.5" y2="5.5" />
                  </svg>
                </div>
                Gerar relatório
              </div>
              <span className="gm-rel-badge">{selectedMeta.emoji} {selectedMeta.nome}</span>
            </div>

            <div className="gm-rel-form">
              <div className="gm-rel-field">
                <label className="gm-rel-flabel">Período</label>
                <select className="gm-rel-fselect" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
                  <option value="este_mes">Este mês (Abril/2026)</option>
                  <option value="mes_anterior">Mês anterior (Março/2026)</option>
                  <option value="ultimo_tri">Último trimestre (T1 2026)</option>
                  <option value="ultimo_sem">Último semestre</option>
                  <option value="este_ano">Este ano (2026)</option>
                  <option value="custom">Período personalizado</option>
                </select>
              </div>

              <div className={cn("gm-rel-fgrid2", periodo !== "custom" && "gm-rel-custom-hidden")}>
                <div className="gm-rel-field gm-rel-mb0">
                  <label className="gm-rel-flabel">De</label>
                  <input className="gm-rel-finput" type="date" value={rangeDe} onChange={(e) => setRangeDe(e.target.value)} />
                </div>
                <div className="gm-rel-field gm-rel-mb0">
                  <label className="gm-rel-flabel">Até</label>
                  <input className="gm-rel-finput" type="date" value={rangeAte} onChange={(e) => setRangeAte(e.target.value)} />
                </div>
              </div>

              <div className="gm-rel-field">
                <label className="gm-rel-flabel">Formato de exportação</label>
                <div className="gm-rel-fmt-selector">
                  {(["pdf", "csv", "xlsx"] as const).map((fmt) => {
                    const enabled = allowFormat(fmt);
                    return (
                      <button
                        key={fmt}
                        type="button"
                        className={cn(
                          "gm-rel-fmt-btn",
                          fmt,
                          formato === fmt && "active",
                          !enabled && "disabled",
                        )}
                        disabled={!enabled}
                        onClick={() => setFormato(fmt)}
                      >
                        <span>{formatLabel(fmt)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="gm-rel-toggle-box">
                <div className="gm-rel-toggle-row">
                  <div>
                    <div className="gm-rel-toggle-label">Incluir gráficos</div>
                    <div className="gm-rel-toggle-sub">Apenas em PDF</div>
                  </div>
                  <button type="button" className={cn("gm-rel-toggle", incluiGraficos ? "on" : "off")} onClick={() => setIncluiGraficos((p) => !p)} />
                </div>
                <div className="gm-rel-toggle-row">
                  <div>
                    <div className="gm-rel-toggle-label">Enviar por e-mail</div>
                    <div className="gm-rel-toggle-sub">Ao gerar, enviar para {adminEmail}</div>
                  </div>
                  <button type="button" className={cn("gm-rel-toggle", enviarEmail ? "on" : "off")} onClick={() => setEnviarEmail((p) => !p)} />
                </div>
                <div className="gm-rel-toggle-row">
                  <div>
                    <div className="gm-rel-toggle-label">Filtrar por equipe atual</div>
                    <div className="gm-rel-toggle-sub">Equipe do {selectedTeamName}</div>
                  </div>
                  <button type="button" className={cn("gm-rel-toggle", filtrarEquipe ? "on" : "off")} onClick={() => setFiltrarEquipe((p) => !p)} />
                </div>
              </div>

              <button type="button" className="gm-rel-btn-generate" disabled={isGenerating} onClick={onGenerate}>
                {isGenerating ? <span className="gm-rel-spinner" /> : null}
                {isGenerating ? "Gerando relatório..." : "Gerar e baixar agora"}
              </button>
            </div>
          </div>

          <div className="gm-rel-card">
            <div className="gm-rel-card-h">
              <div className="gm-rel-card-ti">
                <div className="gm-rel-card-ic gm-rel-card-ic-warn">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <rect x="1.5" y="2.5" width="10" height="9" rx="1.5" />
                    <line x1="4.5" y1="1" x2="4.5" y2="4" />
                    <line x1="8.5" y1="1" x2="8.5" y2="4" />
                    <line x1="1.5" y1="6" x2="11.5" y2="6" />
                  </svg>
                </div>
                Relatórios agendados
              </div>
              <button type="button" className="gm-rel-btn-sm-p" onClick={() => setScheduleOpen(true)}>
                + Agendar
              </button>
            </div>

            {agendados.map((item, idx) => {
              const meta = REPORT_TYPES.find((x) => x.tipo === item.tipo) ?? REPORT_TYPES[0];
              const freqLabel =
                item.frequencia === "diario"
                  ? "Diário"
                  : item.frequencia === "semanal"
                    ? "Toda segunda-feira"
                    : item.frequencia === "mensal"
                      ? "Todo 1º do mês"
                      : "Todo trimestre";
              return (
                <div key={item.id} className={cn("gm-rel-sched-row", idx === agendados.length - 1 && "last")}>
                  <div className={cn("gm-rel-sched-icon", meta.bgClass)}>{meta.emoji}</div>
                  <div className="gm-rel-flex-1">
                    <div className="gm-rel-sched-name">{meta.nome}</div>
                    <div className="gm-rel-sched-freq">
                      {item.formato.toUpperCase()} · {freqLabel} · {item.emailDestino}
                    </div>
                  </div>
                  <span className={cn("badge", item.status === "ativo" ? "badge-ok" : "badge badge-warn")}>
                    {item.status === "ativo" ? "Ativo" : "Pausado"}
                  </span>
                  <button type="button" className="gm-rel-ic-btn" title="Editar">
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                      <path d="M7.5 1.5L9.5 3.5 3.5 9.5H1.5V7.5L7.5 1.5Z" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="gm-rel-dialog max-w-[460px]" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Agendar relatório</DialogTitle>
          </DialogHeader>
          <div className="gm-rel-dialog-body">
            <div className="gm-rel-field">
              <label className="gm-rel-flabel">Tipo de relatório</label>
              <select className="gm-rel-fselect" value={agendarTipo} onChange={(e) => setAgendarTipo(e.target.value as ReportTipo)}>
                {REPORT_TYPES.map((item) => (
                  <option key={item.tipo} value={item.tipo}>
                    {item.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="gm-rel-fgrid2">
              <div className="gm-rel-field gm-rel-mb0">
                <label className="gm-rel-flabel">Formato</label>
                <select className="gm-rel-fselect" value={agendarFormato} onChange={(e) => setAgendarFormato(e.target.value as ReportFormato)}>
                  <option value="pdf">PDF</option>
                  <option value="csv">CSV</option>
                  <option value="xlsx">XLSX</option>
                </select>
              </div>
              <div className="gm-rel-field gm-rel-mb0">
                <label className="gm-rel-flabel">Frequência</label>
                <select className="gm-rel-fselect" value={agendarFreq} onChange={(e) => setAgendarFreq(e.target.value as Frequencia)}>
                  <option value="diario">Diário</option>
                  <option value="semanal">Semanal</option>
                  <option value="mensal">Mensal</option>
                  <option value="trimestral">Trimestral</option>
                </select>
              </div>
            </div>
            <div className="gm-rel-field">
              <label className="gm-rel-flabel">E-mail de envio</label>
              <input
                className="gm-rel-finput"
                type="email"
                value={agendarEmail}
                onChange={(e) => setAgendarEmail(e.target.value)}
                placeholder="email@gestmiles.com.br"
              />
            </div>
          </div>
          <DialogFooter className="gm-rel-dialog-footer">
            <button type="button" className="btn-outline" onClick={() => setScheduleOpen(false)}>
              Cancelar
            </button>
            <button type="button" className="btn-primary" onClick={onSaveSchedule}>
              Salvar agendamento
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
