/** Erros PostgREST/Postgres quando a tabela ou view não existe / não está exposta — evita 404 ruidosos no console. */
export function isMissingRelationError(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;
  const e = err as {
    message?: string;
    code?: string;
    status?: number;
    statusCode?: number;
    details?: string;
  };
  const m = (e.message ?? "").toLowerCase();
  const d = (e.details ?? "").toLowerCase();
  const blob = `${m} ${d}`;

  if (e.status === 404 || e.statusCode === 404) return true;
  if (e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST204") return true;

  return (
    blob.includes("does not exist") ||
    blob.includes("schema cache") ||
    blob.includes("could not find the table") ||
    blob.includes("could not find the relation") ||
    (blob.includes("relation") && blob.includes("does not exist"))
  );
}

/** RLS / GRANT: consulta bloqueada (tabela existe mas política não permite). */
export function isRlsOrPermissionDenied(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;
  const e = err as { message?: string; code?: string };
  const m = (e.message ?? "").toLowerCase();
  if (e.code === "42501" || e.code === "PGRST301") return true;
  return m.includes("permission denied") || m.includes("row-level security");
}
