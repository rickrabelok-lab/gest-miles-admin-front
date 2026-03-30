/**
 * Isolamento por grupo no admin: o contexto expõe `selectedEquipeId` (raiz) e `equipeIdsFiltro` (raiz + filhas).
 * Todas as listagens filtradas devem usar `equipeIdsFiltro` em `.in("equipe_id", …)` via `listPerfis({ equipeIds })` e afins.
 */
export type AdminTeamScope = {
  selectedEquipeId: string | null;
  equipeIdsFiltro: string[];
};

export function equipeIdsParaQuery(scope: AdminTeamScope): string[] {
  return scope.equipeIdsFiltro;
}

export function escopoSelecionado(scope: AdminTeamScope): scope is AdminTeamScope & { selectedEquipeId: string } {
  return Boolean(scope.selectedEquipeId) && scope.equipeIdsFiltro.length > 0;
}
