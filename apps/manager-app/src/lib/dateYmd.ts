/** Parse `YYYY-MM-DD` em data local (meia-noite), sem UTC shift. */
export function parseYmdToLocalDate(ymd: string): Date | undefined {
  if (!ymd) return undefined;
  const parts = ymd.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return undefined;
  const [y, m, d] = parts;
  return new Date(y, m - 1, d);
}

export function formatLocalDateToYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatYmdAsPtBr(ymd: string): string {
  const date = parseYmdToLocalDate(ymd);
  if (!date) return "";
  return date.toLocaleDateString("pt-BR");
}
