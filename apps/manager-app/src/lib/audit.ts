/**
 * Registo de ações no app (gestor/CS). Se existir tabela no Supabase, pode ser ligada aqui;
 * por omissão não falha a UI se a tabela ainda não existir.
 */
export type LogAcaoInput = {
  tipoAcao: string;
  entidadeAfetada: string;
  entidadeId: string;
  details?: Record<string, unknown>;
};

export async function logAcao(_input: LogAcaoInput): Promise<void> {
  void _input;
}
