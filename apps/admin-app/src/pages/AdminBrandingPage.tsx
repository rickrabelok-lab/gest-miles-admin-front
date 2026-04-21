import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { isAdminMasterRole } from "@/lib/accessScope";
import { supabase } from "@/lib/supabase";
import {
  fetchPesquisaPassagensConfig,
  updatePesquisaPassagensBrandingAssets,
  type PesquisaPassagensConfigAdmin,
} from "@/services/adminPesquisaPassagens";

type AirlineLogoKey = "smiles" | "tudoazul" | "latam" | "tap" | "aa";

const AIRLINE_KEYS: Array<{ key: AirlineLogoKey; label: string }> = [
  { key: "smiles", label: "Smiles — logo no cartão do programa ao pesquisar passagens" },
  { key: "tudoazul", label: "TudoAzul — logo no cartão do programa ao pesquisar passagens" },
  { key: "latam", label: "LATAM — logo no cartão do programa ao pesquisar passagens" },
  { key: "tap", label: "TAP — logo no cartão do programa ao pesquisar passagens" },
  { key: "aa", label: "American Airlines — logo no cartão do programa ao pesquisar passagens" },
];

const BRAND_ASSET_KEYS: Array<{ key: string; label: string }> = [
  {
    key: "rail_logo",
    label: "Logo GestMiles — ícone no canto superior esquerdo da barra lateral",
  },
  {
    key: "rail_wordmark",
    label: "Nome «Gest Miles» em texto — ao lado do logo, na faixa superior da barra lateral",
  },
];

/** Chaves alinhadas aos mocks do Gestor Miles (`destination_images`). */
const DESTINATION_SLUGS: Array<{ slug: string; label: string }> = [
  { slug: "nordeste", label: "Nordeste — capa do cartão (pesquisa por destino)" },
  { slug: "norte", label: "Norte — capa do cartão (pesquisa por destino)" },
  { slug: "centro-oeste", label: "Centro-Oeste — capa do cartão (pesquisa por destino)" },
  { slug: "sudeste", label: "Sudeste — capa do cartão (pesquisa por destino)" },
  { slug: "sul", label: "Sul — capa do cartão (pesquisa por destino)" },
  { slug: "brasil-geral", label: "Brasil (geral) — capa do cartão (pesquisa por destino)" },
  { slug: "estados-unidos", label: "Estados Unidos — capa do cartão (pesquisa por destino)" },
  { slug: "espanha", label: "Espanha — capa do cartão (pesquisa por destino)" },
  { slug: "portugal", label: "Portugal — capa do cartão (pesquisa por destino)" },
  { slug: "franca", label: "França — capa do cartão (pesquisa por destino)" },
  { slug: "italia", label: "Itália — capa do cartão (pesquisa por destino)" },
  { slug: "reino-unido", label: "Reino Unido — capa do cartão (pesquisa por destino)" },
  { slug: "alemanha", label: "Alemanha — capa do cartão (pesquisa por destino)" },
  { slug: "argentina", label: "Argentina — capa do cartão (pesquisa por destino)" },
  { slug: "chile", label: "Chile — capa do cartão (pesquisa por destino)" },
  { slug: "emirados-arabes", label: "Emirados Árabes — capa do cartão (pesquisa por destino)" },
  { slug: "africa-do-sul", label: "África do Sul — capa do cartão (pesquisa por destino)" },
  { slug: "mexico", label: "México — capa do cartão (pesquisa por destino)" },
  { slug: "uruguai", label: "Uruguai — capa do cartão (pesquisa por destino)" },
  { slug: "caribe", label: "Caribe — capa do cartão (pesquisa por destino)" },
];

