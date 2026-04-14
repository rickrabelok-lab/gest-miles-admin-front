import type { LogAcaoRow, PerfilInsightRow } from "@/lib/adminApi";

export type EquipeNome = { id: string; nome: string };

export type DayUsageRow = {
  day: string;
  logins: number;
  acoes: number;
  usuariosAtivos: number;
};

export type FeatureUsageRow = {
  key: string;
  entidade: string;
  tipo: string;
  count: number;
};

export type EquipeGrowthRow = {
  equipeId: string;
  nome: string;
  novos30d: number;
  novosPrev30d: number;
};

export type ClienteAtivoRow = {
  usuarioId: string;
  nome: string;
  acoes: number;
};

export type FunnelStageRow = {
  id: string;
  label: string;
  count: number;
};

export type GestorRankRow = {
  usuarioId: string;
  nome: string;
  acoes: number;
  score: number;
};

export type InsightAlertRow = {
  tone: "warn" | "info" | "err";
  title: string;
  subtitle: string;
};

export type StrategicInsightsResult = {
  generatedAt: string;
  logSampleSize: number;
  perfisSampleSize: number;
  windowDays: number;
  usage: {
    byDay: DayUsageRow[];
    byFeature: FeatureUsageRow[];
  };
  metrics: {
    dau: number;
    mau: number;
    wau: number;
    perfisTotal: number;
    mauShareOfPerfisPct: number | null;
    retention7dPct: number | null;
    retention30dPct: number | null;
    novosClientes30d: number;
    leadsHeuristic30d: number;
    taxaConversaoLeadsNovosClientesPct: number | null;
    churnRiskClientes14d: number;
  };
  funnelStages: FunnelStageRow[];
  gestoresRanking: GestorRankRow[];
  alerts: InsightAlertRow[];
  equipesTopGrowth: EquipeGrowthRow[];
  clientesTopActivity: ClienteAtivoRow[];
  insightLines: string[];
  previousMonth: {
    key: string;
    labelPt: string;
    totalAcoes: number;
    usuariosUnicos: number;
    logins: number;
  };
};

function dayKeyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseTs(s: string | null): Date | null {
  if (!s) return null;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return new Date(t);
}

export function isLoginLog(log: LogAcaoRow): boolean {
  const t = (log.tipo_acao ?? "").toLowerCase();
  if (t.includes("login") || t.includes("sign_in") || t.includes("signin") || t.includes("sessão") || t.includes("sessao")) {
    return true;
  }
  const d = log.details;
  if (d && typeof d === "object") {
    const ev = (d as { event?: unknown }).event;
    if (ev != null && String(ev).toLowerCase().includes("login")) return true;
  }
  return false;
}

function featureKey(log: LogAcaoRow): string {
  const e = (log.entidade_afetada ?? "—").trim() || "—";
  const tipo = (log.tipo_acao ?? "—").trim() || "—";
  return `${e} · ${tipo}`;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

const MESES_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function previousCalendarMonth(now: Date): { start: Date; end: Date; key: string; labelPt: string } {
  const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const m = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0, 23, 59, 59, 999);
  const key = `${y}-${String(m + 1).padStart(2, "0")}`;
  const labelPt = `${MESES_PT[m]} ${y}`;
  return { start, end, key, labelPt };
}

function lastNDaysKeys(n: number, now: Date): string[] {
  const start = startOfLocalDay(addDays(now, -(n - 1)));
  const keys: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = addDays(start, i);
    keys.push(dayKeyLocal(d));
  }
  return keys;
}

function usersActiveInRange(logs: LogAcaoRow[], start: Date, end: Date): Set<string> {
  const set = new Set<string>();
  for (const log of logs) {
    const dt = parseTs(log.created_at);
    if (!dt || dt < start || dt > end) continue;
    const uid = log.user_id;
    if (uid) set.add(uid);
  }
  return set;
}

function textHaystack(log: LogAcaoRow): string {
  const parts = [
    log.tipo_acao,
    log.entidade_afetada,
    typeof log.details === "object" && log.details != null ? JSON.stringify(log.details) : "",
  ];
  return parts.join(" ").toLowerCase();
}

