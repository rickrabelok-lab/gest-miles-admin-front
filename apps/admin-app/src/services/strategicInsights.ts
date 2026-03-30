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

export type StrategicInsightsResult = {
  generatedAt: string;
  logSampleSize: number;
  perfisSampleSize: number;
  usage: {
    byDay: DayUsageRow[];
    byFeature: FeatureUsageRow[];
  };
  metrics: {
    dau: number;
    mau: number;
    retention7dPct: number | null;
  };
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

export function computeStrategicInsights(params: {
  logs: LogAcaoRow[];
  perfis: PerfilInsightRow[];
  equipes: EquipeNome[];
  now?: Date;
}): StrategicInsightsResult {
  const now = params.now ?? new Date();
  const logs = params.logs;
  const perfis = params.perfis;
  const equipeNome = new Map(params.equipes.map((e) => [e.id, e.nome]));

  const dayKeys = lastNDaysKeys(30, now);
  const byDayMap = new Map<string, { logins: number; acoes: number; users: Set<string> }>();
  for (const k of dayKeys) {
    byDayMap.set(k, { logins: 0, acoes: 0, users: new Set() });
  }

  const featureCount = new Map<string, { entidade: string; tipo: string; count: number }>();

  const todayStart = startOfLocalDay(now);
  const mauStart = addDays(todayStart, -29);

  const dauUsers = new Set<string>();
  const mauUsers = new Set<string>();

  const prevMonth = previousCalendarMonth(now);
  let pmAcoes = 0;
  let pmLogins = 0;
  const pmUsers = new Set<string>();

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
  insightLines.push(
    `Mês anterior (${prevMonth.labelPt}): ${pmAcoes} ações, ${pmUsers.size} utilizadores únicos, ${pmLogins} eventos classificados como login.`,
  );

  return {
    generatedAt: now.toISOString(),
    logSampleSize: logs.length,
    perfisSampleSize: perfis.length,
    usage: { byDay, byFeature },
    metrics: {
      dau: dauUsers.size,
      mau: mauUsers.size,
      retention7dPct,
    },
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
    `dau,${result.metrics.dau}`,
    `mau_30d,${result.metrics.mau}`,
    `retencao_7d_pct,${result.metrics.retention7dPct ?? ""}`,
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
    `kpis,retencao_7d_pct,${result.metrics.retention7dPct ?? ""}`,
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
    "\n\n=== USO_POR_DIA_30D ===\n" +
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
