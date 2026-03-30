import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { useGestor } from "@/hooks/useGestor";
import { registrarEmissao } from "@/lib/registrar-emissao";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { parseYmdToLocalDate } from "@/lib/dateYmd";

const PROGRAMAS = [
  { id: "latam_pass", name: "LATAM Pass" },
  { id: "smiles", name: "Smiles" },
  { id: "tudoazul", name: "TudoAzul" },
  { id: "livelo", name: "Livelo" },
  { id: "esfera", name: "Esfera" },
];

const RegistrarEmissaoPage = () => {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { resumoClientes } = useGestor();

  const showClienteField = role === "gestor" || role === "admin" || role === "cs";

  const [clienteId, setClienteId] = useState<string>("");
  const [programa, setPrograma] = useState<string>("");
  const [origem, setOrigem] = useState("");
  const [destino, setDestino] = useState("");
  const [classe, setClasse] = useState("");
  const [dataIda, setDataIda] = useState("");
  const [dataVolta, setDataVolta] = useState("");
  const [milhasUtilizadas, setMilhasUtilizadas] = useState("");
  const [taxaEmbarque, setTaxaEmbarque] = useState("");
  const [dataEmissao, setDataEmissao] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!showClienteField && user?.id) {
      setClienteId(user.id);
    }
  }, [showClienteField, user?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) {
      toast.error("Faça login para registrar emissões.");
      return;
    }
    if (!clienteId) {
      toast.error("Selecione o cliente.");
      return;
    }
    const programaNome = PROGRAMAS.find((p) => p.id === programa)?.name ?? programa;
    if (!programaNome) {
      toast.error("Selecione o programa de milhas.");
      return;
    }
    const milhas = Number(milhasUtilizadas.replace(/\D/g, "")) || 0;
    if (milhas <= 0) {
      toast.error("Informe a quantidade de milhas utilizadas.");
      return;
    }
    if (!dataEmissao) {
      toast.error("Informe a data da emissão.");
      return;
    }

    setSaving(true);
    try {
      await registrarEmissao({
        cliente_id: clienteId,
        programa: programaNome,
        origem: origem.trim(),
        destino: destino.trim(),
        classe: classe.trim(),
        data_ida: dataIda || null,
        data_volta: dataVolta || null,
        milhas_utilizadas: milhas,
        taxa_embarque: Number(taxaEmbarque.replace(/\D/g, "").replace(",", ".")) || 0,
        data_emissao: dataEmissao,
        usuario_responsavel: user.id,
        observacoes: observacoes.trim() || null,
      });
      toast.success("Emissão registrada com sucesso. As milhas foram debitadas da conta do cliente.");
      setClienteId("");
      setPrograma("");
      setOrigem("");
      setDestino("");
      setClasse("");
      setDataIda("");
      setDataVolta("");
      setMilhasUtilizadas("");
      setTaxaEmbarque("");
      setDataEmissao(new Date().toISOString().slice(0, 10));
      setObservacoes("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar emissão.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-md bg-nubank-bg pb-24">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
          >
            <ArrowLeft size={20} strokeWidth={1.5} />
          </button>
          <h1 className="text-base font-semibold tracking-tight">Registrar Emissão</h1>
          <div className="w-9" />
        </div>
      </header>

      <main className="px-4 py-6">
        <Card className="rounded-xl border-border/80 shadow-nubank transition-all duration-300 ease-out hover:shadow-nubank-hover hover:-translate-y-0.5">
          <CardContent className="space-y-4 p-4">
            <p className="text-xs text-muted-foreground">
              Preencha os dados da emissão. As milhas serão debitadas automaticamente da conta do cliente no programa escolhido.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {showClienteField && (
                <div className="space-y-2">
                  <Label htmlFor="cliente">Cliente</Label>
                  <Select value={clienteId} onValueChange={setClienteId} required>
                    <SelectTrigger id="cliente">
                      <SelectValue placeholder="Selecione o cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {resumoClientes.length === 0 ? (
                        <SelectItem value="__sem_clientes__" disabled className="text-muted-foreground">
                          Nenhum cliente vinculado à sua carteira.
                        </SelectItem>
                      ) : (
                        resumoClientes.map((c) => (
                          <SelectItem key={c.clienteId} value={c.clienteId}>
                            {c.nome}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="programa">Programa de milhas</Label>
                <Select value={programa} onValueChange={setPrograma} required>
                  <SelectTrigger id="programa">
                    <SelectValue placeholder="Selecione o programa" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROGRAMAS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="origem">Origem</Label>
                  <Input
                    id="origem"
                    placeholder="Ex: GRU"
                    value={origem}
                    onChange={(e) => setOrigem(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="destino">Destino</Label>
                  <Input
                    id="destino"
                    placeholder="Ex: MIA"
                    value={destino}
                    onChange={(e) => setDestino(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="classe">Classe</Label>
                <Input
                  id="classe"
                  placeholder="Ex: Econômica, Executiva"
                  value={classe}
                  onChange={(e) => setClasse(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="data-ida">Data de ida</Label>
                  <DatePickerField
                    id="data-ida"
                    value={dataIda}
                    onChange={(ymd) => {
                      setDataIda(ymd);
                      if (dataVolta && dataVolta < ymd) setDataVolta("");
                    }}
                    placeholder="Escolher data"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="data-volta">Data de volta (opcional)</Label>
                  <DatePickerField
                    id="data-volta"
                    value={dataVolta}
                    onChange={setDataVolta}
                    placeholder="Escolher data"
                    disabled={
                      dataIda ? { before: parseYmdToLocalDate(dataIda)! } : undefined
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="milhas">Quantidade de milhas usadas</Label>
                  <Input
                    id="milhas"
                    type="number"
                    min={1}
                    placeholder="0"
                    value={milhasUtilizadas}
                    onChange={(e) => setMilhasUtilizadas(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="taxa">Taxa de embarque (R$)</Label>
                  <Input
                    id="taxa"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="0,00"
                    value={taxaEmbarque}
                    onChange={(e) => setTaxaEmbarque(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="data">Data da emissão</Label>
                <DatePickerField
                  id="data"
                  value={dataEmissao}
                  onChange={setDataEmissao}
                  placeholder="Escolher data"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="obs">Observações (opcional)</Label>
                <Textarea
                  id="obs"
                  rows={3}
                  placeholder="Regras tarifárias, stopover, upgrades, etc."
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                />
              </div>

              <Button type="submit" className="mt-1 w-full" disabled={saving}>
                {saving ? "Salvando…" : "Salvar emissão"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default RegistrarEmissaoPage;
