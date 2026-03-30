/** Opções de preferência de destino (Smart Award Finder). */
export const DESTINO_OPCOES = [
  "Todos",
  "Brasil",
  "Sudeste",
  "Nordeste",
  "Centro-Oeste",
  "Sul",
  "América do Sul",
  "Estados Unidos",
  "América do Norte",
  "Europa",
  "Oriente Médio",
  "Ásia",
  "África",
  "Oceania",
] as const;

export type DestinoPreferencia = (typeof DESTINO_OPCOES)[number];

/** Opções de classe de cabine. */
export const CLASSE_OPCOES = [
  "Todas",
  "Executiva",
  "Econômica",
  "Primeira Classe",
] as const;

export type ClassePreferencia = (typeof CLASSE_OPCOES)[number];

/** Valores de classe em rotas (para match com regiao_destino / classe). */
export const CLASSE_ROTA_VALUES: Record<string, string[]> = {
  Todas: [],
  Executiva: ["Executiva", "Business", "Business Class", "J", "C"],
  Econômica: ["Econômica", "Economica", "Economy", "Y"],
  "Primeira Classe": ["Primeira Classe", "First", "First Class", "F"],
};