export default function AdminBrandingPage() {
  const { user, role, roleLoading } = useAdminAuth();
  const master = useMemo(() => isAdminMasterRole(role), [role]);

  const [loadPending, setLoadPending] = useState(true);
  const [savePending, setSavePending] = useState(false);
  const [row, setRow] = useState<PesquisaPassagensConfigAdmin | null>(null);
  const [draftBrand, setDraftBrand] = useState<Record<string, string>>({});
  const [draftAirline, setDraftAirline] = useState<Record<string, string>>({});
  const [draftDest, setDraftDest] = useState<Record<string, string>>({});
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!master) return;
    setLoadPending(true);
    const { data, error } = await fetchPesquisaPassagensConfig();
    if (error) {
      toast.error(error);
      setLoadPending(false);
      return;
    }
    setRow(data);
    setDraftBrand({ ...(data?.brand_assets ?? {}) });
    setDraftAirline({ ...(data?.airline_logos ?? {}) });
    setDraftDest({ ...(data?.destination_images ?? {}) });
    setLoadPending(false);
  }, [master]);

  useEffect(() => {
    void load();
  }, [load]);

  async function uploadImage(file: File, slotKey: string): Promise<string> {
    const ext = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() ?? "png" : "png";
    const path = `global/${slotKey}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("branding-assets").upload(path, file, {
      upsert: true,
      contentType: file.type || undefined,
    });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from("branding-assets").getPublicUrl(path);
    return pub.publicUrl;
  }

  async function handleUpload(
    e: ChangeEvent<HTMLInputElement>,
    slot: { type: "brand" | "airline" | "destination"; key: string },
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um ficheiro de imagem.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      toast.error("Imagem demasiado grande (máx. 3MB).");
      return;
    }
    setUploadingKey(`${slot.type}:${slot.key}`);
    try {
      const url = await uploadImage(file, `${slot.type}-${slot.key}`);
      if (slot.type === "brand") setDraftBrand((p) => ({ ...p, [slot.key]: url }));
      if (slot.type === "airline") setDraftAirline((p) => ({ ...p, [slot.key]: url }));
      if (slot.type === "destination") setDraftDest((p) => ({ ...p, [slot.key]: url }));
      toast.success("Upload concluído. Não se esqueça de guardar.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no upload.");
    } finally {
      setUploadingKey(null);
      e.target.value = "";
    }
  }

  async function handleSave() {
    if (!row || !user?.id) {
      toast.error("Sem dados carregados.");
      return;
    }
    setSavePending(true);
    const { error } = await updatePesquisaPassagensBrandingAssets({
      destination_images: draftDest,
      brand_assets: draftBrand,
      airline_logos: draftAirline,
      updated_by: user.id,
    });
    setSavePending(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Alterações guardadas. Passam a aplicar-se no Gestor Miles.");
    void load();
  }

  if (roleLoading || loadPending) {
    return (
      <div className="p-6 text-sm text-slate-500" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
        A carregar…
      </div>
    );
  }

  if (!master) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="p-6" style={{ fontFamily: "Inter, system-ui, sans-serif", maxWidth: 960, margin: "0 auto" }}>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Marca e imagens</h1>
        <p className="mt-1 text-sm text-slate-600">
          Defina onde cada imagem aparece no Gestor Miles: marca na barra lateral, logótipos dos programas nos cartões da
          pesquisa de passagens e imagens de capa por destino. Escolha o ficheiro ou cole um URL, depois clique em{" "}
          <strong>Guardar alterações</strong> para aplicar.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Nota técnica (só se precisar de suporte): ficheiros no armazenamento{" "}
          <code className="rounded bg-slate-100 px-1">branding-assets</code>, configuração em{" "}
          <code className="rounded bg-slate-100 px-1">pesquisa_passagens_config</code> — requer migração SQL já aplicada no Supabase.
        </p>
      </div>

      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Marca GestMiles na barra lateral</CardTitle>
            <CardDescription>
              O ícone fica no canto superior esquerdo; o texto «Gest Miles» aparece ao lado quando a barra está visível.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {BRAND_ASSET_KEYS.map((entry) => (
              <div key={entry.key} className="space-y-2">
                <Label htmlFor={`brand-${entry.key}`}>{entry.label}</Label>
                <Input
                  id={`brand-${entry.key}`}
                  value={draftBrand[entry.key] ?? ""}
                  onChange={(e) => setDraftBrand((p) => ({ ...p, [entry.key]: e.target.value }))}
                  placeholder="https://…"
                />
                <Input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(e) => void handleUpload(e, { type: "brand", key: entry.key })}
                />
                {uploadingKey === `brand:${entry.key}` ? (
                  <p className="text-xs text-slate-500">A enviar…</p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Logótipos das companhias / programas</CardTitle>
            <CardDescription>Cada imagem corresponde ao cartão desse programa no ecrã de pesquisa de passagens.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {AIRLINE_KEYS.map((entry) => (
              <div key={entry.key} className="space-y-2">
                <Label htmlFor={`al-${entry.key}`}>{entry.label}</Label>
                <Input
                  id={`al-${entry.key}`}
                  value={draftAirline[entry.key] ?? ""}
                  onChange={(e) => setDraftAirline((p) => ({ ...p, [entry.key]: e.target.value }))}
                  placeholder="https://…"
                />
                <Input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(e) => void handleUpload(e, { type: "airline", key: entry.key })}
                />
                {uploadingKey === `airline:${entry.key}` ? (
                  <p className="text-xs text-slate-500">A enviar…</p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Imagens por região ou país (destinos)</CardTitle>
            <CardDescription>
              Capa do cartão desse destino na pesquisa — substitui o ícone ou o fundo por defeito quando existe URL ou ficheiro.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {DESTINATION_SLUGS.map((entry) => (
              <div key={entry.slug} className="space-y-2">
                <Label htmlFor={`dest-${entry.slug}`}>{entry.label}</Label>
                <Input
                  id={`dest-${entry.slug}`}
                  value={draftDest[entry.slug] ?? ""}
                  onChange={(e) => setDraftDest((p) => ({ ...p, [entry.slug]: e.target.value }))}
                  placeholder="https://…"
                />
                <Input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(e) => void handleUpload(e, { type: "destination", key: entry.slug })}
                />
                {uploadingKey === `destination:${entry.slug}` ? (
                  <p className="text-xs text-slate-500">A enviar…</p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={() => void handleSave()} disabled={savePending || !row}>
            {savePending ? "A guardar…" : "Guardar alterações"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => void load()} disabled={loadPending}>
            Recarregar
          </Button>
        </div>
      </div>
    </div>
  );
}
