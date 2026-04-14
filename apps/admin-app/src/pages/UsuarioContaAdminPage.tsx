import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Calendar, ChevronLeft, Eye, EyeOff, KeyRound, ListTodo, Mail, Plus, Save, Trash2, User } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAccessScope } from "@/hooks/useAccessScope";
import { listEquipeCsLinks, listEquipeGestorLinks } from "@/lib/adminApi";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type AcessoConta = {
  id: string;
  programa: string;
  login: string;
  senha: string;
  lockedAt?: string;
};

type ClientePerfilData = {
  cpf: string;
  rg: string;
  dataNascimento: string;
  emailContato: string;
  passaporte: string;
  informacoesFamiliares: string;
  endereco: string;
  inicioGestao: string;
  acessos: AcessoConta[];
  planoAcao: {
    latam: boolean;
    azul: boolean;
    smiles: boolean;
    avios: boolean;
    copa: boolean;
    allAccor: boolean;
  };
  cartaoPrincipal: string;
  hub: string;
  clubesAssinados: string;
  gestoresResponsaveis: string;
  pauta: string;
};

const defaultPerfilData: ClientePerfilData = {
  cpf: "",
  rg: "",
  dataNascimento: "",
  emailContato: "",
  passaporte: "",
  informacoesFamiliares: "",
  endereco: "",
  inicioGestao: "",
  acessos: [],
  planoAcao: {
    latam: false,
    azul: false,
    smiles: false,
    avios: false,
    copa: false,
    allAccor: false,
  },
  cartaoPrincipal: "",
  hub: "",
  clubesAssinados: "",
  gestoresResponsaveis: "",
  pauta: "",
};

function mergeClientePerfilFromConfig(cfg: Record<string, unknown> | null | undefined): ClientePerfilData {
  const existing = (cfg?.clientePerfil ?? {}) as Partial<ClientePerfilData>;
  return {
    ...defaultPerfilData,
    ...existing,
    acessos:
      Array.isArray(existing.acessos) && existing.acessos.length > 0
        ? existing.acessos.map((a, idx) => ({
            id:
              typeof (a as AcessoConta).id === "string" && String((a as AcessoConta).id).length > 0
                ? String((a as AcessoConta).id)
                : `acesso-${idx}-${Date.now()}`,
            programa: String((a as AcessoConta).programa ?? ""),
            login: String((a as AcessoConta).login ?? ""),
            senha: String((a as AcessoConta).senha ?? ""),
            lockedAt:
              typeof (a as AcessoConta).lockedAt === "string" && String((a as AcessoConta).lockedAt).length > 0
                ? String((a as AcessoConta).lockedAt)
                : undefined,
          }))
        : defaultPerfilData.acessos,
    planoAcao: {
      ...defaultPerfilData.planoAcao,
      ...(existing.planoAcao ?? {}),
    },
  };
}

type PerfilRow = {
  id?: string | null;
  usuario_id: string;
  nome_completo: string | null;
  role: string | null;
  equipe_id: string | null;
  slug: string | null;
  configuracao_tema: Record<string, unknown> | null;
};

async function canEquipeAdminAccessUser(equipeId: string, usuarioId: string): Promise<boolean> {
  const [eg, ec] = await Promise.all([listEquipeGestorLinks(), listEquipeCsLinks()]);
  const gestorOk = eg.some((l) => l.equipe_id === equipeId && l.gestor_id === usuarioId);
  const csOk = ec.some((l) => l.equipe_id === equipeId && l.cs_id === usuarioId);
  return gestorOk || csOk;
}

