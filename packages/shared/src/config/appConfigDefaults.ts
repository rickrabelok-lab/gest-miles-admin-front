/**
 * Valores usados quando a tabela `configuracoes` ainda não tem linha ou o fetch falha.
 * Chaves alinhadas com `sql/configuracoes.sql`.
 */
export const APP_CONFIG_KEYS = {
  SISTEMA_NOME: "sistema.app_nome",
  SISTEMA_LOGO_URL: "sistema.logo_url",
  SISTEMA_COR_PRIMARIA: "sistema.cor_primaria",
  SISTEMA_COR_SECUNDARIA: "sistema.cor_secundaria",
  SISTEMA_COR_ACCENT: "sistema.cor_accent",
  NEGOCIO_SCORE: "negocio.score",
  NEGOCIO_ECONOMIA: "negocio.economia",
  NEGOCIO_LIMITES: "negocio.limites",
  FINANCEIRO_CATEGORIAS: "financeiro.categorias",
  FINANCEIRO_TAXAS: "financeiro.taxas",
  VIAGENS_STATUS: "viagens.status_padrao",
  VIAGENS_ALERTAS: "viagens.alertas",
  NOTIFICACOES_TEMPLATES: "notificacoes.templates",
} as const;

export const DEFAULT_APP_CONFIG: Record<string, unknown> = {
  [APP_CONFIG_KEYS.SISTEMA_NOME]: "Gest Miles",
  [APP_CONFIG_KEYS.SISTEMA_LOGO_URL]: "",
  [APP_CONFIG_KEYS.SISTEMA_COR_PRIMARIA]: "#8b5cf6",
  [APP_CONFIG_KEYS.SISTEMA_COR_SECUNDARIA]: "#06b6d4",
  [APP_CONFIG_KEYS.SISTEMA_COR_ACCENT]: "#22c55e",
  [APP_CONFIG_KEYS.NEGOCIO_SCORE]: {
    formula: "weighted",
    pesos: { engajamento: 0.4, volume: 0.3, recencia: 0.3 },
    notas: "Ajuste pesos; consumo via useAppConfig().",
  },
  [APP_CONFIG_KEYS.NEGOCIO_ECONOMIA]: { moeda_padrao: "BRL", arredondamento: 2 },
  [APP_CONFIG_KEYS.NEGOCIO_LIMITES]: { max_clientes_por_gestor: 200, max_upload_mb: 10 },
  [APP_CONFIG_KEYS.FINANCEIRO_CATEGORIAS]: {
    receita: ["assinatura_equipe", "assinatura_cliente", "agencia_viagens"],
    despesa: ["marketing", "ferramentas", "equipe", "infraestrutura"],
  },
  [APP_CONFIG_KEYS.FINANCEIRO_TAXAS]: { iva_padrao: 0, taxa_servico_pct: 0 },
  [APP_CONFIG_KEYS.VIAGENS_STATUS]: ["planejada", "em_andamento", "chegada_confirmada", "finalizada"],
  [APP_CONFIG_KEYS.VIAGENS_ALERTAS]: { pre_viagem_horas: 24, pos_viagem_horas: 48 },
  [APP_CONFIG_KEYS.NOTIFICACOES_TEMPLATES]: {
    boas_vindas: "Olá {{nome}}, bem-vindo ao {{app_nome}}.",
    lembrete_viagem: "A sua viagem para {{destino}} aproxima-se.",
  },
};
