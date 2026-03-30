import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

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

const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const ClientProfile = () => {
  const navigate = useNavigate();
  const { user, loading, role } = useAuth();
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [perfilData, setPerfilData] = useState<ClientePerfilData>(defaultPerfilData);
  const [novoAcesso, setNovoAcesso] = useState<{ programa: string; login: string; senha: string }>({
    programa: "",
    login: "",
    senha: "",
  });
  const [showAccessPasswords, setShowAccessPasswords] = useState(false);
  const canManageAccesses =
    role === "gestor" || role === "admin" || (role as unknown as string) === "cs";

  const fallbackSlug = useMemo(() => {
    const fromEmail = user?.email?.split("@")[0] ?? "usuario";
    return slugify(fromEmail) || `user-${Date.now().toString().slice(-6)}`;
  }, [user?.email]);

  useEffect(() => {
    if (!user?.id) return;
    const load = async () => {
      const { data, error } = await supabase
        .from("perfis")
        .select("nome_completo, configuracao_tema")
        .eq("usuario_id", user.id)
        .maybeSingle();
      if (error) {
        toast.error(`Erro ao carregar perfil: ${error.message}`);
        return;
      }

      const nome = data?.nome_completo ?? user.email?.split("@")[0] ?? "";
      setFullName(nome);

      const cfg = (data?.configuracao_tema ?? {}) as Record<string, unknown>;
      const existing = (cfg.clientePerfil ?? {}) as Partial<ClientePerfilData>;
      setPerfilData({
        ...defaultPerfilData,
        ...existing,
        acessos:
          Array.isArray(existing.acessos) && existing.acessos.length > 0
            ? existing.acessos.map((a, idx) => ({
                id:
                  typeof a.id === "string" && a.id.length > 0
                    ? a.id
                    : `acesso-${idx}-${Date.now()}`,
                programa: String(a.programa ?? ""),
                login: String(a.login ?? ""),
                senha: String(a.senha ?? ""),
                lockedAt:
                  typeof a.lockedAt === "string" && a.lockedAt.length > 0
                    ? a.lockedAt
                    : undefined,
              }))
            : defaultPerfilData.acessos,
        planoAcao: {
          ...defaultPerfilData.planoAcao,
          ...(existing.planoAcao ?? {}),
        },
      });
    };
    void load();
  }, [user?.id, user?.email]);

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
    if (!user?.id) return;
    setSaving(true);
    try {
      const { data: existing, error: existingError } = await supabase
        .from("perfis")
        .select("id, slug, configuracao_tema")
        .eq("usuario_id", user.id)
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
          .eq("usuario_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("perfis").insert({
          usuario_id: user.id,
          slug: `${fallbackSlug}-${user.id.slice(0, 8)}`,
          nome_completo: fullName,
          configuracao_tema: nextConfig,
        });
        if (error) throw error;
      }

      toast.success("Perfil do cliente salvo com sucesso.");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erro ao salvar perfil.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!loading && !user) return <Navigate to="/auth" replace />;

  return (
    <div className="mx-auto min-h-screen w-full max-w-md bg-background px-4 pb-24 pt-5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mb-2 -ml-1 h-8 px-2 text-xs text-muted-foreground"
        onClick={() => navigate(-1)}
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Button>
      <h1 className="text-lg font-semibold">Perfil do cliente</h1>
      <p className="mb-4 text-xs text-muted-foreground">
        Preencha os dados estratégicos e operacionais da conta.
      </p>

      <div className="space-y-4">
        <section className="space-y-2 rounded-xl border border-border bg-card p-3">
          <p className="text-xs font-semibold text-muted-foreground">Dados pessoais</p>
          <Input placeholder="Nome completo" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="CPF" value={perfilData.cpf} onChange={(e) => setPerfilData((p) => ({ ...p, cpf: e.target.value }))} />
            <Input placeholder="RG" value={perfilData.rg} onChange={(e) => setPerfilData((p) => ({ ...p, rg: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" placeholder="Data de nascimento" value={perfilData.dataNascimento} onChange={(e) => setPerfilData((p) => ({ ...p, dataNascimento: e.target.value }))} />
            <Input placeholder="Passaporte" value={perfilData.passaporte} onChange={(e) => setPerfilData((p) => ({ ...p, passaporte: e.target.value }))} />
          </div>
          <Input placeholder="Email" value={perfilData.emailContato} onChange={(e) => setPerfilData((p) => ({ ...p, emailContato: e.target.value }))} />
          <Textarea placeholder="Informações familiares" value={perfilData.informacoesFamiliares} onChange={(e) => setPerfilData((p) => ({ ...p, informacoesFamiliares: e.target.value }))} />
          <Textarea placeholder="Endereço" value={perfilData.endereco} onChange={(e) => setPerfilData((p) => ({ ...p, endereco: e.target.value }))} />
        </section>

        <section className="space-y-2 rounded-xl border border-border bg-card p-3">
          <p className="text-xs font-semibold text-muted-foreground">Gestão e estratégia</p>
          <Input type="date" placeholder="Quando iniciou na gestão" value={perfilData.inicioGestao} onChange={(e) => setPerfilData((p) => ({ ...p, inicioGestao: e.target.value }))} />
          <Input placeholder="Cartão de crédito principal de uso" value={perfilData.cartaoPrincipal} onChange={(e) => setPerfilData((p) => ({ ...p, cartaoPrincipal: e.target.value }))} />
          <Input placeholder="Hub (aeroporto principal)" value={perfilData.hub} onChange={(e) => setPerfilData((p) => ({ ...p, hub: e.target.value }))} />
          <Input placeholder="Clubes assinados" value={perfilData.clubesAssinados} onChange={(e) => setPerfilData((p) => ({ ...p, clubesAssinados: e.target.value }))} />
          <Textarea placeholder="Gestores que cuidam da carteira desse cliente" value={perfilData.gestoresResponsaveis} onChange={(e) => setPerfilData((p) => ({ ...p, gestoresResponsaveis: e.target.value }))} />
          <Textarea
            placeholder="Pauta do cliente (especificações, prioridades, combinados e restrições)"
            value={perfilData.pauta}
            onChange={(e) => setPerfilData((p) => ({ ...p, pauta: e.target.value }))}
          />
        </section>

        <section className="space-y-2 rounded-xl border border-border bg-card p-3">
          <p className="text-xs font-semibold text-muted-foreground">Plano de ação</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {([
              ["latam", "Latam"],
              ["azul", "Azul"],
              ["smiles", "Smiles"],
              ["avios", "Avios"],
              ["copa", "Copa"],
              ["allAccor", "All Accor"],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5">
                <input
                  type="checkbox"
                  checked={perfilData.planoAcao[key]}
                  onChange={() => togglePlano(key)}
                  className="h-4 w-4"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-2 rounded-xl border border-border bg-card p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground">Acessos (programas e companhias)</p>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => setShowAccessPasswords((prev) => !prev)}
                title={showAccessPasswords ? "Ocultar senhas" : "Mostrar senhas"}
              >
                {showAccessPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={addAcesso}
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-lg border border-dashed border-border p-2">
            <Input
              placeholder="Programa"
              value={novoAcesso.programa}
              onChange={(e) => setNovoAcesso((prev) => ({ ...prev, programa: e.target.value }))}
            />
            <Input
              placeholder="Login"
              value={novoAcesso.login}
              onChange={(e) => setNovoAcesso((prev) => ({ ...prev, login: e.target.value }))}
            />
            <Input
              type={showAccessPasswords ? "text" : "password"}
              placeholder="Senha"
              value={novoAcesso.senha}
              onChange={(e) => setNovoAcesso((prev) => ({ ...prev, senha: e.target.value }))}
            />
          </div>
          {perfilData.acessos.map((acesso, idx) => (
            <div key={acesso.id} className="space-y-2 rounded-lg border border-border p-2">
              {!canManageAccesses && (
                <p className="text-[11px] font-medium text-muted-foreground">
                  Registro travado para cliente. Edição apenas por gestor/CS/admin.
                </p>
              )}
              <div className="grid grid-cols-3 gap-2">
                <Input
                  placeholder="Programa"
                  value={acesso.programa}
                  onChange={(e) => updateAcesso(idx, { programa: e.target.value })}
                  readOnly={!canManageAccesses}
                />
                <Input
                  placeholder="Login"
                  value={acesso.login}
                  onChange={(e) => updateAcesso(idx, { login: e.target.value })}
                  readOnly={!canManageAccesses}
                />
                <Input
                  type={showAccessPasswords ? "text" : "password"}
                  placeholder="Senha"
                  value={acesso.senha}
                  onChange={(e) => updateAcesso(idx, { senha: e.target.value })}
                  readOnly={!canManageAccesses}
                />
              </div>
              <div className="flex justify-end gap-2">
                {canManageAccesses && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => removeAcesso(idx)}>
                    <Trash2 className="h-4 w-4" />
                    Remover
                  </Button>
                )}
              </div>
            </div>
          ))}
        </section>

        <Button type="button" className="w-full" onClick={handleSave} disabled={saving}>
          {saving ? "Salvando..." : "Salvar perfil"}
        </Button>
      </div>
    </div>
  );
};

export default ClientProfile;