export default function UsuarioContaAdminPage() {
  const { usuarioId: usuarioIdParam } = useParams<{ usuarioId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { scope, roleLoading } = useAccessScope();

  const usuarioId = (usuarioIdParam ?? "").trim();
  const voltarHref = (searchParams.get("voltar") ?? "/equipes").trim() || "/equipes";

  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState<string | null>(null);
  const [perfilRow, setPerfilRow] = useState<PerfilRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [perfilData, setPerfilData] = useState<ClientePerfilData>(defaultPerfilData);
  const [novoAcesso, setNovoAcesso] = useState({ programa: "", login: "", senha: "" });
  const [showAccessPasswords, setShowAccessPasswords] = useState(false);

  const showClienteBlocks = useMemo(() => {
    const r = String(perfilRow?.role ?? "")
      .trim()
      .toLowerCase();
    return r === "cliente" || r === "cliente_gestao";
  }, [perfilRow?.role]);

  const fallbackSlug = useMemo(() => `cliente-${usuarioId.slice(0, 8)}`, [usuarioId]);

  const load = useCallback(async () => {
    if (!usuarioId) {
      setForbidden("Identificador em falta.");
      setLoading(false);
      return;
    }
    if (roleLoading) return;
    if (!scope) {
      setForbidden("Sem permissões.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setForbidden(null);
    try {
      const { data, error } = await supabase
        .from("perfis")
        .select("id, usuario_id, nome_completo, role, equipe_id, slug, configuracao_tema")
        .eq("usuario_id", usuarioId)
        .maybeSingle();

      if (error) {
        setForbidden(error.message);
        setPerfilRow(null);
        return;
      }
      if (!data) {
        setForbidden(
          "Perfil não encontrado ou sem permissão de leitura (RLS). Se o teu utilizador é admin_master, aplica na base o patch `sql/patch-is-legacy-platform-admin-admin-master.sql` para a função `is_legacy_platform_admin` reconhecer esse role.",
        );
        setPerfilRow(null);
        return;
      }

      const row = data as PerfilRow;

      if (scope.kind === "global_admin") {
        setPerfilRow(row);
      } else if (scope.kind === "equipe_admin" && scope.equipeId) {
        const sameEquipe = (row.equipe_id ?? "") === scope.equipeId;
        const linked = sameEquipe ? true : await canEquipeAdminAccessUser(scope.equipeId, usuarioId);
        if (!sameEquipe && !linked) {
          setForbidden("Sem permissão para ver esta conta nesta gestão.");
          setPerfilRow(null);
          return;
        }
        setPerfilRow(row);
      } else {
        setForbidden("Sem permissão.");
        setPerfilRow(null);
        return;
      }

      const nome = row.nome_completo ?? "";
      setFullName(nome);
      const cfg = (row.configuracao_tema ?? {}) as Record<string, unknown>;
      setPerfilData(mergeClientePerfilFromConfig(cfg));
    } finally {
      setLoading(false);
    }
  }, [usuarioId, roleLoading, scope]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateAcesso = (idx: number, patch: Partial<AcessoConta>) => {
    setPerfilData((prev) => ({
      ...prev,
      acessos: prev.acessos.map((item, i) => (i === idx ? { ...item, ...patch } : item)),
    }));
  };

  const addAcesso = () => {
    const programa = novoAcesso.programa.trim();
    const login = novoAcesso.login.trim();
    const senha = novoAcesso.senha.trim();
    if (!programa || !login || !senha) {
      toast.error("Preencha programa, login e senha antes de adicionar.");
      return;
    }
    setPerfilData((prev) => ({
      ...prev,
      acessos: [
        ...prev.acessos,
        {
          id: crypto.randomUUID(),
          programa,
          login,
          senha,
          lockedAt: new Date().toISOString(),
        },
      ],
    }));
    setNovoAcesso({ programa: "", login: "", senha: "" });
  };

  const removeAcesso = (idx: number) =>
    setPerfilData((prev) => ({
      ...prev,
      acessos: prev.acessos.filter((_, i) => i !== idx),
    }));

  const togglePlano = (key: keyof ClientePerfilData["planoAcao"]) =>
    setPerfilData((prev) => ({
      ...prev,
      planoAcao: { ...prev.planoAcao, [key]: !prev.planoAcao[key] },
    }));

  const handleSave = async () => {
    if (!usuarioId || !perfilRow) return;
    setSaving(true);
    try {
      const { data: existing, error: existingError } = await supabase
        .from("perfis")
        .select("id, slug, configuracao_tema")
        .eq("usuario_id", usuarioId)
        .maybeSingle();
      if (existingError) throw existingError;

      const nextConfig = {
        ...((existing?.configuracao_tema as Record<string, unknown>) ?? {}),
        clientePerfil: perfilData,
      };

      if (existing?.id) {
        const { error } = await supabase
          .from("perfis")
          .update({
            nome_completo: fullName,
            configuracao_tema: nextConfig,
          })
          .eq("usuario_id", usuarioId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("perfis").insert({
          usuario_id: usuarioId,
          slug: `${fallbackSlug}-${usuarioId.slice(0, 8)}`,
          nome_completo: fullName,
          configuracao_tema: nextConfig,
        });
        if (error) throw error;
      }

      toast.success("Perfil salvo.");
      await load();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erro ao salvar perfil.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (roleLoading || (loading && !forbidden && !perfilRow)) {
    return <div className="text-sm text-muted-foreground">A carregar…</div>;
  }

  if (forbidden || !perfilRow) {
    return (
      <div className="max-w-lg space-y-4 rounded-xl border border-border bg-card p-6">
        <p className="text-sm text-destructive">{forbidden ?? "Não foi possível abrir esta conta."}</p>
        <Button type="button" variant="outline" asChild>
          <Link to={voltarHref}>Voltar</Link>
        </Button>
        <p className="text-xs text-muted-foreground">
          Para edição técnica de role e equipa, use <Link className="text-primary underline" to="/users">Utilizadores</Link>.
        </p>
      </div>
    );
  }

  const roleLabel = String(perfilRow.role ?? "—");
  const usersPainelHref =
    perfilRow.equipe_id && perfilRow.equipe_id.length > 0
      ? `/users?equipe=${encodeURIComponent(perfilRow.equipe_id)}&usuario=${encodeURIComponent(usuarioId)}`
      : `/users?usuario=${encodeURIComponent(usuarioId)}`;

  const fieldClass = "rounded-md border border-input bg-background px-3 py-2 text-sm";

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="ghost" size="sm" className="gap-1 px-2" onClick={() => navigate(-1)}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Voltar
        </Button>
        <Button type="button" variant="link" className="h-auto p-0 text-xs text-muted-foreground" asChild>
          <Link to={voltarHref}>Ir para equipa</Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Conta do utilizador</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Vista alinhada ao perfil no app de gestão: dados que o utilizador vê e campos que só a equipa administra.
          Role: <span className="font-mono text-xs">{roleLabel}</span>
          {showClienteBlocks ? null : (
            <span className="block pt-1">
              Conta interna (não cliente): apenas bloco de dados pessoais — igual ao &quot;Meu perfil&quot; no Manager.
            </span>
          )}
        </p>
      </div>

      <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <User className="h-4 w-4" aria-hidden />
          Dados pessoais
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="admin-perfil-nome">Nome completo</Label>
            <Input id="admin-perfil-nome" value={fullName} onChange={(e) => setFullName(e.target.value)} className={fieldClass} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="admin-perfil-cpf">CPF</Label>
              <Input
                id="admin-perfil-cpf"
                value={perfilData.cpf}
                onChange={(e) => setPerfilData((p) => ({ ...p, cpf: e.target.value }))}
                className={fieldClass}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-perfil-rg">RG</Label>
              <Input
                id="admin-perfil-rg"
                value={perfilData.rg}
                onChange={(e) => setPerfilData((p) => ({ ...p, rg: e.target.value }))}
                className={fieldClass}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="admin-perfil-nasc">Data de nascimento</Label>
              <DatePickerField
                id="admin-perfil-nasc"
                value={perfilData.dataNascimento}
                onChange={(ymd) => setPerfilData((p) => ({ ...p, dataNascimento: ymd }))}
                placeholder="DD/MM/AAAA"
                triggerClassName="w-full justify-start font-normal"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-perfil-pass">Passaporte</Label>
              <Input
                id="admin-perfil-pass"
                value={perfilData.passaporte}
                onChange={(e) => setPerfilData((p) => ({ ...p, passaporte: e.target.value }))}
                className={fieldClass}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-perfil-email">E-mail (contacto)</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="admin-perfil-email"
                className={cn(fieldClass, "pl-9")}
                value={perfilData.emailContato}
                onChange={(e) => setPerfilData((p) => ({ ...p, emailContato: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-perfil-fam">Informações familiares</Label>
            <Textarea
              id="admin-perfil-fam"
              className={fieldClass}
              rows={3}
              value={perfilData.informacoesFamiliares}
              onChange={(e) => setPerfilData((p) => ({ ...p, informacoesFamiliares: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-perfil-end">Endereço</Label>
            <Textarea
              id="admin-perfil-end"
              className={fieldClass}
              rows={2}
              value={perfilData.endereco}
              onChange={(e) => setPerfilData((p) => ({ ...p, endereco: e.target.value }))}
            />
          </div>
        </div>
      </section>

      {showClienteBlocks ? (
        <>
          <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Calendar className="h-4 w-4" aria-hidden />
              Gestão e estratégia
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Início na gestão</Label>
                <DatePickerField
                  value={perfilData.inicioGestao}
                  onChange={(ymd) => setPerfilData((p) => ({ ...p, inicioGestao: ymd }))}
                  placeholder="Quando iniciou na gestão"
                  triggerClassName="w-full justify-start font-normal"
                />
              </div>
              <div className="space-y-2">
                <Label>Cartão principal</Label>
                <Input
                  value={perfilData.cartaoPrincipal}
                  onChange={(e) => setPerfilData((p) => ({ ...p, cartaoPrincipal: e.target.value }))}
                  className={fieldClass}
                />
              </div>
              <div className="space-y-2">
                <Label>Hub</Label>
                <Input value={perfilData.hub} onChange={(e) => setPerfilData((p) => ({ ...p, hub: e.target.value }))} className={fieldClass} />
              </div>
              <div className="space-y-2">
                <Label>Clubes assinados</Label>
                <Input
                  value={perfilData.clubesAssinados}
                  onChange={(e) => setPerfilData((p) => ({ ...p, clubesAssinados: e.target.value }))}
                  className={fieldClass}
                />
              </div>
              <div className="space-y-2">
                <Label>Gestores responsáveis</Label>
                <Textarea
                  className={fieldClass}
                  rows={2}
                  value={perfilData.gestoresResponsaveis}
                  onChange={(e) => setPerfilData((p) => ({ ...p, gestoresResponsaveis: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Pauta do cliente</Label>
                <Textarea
                  className={fieldClass}
                  rows={3}
                  value={perfilData.pauta}
                  onChange={(e) => setPerfilData((p) => ({ ...p, pauta: e.target.value }))}
                />
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="text-sm font-semibold">
              <ListTodo className="mb-1 inline h-4 w-4" aria-hidden /> Plano de ação
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              {(
                [
                  ["latam", "Latam"],
                  ["azul", "Azul"],
                  ["smiles", "Smiles"],
                  ["avios", "Avios"],
                  ["copa", "Copa"],
                  ["allAccor", "All Accor"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-2">
                  <input
                    type="checkbox"
                    checked={perfilData.planoAcao[key]}
                    onChange={() => togglePlano(key)}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="font-medium">{label}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <KeyRound className="h-4 w-4" aria-hidden />
                Acessos (programas)
              </div>
              <div className="flex gap-1">
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setShowAccessPasswords((v) => !v)}>
                  {showAccessPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button type="button" size="sm" variant="secondary" className="h-8 gap-1 text-xs" onClick={addAcesso}>
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 rounded-lg border border-dashed border-border p-3 sm:grid-cols-3">
              <Input
                placeholder="Programa"
                value={novoAcesso.programa}
                onChange={(e) => setNovoAcesso((p) => ({ ...p, programa: e.target.value }))}
                className={fieldClass}
              />
              <Input
                placeholder="Login"
                value={novoAcesso.login}
                onChange={(e) => setNovoAcesso((p) => ({ ...p, login: e.target.value }))}
                className={fieldClass}
              />
              <Input
                type={showAccessPasswords ? "text" : "password"}
                placeholder="Senha"
                value={novoAcesso.senha}
                onChange={(e) => setNovoAcesso((p) => ({ ...p, senha: e.target.value }))}
                className={fieldClass}
              />
            </div>
            <div className="space-y-3">
              {perfilData.acessos.map((acesso, idx) => (
                <div key={acesso.id} className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <Input
                      placeholder="Programa"
                      value={acesso.programa}
                      onChange={(e) => updateAcesso(idx, { programa: e.target.value })}
                      className={fieldClass}
                    />
                    <Input
                      placeholder="Login"
                      value={acesso.login}
                      onChange={(e) => updateAcesso(idx, { login: e.target.value })}
                      className={fieldClass}
                    />
                    <Input
                      type={showAccessPasswords ? "text" : "password"}
                      placeholder="Senha"
                      value={acesso.senha}
                      onChange={(e) => updateAcesso(idx, { senha: e.target.value })}
                      className={fieldClass}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => removeAcesso(idx)}>
                      <Trash2 className="mr-1 h-4 w-4" />
                      Remover
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => void handleSave()} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" aria-hidden />
          {saving ? "A guardar…" : "Guardar perfil"}
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link to={usersPainelHref}>Abrir em Utilizadores (roles)</Link>
        </Button>
      </div>

      <p className="font-mono text-xs text-muted-foreground">ID: {usuarioId}</p>
    </div>
  );
}