function isLeadLikeLog(log: LogAcaoRow, dt: Date, since: Date): boolean {
  if (dt < since) return false;
  const h = textHaystack(log);
  return (
    h.includes("lead") ||
    h.includes("captacao") ||
    h.includes("captação") ||
    h.includes("pipeline") ||
    h.includes("formulario") ||
    h.includes("formulário") ||
    h.includes("inscri")
  );
}

function isContactLikeLog(log: LogAcaoRow, dt: Date, since: Date): boolean {
  if (dt < since) return false;
  const h = textHaystack(log);
  return (
    h.includes("contato") ||
    h.includes("contacto") ||
    h.includes("follow") ||
    h.includes("email env") ||
    h.includes("mensagem") ||
    h.includes("whatsapp") ||
    h.includes("ligacao") ||
    h.includes("ligação")
  );
}

function isReuniaoLikeLog(log: LogAcaoRow, dt: Date, since: Date): boolean {
  if (dt < since) return false;
  const h = textHaystack(log);
  return h.includes("reuniao") || h.includes("reunião") || h.includes("meeting") || h.includes("call") || h.includes("video");
}

function isPropostaLikeLog(log: LogAcaoRow, dt: Date, since: Date): boolean {
  if (dt < since) return false;
  const h = textHaystack(log);
  return h.includes("proposta") || h.includes("orçamento") || h.includes("orcamento") || h.includes("quote") || h.includes("contrato");
}

