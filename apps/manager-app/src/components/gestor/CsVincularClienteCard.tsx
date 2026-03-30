import { useMemo, useState } from "react";
import { UserPlus } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CsGestorItem, CsGrupoGestores } from "@/hooks/useCsGestores";
import { useCsVincularCliente, useCsVincularClienteNaEquipe } from "@/hooks/useCsVincularCliente";
import { logAcao } from "@/lib/audit";
import { nomeGestorParaExibicao } from "@/lib/csGestorDisplay";
import { toast } from "sonner";

type Props = {
  grupos: CsGrupoGestores[];
  gestoresSomenteDireto: CsGestorItem[];
};

/** Nomes dos gestores (sem e-mail) para o select da equipe. */
const resumoNomesGestores = (g: CsGrupoGestores) =>
  g.gestores.map((x) => nomeGestorParaExibicao(x.gestorNome)).join(", ") || "—";

const CsVincularClienteCard = ({ grupos, gestoresSomenteDireto }: Props) => {
  const [clienteUuid, setClienteUuid] = useState("");
  const [equipeId, setEquipeId] = useState<string>("");
  const [gestorIdDireto, setGestorIdDireto] = useState<string>("");

  const mutEquipe = useCsVincularClienteNaEquipe();
  const mutUmGestor = useCsVincularCliente();

  const diretoOptions = useMemo(
    () =>
      gestoresSomenteDireto.map((g) => ({
        id: g.gestorId,
        nomeExibicao: nomeGestorParaExibicao(g.gestorNome),
      })),
    [gestoresSomenteDireto],
  );

  const handleVincularEquipe = async () => {
    const cid = clienteUuid.trim();
    const eid = equipeId.trim();
    if (!cid || !eid) {
      toast.error("Informe o UUID do cliente e escolha a equipe.");
      return;
    }
    try {
      const r = await mutEquipe.mutateAsync({ clienteId: cid, equipeId: eid });
      const g = grupos.find((x) => x.equipeId === eid);
      toast.success(
        `Cliente vinculado a ${r.linked} gestor(es) da equipe${r.skipped ? ` (${r.skipped} já vinculado)` : ""}.`,
      );
      setClienteUuid("");
      await logAcao({
        tipoAcao: "cs_vinculou_cliente_equipe",
        entidadeAfetada: "cliente_gestores",
        entidadeId: cid,
        details: {
          equipe_id: eid,
          equipe_nome: g?.nome,
          linked: r.linked,
          skipped: r.skipped,
          origem: "painel_cs",
        },
      });
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      const msg = (err.message ?? String(e)).toLowerCase();
      if (err.code === "42501" || msg.includes("policy") || msg.includes("row-level security")) {
        toast.error("Sem permissão para vincular a um ou mais gestores desta equipe.");
      } else {
        toast.error(err.message || "Não foi possível vincular à equipe.");
      }
    }
  };

  const handleVincularUmGestor = async () => {
    const cid = clienteUuid.trim();
    const gid = gestorIdDireto.trim();
    if (!cid || !gid) {
      toast.error("Informe o UUID do cliente e escolha o gestor.");
      return;
    }
    try {
      await mutUmGestor.mutateAsync({ clienteId: cid, gestorId: gid });
      toast.success("Cliente vinculado ao gestor.");
      setClienteUuid("");
      await logAcao({
        tipoAcao: "cs_vinculou_cliente_gestor",
        entidadeAfetada: "cliente_gestores",
        entidadeId: cid,
        details: { gestor_id: gid, origem: "painel_cs_direto" },
      });
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      const msg = (err.message ?? String(e)).toLowerCase();
      if (err.code === "23505" || msg.includes("duplicate")) {
        toast.error("Esse cliente já está vinculado a esse gestor.");
      } else if (err.code === "23503" || msg.includes("foreign key")) {
        toast.error("UUID do cliente não existe no cadastro (Auth).");
      } else if (err.code === "42501" || msg.includes("policy")) {
        toast.error("Sem permissão. Verifique RLS / migration cs_cliente_gestores_write.");
      } else {
        toast.error(err.message || "Não foi possível vincular.");
      }
    }
  };

  const temGrupos = grupos.length > 0;
  const temDireto = diretoOptions.length > 0;
  if (!temGrupos && !temDireto) return null;

  const busy = mutEquipe.isPending || mutUmGestor.isPending;

  return (
    <section className="mb-4 space-y-4">
      {temGrupos && (
        <Card className="rounded-xl border-border/80 bg-white/95 shadow-nubank hover:!translate-y-0 dark:border-border dark:bg-card">
          <CardHeader className="pb-2 pt-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <UserPlus className="h-4 w-4 text-[#8A05BE]" />
              Vincular cliente a uma equipe (todos os gestores do grupo)
            </p>
            <p className="text-xs text-muted-foreground">
              O cliente passa a aparecer na carteira de <strong>todos</strong> os gestores ligados à equipe em{" "}
              <code className="rounded bg-muted px-1 text-[10px]">equipe_gestores</code>. O cliente precisa já
              existir no Auth (UUID).
            </p>
          </CardHeader>
          <CardContent className="space-y-3 pb-4 pt-0">
            <div className="space-y-1.5">
              <Label htmlFor="cs-cliente-uuid-eq" className="text-xs">
                UUID do cliente
              </Label>
              <Input
                id="cs-cliente-uuid-eq"
                placeholder="ex.: 8c69e773-a81e-4710-82a3-9a1b716471ba"
                value={clienteUuid}
                onChange={(e) => setClienteUuid(e.target.value)}
                className="font-mono text-xs"
                autoComplete="off"
              />
            </div>
            <div className="relative z-20 space-y-1.5">
              <Label className="text-xs">Equipe (grupo de gestores)</Label>
              <Select value={equipeId || undefined} onValueChange={setEquipeId}>
                <SelectTrigger className="relative z-20 w-full cursor-pointer text-left text-sm touch-manipulation">
                  <SelectValue placeholder="Selecione a equipe" />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={4}>
                  {grupos.map((g) => {
                    const nomes = resumoNomesGestores(g);
                    return (
                      <SelectItem
                        key={g.equipeId}
                        value={g.equipeId}
                        textValue={`${g.nome} ${nomes}`}
                      >
                        <span className="block text-left leading-snug">
                          <span className="font-medium text-foreground">{g.nome}</span>
                          <span className="text-muted-foreground"> · </span>
                          <span className="text-[13px] text-muted-foreground">{nomes}</span>
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              className="w-full gradient-primary text-primary-foreground"
              disabled={busy || !clienteUuid.trim() || !equipeId}
              onClick={() => void handleVincularEquipe()}
            >
              {mutEquipe.isPending ? "Salvando…" : "Vincular a todos os gestores da equipe"}
            </Button>
          </CardContent>
        </Card>
      )}

      {temDireto && (
        <Card className="rounded-xl border-dashed border-border/80 bg-muted/10 hover:!translate-y-0 dark:border-border dark:bg-card/50">
          <CardHeader className="pb-2 pt-4">
            <p className="text-sm font-semibold text-foreground">Ou: um gestor só (vínculo direto)</p>
            <p className="text-xs text-muted-foreground">
              Para gestores que estão só em <code className="rounded bg-muted px-1">cs_gestores</code>, fora de
              equipe nomeada.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 pb-4 pt-0">
            {!temGrupos && (
              <div className="space-y-1.5">
                <Label htmlFor="cs-cliente-uuid-1" className="text-xs">
                  UUID do cliente
                </Label>
                <Input
                  id="cs-cliente-uuid-1"
                  placeholder="UUID do cliente"
                  value={clienteUuid}
                  onChange={(e) => setClienteUuid(e.target.value)}
                  className="font-mono text-xs"
                  autoComplete="off"
                />
              </div>
            )}
            <div className="relative z-20 space-y-1.5">
              <Label className="text-xs">Gestor</Label>
              <Select value={gestorIdDireto || undefined} onValueChange={setGestorIdDireto}>
                <SelectTrigger className="relative z-20 w-full cursor-pointer text-left text-sm touch-manipulation">
                  <SelectValue placeholder="Selecione o gestor" />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={4}>
                  {diretoOptions.map((g) => (
                    <SelectItem key={g.id} value={g.id} textValue={g.nomeExibicao}>
                      {g.nomeExibicao}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full border-[#8A05BE]/40"
              disabled={busy || !clienteUuid.trim() || !gestorIdDireto}
              onClick={() => void handleVincularUmGestor()}
            >
              {mutUmGestor.isPending ? "Salvando…" : "Vincular só a este gestor"}
            </Button>
          </CardContent>
        </Card>
      )}
    </section>
  );
};

export default CsVincularClienteCard;
