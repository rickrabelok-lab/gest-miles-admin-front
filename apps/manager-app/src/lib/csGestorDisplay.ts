/**
 * Texto exibido no painel CS (selects, listas). Não expõe e-mail quando o cadastro
 * só tem e-mail em `nome_completo` — deriva um rótulo legível da parte local.
 */
export function nomeGestorParaExibicao(nomeOuEmail: string | null | undefined): string {
  const t = (nomeOuEmail ?? "").trim();
  if (!t) return "Gestor";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) {
    const local = t.split("@")[0] ?? "";
    return local
      .replace(/[._-]+/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }
  return t;
}