export function computeStrategicInsights(params: {
  logs: LogAcaoRow[];
  perfis: PerfilInsightRow[];
  equipes: EquipeNome[];
  now?: Date;
  /** Janela do gráfico temporal (7–366). KPIs MAU/DAU mantêm definições fixas onde indicado. */
  windowDays?: number;
}): StrategicInsightsResult {
  const now = params.now ?? new Date();
  const logs = params.logs;
  const perfis = params.perfis;
  const equipeNome = new Map(params.equipes.map((e) => [e.id, e.nome]));
  const windowDays = Math.min(366, Math.max(7, Math.floor(params.windowDays ?? 30)));

  const dayKeys = lastNDaysKeys(windowDays, now);
  const byDayMap = new Map<string, { logins: number; acoes: number; users: Set<string> }>();
  for (const k of dayKeys) {
    byDayMap.set(k, { logins: 0, acoes: 0, users: new Set() });
  }

  const featureCount = new Map<string, { entidade: string; tipo: string; count: number }>();

  const todayStart = startOfLocalDay(now);
  const mauStart = addDays(todayStart, -29);
  const wauStart = addDays(todayStart, -6);
  const leadsWindowStart = addDays(todayStart, -29);
  const churnCutoff = addDays(now, -14);

  const dauUsers = new Set<string>();
  const mauUsers = new Set<string>();

  const prevMonth = previousCalendarMonth(now);
  let pmAcoes = 0;
  let pmLogins = 0;
  const pmUsers = new Set<string>();

  let leadsHeuristic30d = 0;
  let contactLogs30d = 0;
  let reuniaoLogs30d = 0;
  let propostaLogs30d = 0;

  for (const log of logs) {
    const dt = parseTs(log.created_at);
    if (!dt) continue;

    const dk = dayKeyLocal(dt);
    const bucket = byDayMap.get(dk);
    if (bucket) {
      bucket.acoes += 1;
      if (log.user_id) bucket.users.add(log.user_id);
      if (isLoginLog(log)) bucket.logins += 1;
    }

    const fk = featureKey(log);
    const cur = featureCount.get(fk) ?? {
      entidade: (log.entidade_afetada ?? "—").trim() || "—",
      tipo: (log.tipo_acao ?? "—").trim() || "—",
      count: 0,
    };
    cur.count += 1;
    featureCount.set(fk, cur);

    if (dt >= todayStart && log.user_id) dauUsers.add(log.user_id);
    if (dt >= mauStart && log.user_id) mauUsers.add(log.user_id);

    if (isLeadLikeLog(log, dt, leadsWindowStart)) leadsHeuristic30d += 1;
    if (isContactLikeLog(log, dt, leadsWindowStart)) contactLogs30d += 1;
    if (isReuniaoLikeLog(log, dt, leadsWindowStart)) reuniaoLogs30d += 1;
    if (isPropostaLikeLog(log, dt, leadsWindowStart)) propostaLogs30d += 1;

    if (dt >= prevMonth.start && dt <= prevMonth.end) {
      pmAcoes += 1;
      if (isLoginLog(log)) pmLogins += 1;
      if (log.user_id) pmUsers.add(log.user_id);
    }
  }

  const byDay: DayUsageRow[] = dayKeys.map((day) => {
    const b = byDayMap.get(day)!;
    return { day, logins: b.logins, acoes: b.acoes, usuariosAtivos: b.users.size };
  });

  const byFeature: FeatureUsageRow[] = [...featureCount.entries()]
    .map(([key, v]) => ({ key, entidade: v.entidade, tipo: v.tipo, count: v.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  const periodBStart = addDays(todayStart, -7);
  const periodAStart = addDays(todayStart, -14);
  const periodAEnd = addDays(todayStart, -8);
  periodAEnd.setHours(23, 59, 59, 999);

  const cohort = usersActiveInRange(logs, periodAStart, periodAEnd);
  const returned = usersActiveInRange(logs, periodBStart, now);
  let intersection = 0;
  for (const u of cohort) {
    if (returned.has(u)) intersection += 1;
  }
  const retention7dPct = cohort.size > 0 ? (intersection / cohort.size) * 100 : null;

  const cohort30Start = addDays(todayStart, -30);
  const cohort30End = addDays(todayStart, -8);
  cohort30End.setHours(23, 59, 59, 999);
  const cohort30 = usersActiveInRange(logs, cohort30Start, cohort30End);
  const returnedLast7 = usersActiveInRange(logs, wauStart, now);
  let inter30 = 0;
  for (const u of cohort30) {
    if (returnedLast7.has(u)) inter30 += 1;
  }
  const retention30dPct = cohort30.size > 0 ? (inter30 / cohort30.size) * 100 : null;

  const wauUsers = usersActiveInRange(logs, wauStart, now);

  const t30 = startOfLocalDay(addDays(now, -29));
  const t60 = startOfLocalDay(addDays(now, -59));
  const t30End = now;
  const equipeNovos = new Map<string, { a: number; b: number }>();
  for (const p of perfis) {
    if (!p.equipe_id) continue;
    const c = parseTs(p.created_at);
    if (!c) continue;
    if (c >= t30 && c <= t30End) {
      const x = equipeNovos.get(p.equipe_id) ?? { a: 0, b: 0 };
      x.a += 1;
      equipeNovos.set(p.equipe_id, x);
    } else if (c >= t60 && c < t30) {
      const x = equipeNovos.get(p.equipe_id) ?? { a: 0, b: 0 };
      x.b += 1;
      equipeNovos.set(p.equipe_id, x);
    }
  }

  const equipesTopGrowth: EquipeGrowthRow[] = [...equipeNovos.entries()]
    .map(([equipeId, v]) => ({
      equipeId,
      nome: equipeNome.get(equipeId) ?? equipeId,
      novos30d: v.a,
      novosPrev30d: v.b,
    }))
    .filter((x) => x.novos30d > 0 || x.novosPrev30d > 0)
    .sort((a, b) => b.novos30d - a.novos30d || b.novosPrev30d - a.novosPrev30d)
    .slice(0, 8);

  const roleByUser = new Map(perfis.map((p) => [p.usuario_id, p.role]));
  const nomeByUser = new Map(perfis.map((p) => [p.usuario_id, (p.nome_completo ?? "").trim() || p.usuario_id]));

  const clienteActions = new Map<string, number>();
  for (const log of logs) {
    const uid = log.user_id;
    if (!uid) continue;
    const role = roleByUser.get(uid);
    if (role !== "cliente" && role !== "cliente_gestao") continue;
    clienteActions.set(uid, (clienteActions.get(uid) ?? 0) + 1);
  }

  const clientesTopActivity: ClienteAtivoRow[] = [...clienteActions.entries()]
    .map(([usuarioId, acoes]) => ({
      usuarioId,
      nome: nomeByUser.get(usuarioId) ?? usuarioId,
      acoes,
    }))
    .sort((a, b) => b.acoes - a.acoes)
    .slice(0, 10);

  const lastActionByUser = new Map<string, Date>();
  for (const log of logs) {
    const uid = log.user_id;
    if (!uid) continue;
    const dt = parseTs(log.created_at);
    if (!dt) continue;
    const prev = lastActionByUser.get(uid);
    if (!prev || dt > prev) lastActionByUser.set(uid, dt);
  }

  let novosClientes30d = 0;
  let churnRiskClientes14d = 0;
  for (const p of perfis) {
    if (p.role !== "cliente" && p.role !== "cliente_gestao") continue;
    const c = parseTs(p.created_at);
    if (c && c >= leadsWindowStart && c <= now) novosClientes30d += 1;
    const pc = parseTs(p.created_at);
    if (pc && pc > churnCutoff) continue;
    const la = lastActionByUser.get(p.usuario_id);
    if (!la || la < churnCutoff) churnRiskClientes14d += 1;
  }

  const taxaConversaoLeadsNovosClientesPct =
    leadsHeuristic30d > 0 ? (novosClientes30d / leadsHeuristic30d) * 100 : null;

  const gestorIds = new Set(perfis.filter((p) => p.role === "gestor").map((p) => p.usuario_id));
  const gestorCounts = new Map<string, number>();
  for (const log of logs) {
    const uid = log.user_id;
    if (!uid || !gestorIds.has(uid)) continue;
    const dt = parseTs(log.created_at);
    if (!dt || dt < leadsWindowStart) continue;
    gestorCounts.set(uid, (gestorCounts.get(uid) ?? 0) + 1);
  }
  let maxGestor = 0;
  for (const v of gestorCounts.values()) if (v > maxGestor) maxGestor = v;
  const gestoresRanking: GestorRankRow[] = [...gestorIds]
    .map((usuarioId) => {
      const acoes = gestorCounts.get(usuarioId) ?? 0;
      return {
        usuarioId,
        nome: nomeByUser.get(usuarioId) ?? usuarioId,
        acoes,
        score: maxGestor > 0 ? Math.round((acoes / maxGestor) * 100) : acoes > 0 ? 50 : 0,
      };
    })
    .filter((g) => g.acoes > 0)
    .sort((a, b) => b.acoes - a.acoes)
    .slice(0, 8);

  const funnelStages: FunnelStageRow[] = [
    { id: "leads", label: "Leads / captação (30d)", count: leadsHeuristic30d },
    { id: "contato", label: "Sinais de contacto (30d)", count: contactLogs30d },
    { id: "reuniao", label: "Reuniões / calls (30d)", count: reuniaoLogs30d },
    { id: "proposta", label: "Propostas / contratos (30d)", count: propostaLogs30d },
    { id: "novos_cli", label: "Novos perfis cliente (30d)", count: novosClientes30d },
  ];

  const perfisTotal = perfis.length;
  const mauShareOfPerfisPct = perfisTotal > 0 ? (mauUsers.size / perfisTotal) * 100 : null;

  const alerts: InsightAlertRow[] = [];
  if (churnRiskClientes14d > 0) {
    alerts.push({
      tone: "warn",
      title: "Risco de churn (proxy)",
      subtitle: `${churnRiskClientes14d} perfil(is) cliente sem eventos em logs há mais de 14 dias.`,
    });
  }
  if (retention7dPct != null && retention7dPct < 25 && cohort.size > 2) {
    alerts.push({
      tone: "info",
      title: "Retenção 7d baixa",
      subtitle: `Apenas ${retention7dPct.toFixed(0)}% da coorte 8–15d voltou nos últimos 7d — valide qualidade dos eventos em logs_acoes.`,
    });
  }
  if (leadsHeuristic30d === 0 && contactLogs30d === 0) {
    alerts.push({
      tone: "info",
      title: "Funil por auditoria vazio",
      subtitle: "Não foram encontrados tipos/entidades típicos de lead ou contacto — ajuste tipo_acao ou integre CRM.",
    });
  }
  if (logs.length >= 7800) {
    alerts.push({
      tone: "info",
      title: "Limite da amostra",
      subtitle: "A análise usa as linhas mais recentes carregadas; períodos longos podem ficar truncados.",
    });
  }

  const insightLines: string[] = [];
  insightLines.push(
    `Amostra de ${logs.length} eventos em logs_acoes (últimos registos carregados). DAU = utilizadores distintos com pelo menos uma ação hoje; MAU = nos últimos 30 dias.`,
  );
  if (byFeature[0]) {
    insightLines.push(`Funcionalidade mais registada: “${byFeature[0].key}” (${byFeature[0].count} eventos).`);
  }
  if (equipesTopGrowth[0]) {
    const g = equipesTopGrowth[0];
    insightLines.push(
      `Equipe com mais perfis novos (30d): ${g.nome} (${g.novos30d} novos; período anterior: ${g.novosPrev30d}).`,
    );
  } else {
    insightLines.push(
      "Crescimento por equipe: requer coluna created_at em perfis e equipe_id preenchido — caso contrário não há dados para comparar janelas de 30 dias.",
    );
  }
  if (clientesTopActivity[0]) {
    const c = clientesTopActivity[0];
    insightLines.push(`Cliente mais ativo (por logs): ${c.nome} (${c.acoes} ações registadas).`);
  } else {
    insightLines.push("Clientes mais ativos: sem eventos de perfis cliente/cliente_gestao na amostra atual.");
  }
  if (retention7dPct != null) {
    insightLines.push(
      `Retenção 7d (proxy): ${retention7dPct.toFixed(1)}% dos utilizadores ativos há 8–15 dias voltaram a registar ação nos últimos 7 dias.`,
    );
  } else {
    insightLines.push("Retenção 7d: dados insuficientes (cohorte anterior vazia).");
  }
  if (retention30dPct != null) {
    insightLines.push(
      `Retenção 30d (proxy): ${retention30dPct.toFixed(1)}% dos utilizadores ativos há 8–30 dias voltaram nos últimos 7 dias.`,
    );
  }
  insightLines.push(
    `Mês anterior (${prevMonth.labelPt}): ${pmAcoes} ações, ${pmUsers.size} utilizadores únicos, ${pmLogins} eventos classificados como login.`,
  );

  return {
    generatedAt: now.toISOString(),
    logSampleSize: logs.length,
    perfisSampleSize: perfis.length,
    windowDays,
    usage: { byDay, byFeature },
    metrics: {
      dau: dauUsers.size,
      mau: mauUsers.size,
      wau: wauUsers.size,
      perfisTotal,
      mauShareOfPerfisPct,
      retention7dPct,
      retention30dPct,
      novosClientes30d,
      leadsHeuristic30d,
      taxaConversaoLeadsNovosClientesPct,
      churnRiskClientes14d,
    },
    funnelStages,
    gestoresRanking,
    alerts,
    equipesTopGrowth,
    clientesTopActivity,
    insightLines,
    previousMonth: {
      key: prevMonth.key,
      labelPt: prevMonth.labelPt,
      totalAcoes: pmAcoes,
      usuariosUnicos: pmUsers.size,
      logins: pmLogins,
    },
  };
}

function csvEscape(s: string): string {
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildUsageTimeseriesCsv(rows: DayUsageRow[]): string {
  const header = "dia,logins,acoes,utilizadores_ativos_distintos\n";
  const body = rows.map((r) => `${r.day},${r.logins},${r.acoes},${r.usuariosAtivos}`).join("\n");
  return header + body;
}

export function buildFeatureUsageCsv(rows: FeatureUsageRow[]): string {
  const header = "entidade,tipo_acao,chave_composta,total\n";
  const body = rows.map((r) => `${csvEscape(r.entidade)},${csvEscape(r.tipo)},${csvEscape(r.key)},${r.count}`).join("\n");
  return header + body;
}

export function buildInsightsSummaryCsv(result: StrategicInsightsResult): string {
  const lines = [
    "metrica,valor",
    `gerado_em,${csvEscape(result.generatedAt)}`,
    `amostra_logs,${result.logSampleSize}`,
    `amostra_perfis,${result.perfisSampleSize}`,
    `janela_grafico_dias,${result.windowDays}`,
    `dau,${result.metrics.dau}`,
    `mau_30d,${result.metrics.mau}`,
    `wau_7d,${result.metrics.wau}`,
    `retencao_7d_pct,${result.metrics.retention7dPct ?? ""}`,
    `retencao_30d_pct,${result.metrics.retention30dPct ?? ""}`,
    `leads_heuristica_30d,${result.metrics.leadsHeuristic30d}`,
    `novos_clientes_30d,${result.metrics.novosClientes30d}`,
    `churn_risco_clientes_14d,${result.metrics.churnRiskClientes14d}`,
    `mes_anterior,${csvEscape(result.previousMonth.labelPt)}`,
    `mes_anterior_acoes,${result.previousMonth.totalAcoes}`,
    `mes_anterior_utilizadores_unicos,${result.previousMonth.usuariosUnicos}`,
    `mes_anterior_logins,${result.previousMonth.logins}`,
  ];
  return lines.join("\n");
}

export function buildMonthlyReportCsv(result: StrategicInsightsResult): string {
  const pm = result.previousMonth;
  const eq = result.equipesTopGrowth
    .map((e) => `${csvEscape(e.nome)};${e.novos30d};${e.novosPrev30d}`)
    .join(" | ");
  const ft = result.usage.byFeature
    .slice(0, 5)
    .map((f) => `${csvEscape(f.key)}:${f.count}`)
    .join(" | ");
  const header = "secao,campo,valor\n";
  const rows = [
    `resumo,mes_referencia,${csvEscape(pm.labelPt)}`,
    `resumo,total_acoes_mes,${pm.totalAcoes}`,
    `resumo,utilizadores_unicos_mes,${pm.usuariosUnicos}`,
    `resumo,logins_mes,${pm.logins}`,
    `kpis,dau_hoje,${result.metrics.dau}`,
    `kpis,mau_30d,${result.metrics.mau}`,
    `kpis,wau_7d,${result.metrics.wau}`,
    `kpis,retencao_7d_pct,${result.metrics.retention7dPct ?? ""}`,
    `kpis,retencao_30d_pct,${result.metrics.retention30dPct ?? ""}`,
    `equipes_top,novos_30d,${eq || "—"}`,
    `funcionalidades_top,top5,${ft || "—"}`,
    ...result.insightLines.map((line, i) => `insight,${i + 1},${csvEscape(line)}`),
  ];
  return header + rows.join("\n");
}

export function buildFullExportBundleCsv(result: StrategicInsightsResult): string {
  const a = buildInsightsSummaryCsv(result);
  const b = buildUsageTimeseriesCsv(result.usage.byDay);
  const c = buildFeatureUsageCsv(result.usage.byFeature);
  return (
    "=== RESUMO ===\n" +
    a +
    `\n\n=== USO_POR_DIA_${result.windowDays}D ===\n` +
    b +
    "\n\n=== USO_POR_FUNCIONALIDADE ===\n" +
    c +
    "\n"
  );
}

export function downloadTextFile(filename: string, content: string, mime = "text/csv;charset=utf-8"): void {
  const blob = new Blob(["\ufeff", content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const INSIGHTS_LAST_EXPORT_MONTH_KEY = "admin-insights-last-export-month-key";
export const INSIGHTS_AUTO_SUGGEST_KEY = "admin-insights-auto-monthly-suggest";
