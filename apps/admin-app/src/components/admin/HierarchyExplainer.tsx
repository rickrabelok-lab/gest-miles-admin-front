import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  equipeNome?: string | null;
};

/**
 * Representação visual fixa da hierarquia Gestão → Gestores/CS → Clientes em gestão.
 */
export function HierarchyExplainer({ equipeNome }: Props) {
  return (
    <Card className="border-nubank-border bg-gradient-primary-subtle/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-nubank-text">Hierarquia de acesso</CardTitle>
        <CardDescription>
          {equipeNome ? (
            <>
              Gestão atual: <span className="font-medium text-foreground">{equipeNome}</span>
            </>
          ) : (
            "Selecione uma Gestão (equipe) no cabeçalho para isolar dados."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3 text-sm text-nubank-text-secondary">
          <li className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
              1
            </span>
            <div>
              <p className="font-semibold text-nubank-text">Gestão (equipe)</p>
              <p className="text-xs">Grupo isolado — todos os dados filtrados por <code className="text-foreground">equipe_id</code>.</p>
            </div>
          </li>
          <li className="ml-3.5 border-l-2 border-dashed border-nubank-border pl-6">
            <div className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                2
              </span>
              <div>
                <p className="font-semibold text-nubank-text">Gestores + CS (+ admin de equipe)</p>
                <p className="text-xs">Um utilizador deste nível pertence a <strong>uma</strong> equipe.</p>
              </div>
            </div>
          </li>
          <li className="ml-3.5 border-l-2 border-dashed border-nubank-border pl-6">
            <div className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                3
              </span>
              <div>
                <p className="font-semibold text-nubank-text">Clientes em gestão</p>
                <p className="text-xs">
                  <code className="text-foreground">cliente_gestao</code> na mesma equipe; vários gestores via{" "}
                  <code className="text-foreground">cliente_gestores</code>.
                </p>
              </div>
            </div>
          </li>
        </ol>
      </CardContent>
    </Card>
  );
}
