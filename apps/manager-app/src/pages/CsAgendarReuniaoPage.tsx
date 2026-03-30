import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { useCsGestores } from "@/hooks/useCsGestores";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePickerField } from "@/components/ui/date-picker-field";

type ReuniaoParticipanteOption = {
  id: string;
  nome: string;
  role: "gestor" | "cs" | "admin";
};

type ReuniaoAgendaItem = {
  id: string;
  titulo: string;
  startsAt: string;
  clienteNome: string | null;
  participantes: Array<{ id: string; nome: string; role: string }>;
};

const getSupabaseErrorMessage = (error: unknown, fallback: string) => {
  const isMissingRelationError = (message: string, code?: string) =>
    code === "42P01" || /does not exist|relation .* does not exist/i.test(message);

  if (error instanceof Error && error.message) {
    if (isMissingRelationError(error.message)) {
      return "A agenda de reuniões ainda não está configurada no banco. Rode a migration de reuniões no Supabase e tente novamente.";
    }
    return error.message;
  }

  if (error && typeof error === "object") {
    const maybe = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const message =
      (typeof maybe.message === "string" && maybe.message) ||
      (typeof maybe.details === "string" && maybe.details) ||
      (typeof maybe.hint === "string" && maybe.hint) ||
      (typeof maybe.code === "string" && maybe.code) ||
      "";
    const code = typeof maybe.code === "string" ? maybe.code : undefined;
    if (isMissingRelationError(message, code)) {
      return "A agenda de reuniões ainda não está configurada no banco. Rode a migration de reuniões no Supabase e tente novamente.";
    }
    if (message) return message;
  }

  return fallback;
};

const CsAgendarReuniaoPage = () => {
  const navigate = useNavigate();
  const { role } = useAuth();
  const csEnabled = role === "cs" || role === "admin";
  const { data: csDash } = useCsGestores(csEnabled);
  const csGrupos = csDash?.grupos ?? [];

  const [selectedEquipeId, setSelectedEquipeId] = useState("");
  const [participantOptions, setParticipantOptions] = useState<ReuniaoParticipanteOption[]>([]);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);
  const [selectedClienteId, setSelectedClienteId] = useState("");
  const [reuniaoTitulo, setReuniaoTitulo] = useState("");
  const [reuniaoDescricao, setReuniaoDescricao] = useState("");
  const [reuniaoData, setReuniaoData] = useState("");
  const [reuniaoHora, setReuniaoHora] = useState("");
  const [agendaLoading, setAgendaLoading] = useState(false);
  const [agendaSaving, setAgendaSaving] = useState(false);
  const [agendaReunioes, setAgendaReunioes] = useState<ReuniaoAgendaItem[]>([]);

  const clientesEquipeSelecionada = useMemo(() => {
    if (!selectedEquipeId) return [] as Array<{ clienteId: string; clienteNome: string }>;
    const grupo = csGrupos.find((g) => g.equipeId === selectedEquipeId);
    if (!grupo) return [];
    const map = new Map<string, string>();
    grupo.gestores.forEach((g) => {
      g.clientes.forEach((c) => {
        if (!map.has(c.clienteId)) map.set(c.clienteId, c.clienteNome);
      });
    });
    return Array.from(map.entries())
      .map(([clienteId, clienteNome]) => ({ clienteId, clienteNome }))
      .sort((a, b) => a.clienteNome.localeCompare(b.clienteNome, "pt-BR"));
  }, [csGrupos, selectedEquipeId]);

  useEffect(() => {
    if (!selectedEquipeId && csGrupos.length > 0) {
      setSelectedEquipeId(csGrupos[0].equipeId);
    }
  }, [selectedEquipeId, csGrupos]);

  const loadAgendaEquipe = async (equipeId: string) => {
    if (!equipeId) {
      setAgendaReunioes([]);
      return;
    }
    setAgendaLoading(true);
    try {
      const { data: reunioesRows, error: reunioesErr } = await supabase
        .from("reunioes_onboarding")
        .select("id, titulo, starts_at, cliente_id")
        .eq("equipe_id", equipeId)
        .order("starts_at", { ascending: true })
        .limit(60);
      if (reunioesErr) throw reunioesErr;

      const reunioes = (reunioesRows ?? []) as Array<{
        id: string;
        titulo: string;
        starts_at: string;
        cliente_id: string | null;
      }>;
      const reuniaoIds = reunioes.map((r) => r.id);

      const { data: partRows, error: partErr } = reuniaoIds.length === 0
        ? { data: [], error: null }
        : await supabase
          .from("reunioes_onboarding_participantes")
          .select("reuniao_id, usuario_id")
          .in("reuniao_id", reuniaoIds);
      if (partErr) throw partErr;

      const usuariosIds = new Set<string>();
      (partRows ?? []).forEach((p) => {
        if (p.usuario_id) usuariosIds.add(p.usuario_id as string);
      });
      reunioes.forEach((r) => {
        if (r.cliente_id) usuariosIds.add(r.cliente_id);
      });

      const ids = Array.from(usuariosIds);
      const { data: perfisRows, error: perfisErr } = ids.length === 0
        ? { data: [], error: null }
        : await supabase
          .from("perfis")
          .select("usuario_id, nome_completo, role")
          .in("usuario_id", ids);
      if (perfisErr) throw perfisErr;

      const perfilMap = new Map<string, { nome: string; role: string }>();
      (perfisRows ?? []).forEach((p) => {
        perfilMap.set(p.usuario_id as string, {
          nome: ((p.nome_completo as string) ?? "").trim() || "Usuário",
          role: ((p.role as string) ?? "").trim() || "cliente",
        });
      });

      const participantesPorReuniao = new Map<string, Array<{ id: string; nome: string; role: string }>>();
      (partRows ?? []).forEach((p) => {
        const reuniaoId = p.reuniao_id as string;
        const usuarioId = p.usuario_id as string;
        if (!reuniaoId || !usuarioId) return;
        if (!participantesPorReuniao.has(reuniaoId)) participantesPorReuniao.set(reuniaoId, []);
        const perfil = perfilMap.get(usuarioId);
        participantesPorReuniao.get(reuniaoId)!.push({
          id: usuarioId,
          nome: perfil?.nome ?? "Usuário",
          role: perfil?.role ?? "usuario",
        });
      });

      setAgendaReunioes(
        reunioes.map((r) => ({
          id: r.id,
          titulo: r.titulo,
          startsAt: r.starts_at,
          clienteNome: r.cliente_id ? (perfilMap.get(r.cliente_id)?.nome ?? "Cliente") : null,
          participantes: participantesPorReuniao.get(r.id) ?? [],
        })),
      );
    } catch (error) {
      toast.error(getSupabaseErrorMessage(error, "Não foi possível carregar agenda."));
      setAgendaReunioes([]);
    } finally {
      setAgendaLoading(false);
    }
  };

  const loadParticipantOptions = async (equipeId: string) => {
    if (!equipeId) {
      setParticipantOptions([]);
      setSelectedParticipantIds([]);
      return;
    }
    const grupo = csGrupos.find((g) => g.equipeId === equipeId);
    const gestores = (grupo?.gestores ?? []).map((g) => ({
      id: g.gestorId,
      nome: g.gestorNome,
      role: "gestor" as const,
    }));

    try {
      const { data: equipeCsRows, error: equipeCsErr } = await supabase
        .from("equipe_cs")
        .select("cs_id")
        .eq("equipe_id", equipeId);
      if (equipeCsErr) throw equipeCsErr;

      const csIds = [...new Set((equipeCsRows ?? []).map((r) => r.cs_id as string).filter(Boolean))];
      const { data: csPerfisRows, error: csPerfisErr } = csIds.length === 0
        ? { data: [], error: null }
        : await supabase
          .from("perfis")
          .select("usuario_id, nome_completo")
          .in("usuario_id", csIds);
      if (csPerfisErr) throw csPerfisErr;

      const csParticipantes: ReuniaoParticipanteOption[] = (csPerfisRows ?? []).map((p) => ({
        id: p.usuario_id as string,
        nome: ((p.nome_completo as string) ?? "").trim() || "CS",
        role: "cs",
      }));

      const { data: adminsRows, error: adminsErr } = await supabase
        .from("perfis")
        .select("usuario_id, nome_completo")
        .eq("role", "admin")
        .limit(100);
      if (adminsErr) throw adminsErr;
      const admins: ReuniaoParticipanteOption[] = (adminsRows ?? []).map((p) => ({
        id: p.usuario_id as string,
        nome: ((p.nome_completo as string) ?? "").trim() || "Admin",
        role: "admin",
      }));

      const dedup = new Map<string, ReuniaoParticipanteOption>();
      [...gestores, ...csParticipantes, ...admins].forEach((p) => dedup.set(p.id, p));
      const options = Array.from(dedup.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      setParticipantOptions(options);
      setSelectedParticipantIds(options.map((o) => o.id));
    } catch (error) {
      toast.error(getSupabaseErrorMessage(error, "Não foi possível carregar participantes."));
      setParticipantOptions(gestores);
      setSelectedParticipantIds(gestores.map((g) => g.id));
    }
  };

  const handleCreateReuniao = async () => {
    if (!selectedEquipeId) {
      toast.error("Selecione a equipe.");
      return;
    }
    if (!reuniaoTitulo.trim()) {
      toast.error("Informe o título da reunião.");
      return;
    }
    if (!reuniaoData || !reuniaoHora) {
      toast.error("Informe data e hora da reunião.");
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(reuniaoHora)) {
      toast.error("Informe a hora no formato 24h (HH:mm).");
      return;
    }
    if (selectedParticipantIds.length === 0) {
      toast.error("Selecione ao menos 1 participante.");
      return;
    }
    const startAt = new Date(`${reuniaoData}T${reuniaoHora}:00`);
    if (Number.isNaN(startAt.getTime())) {
      toast.error("Data/hora inválida.");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      toast.error("Sessão inválida. Faça login novamente.");
      return;
    }

    setAgendaSaving(true);
    try {
      const { data: inserted, error: insertErr } = await supabase
        .from("reunioes_onboarding")
        .insert({
          equipe_id: selectedEquipeId,
          cliente_id: selectedClienteId || null,
          titulo: reuniaoTitulo.trim(),
          descricao: reuniaoDescricao.trim() || null,
          starts_at: startAt.toISOString(),
          created_by: user.id,
        })
        .select("id")
        .single();
      if (insertErr) throw insertErr;

      const participantIds = [...new Set([...selectedParticipantIds, user.id])];
      const { error: participantErr } = await supabase
        .from("reunioes_onboarding_participantes")
        .insert(participantIds.map((usuarioId) => ({
          reuniao_id: inserted.id as string,
          usuario_id: usuarioId,
        })));
      if (participantErr) throw participantErr;

      toast.success("Reunião de onboarding agendada.");
      setReuniaoTitulo("");
      setReuniaoDescricao("");
      setReuniaoData("");
      setReuniaoHora("");
      setSelectedClienteId("");
      await loadAgendaEquipe(selectedEquipeId);
    } catch (error) {
      toast.error(getSupabaseErrorMessage(error, "Não foi possível agendar reunião."));
    } finally {
      setAgendaSaving(false);
    }
  };

  useEffect(() => {
    if (!selectedEquipeId) return;
    void loadParticipantOptions(selectedEquipeId);
    void loadAgendaEquipe(selectedEquipeId);
  }, [selectedEquipeId]);

  return (
    <div className="mx-auto min-h-screen w-full max-w-md bg-nubank-bg p-4 pb-24 dark:bg-background">
      <header className="mb-4 flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => navigate("/cs")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-semibold">Agendar Reunião</h1>
      </header>

      <Card className="rounded-xl border-border/80 bg-white/95 shadow-nubank dark:border-border dark:bg-card">
        <CardHeader className="pb-2 pt-4">
          <p className="text-sm font-semibold text-foreground">Agenda de onboarding</p>
          <p className="text-xs text-muted-foreground">
            Selecione equipe, cliente e participantes para agendar reuniões.
          </p>
        </CardHeader>
        <CardContent className="space-y-3 pb-4 pt-0">
          <div className="grid grid-cols-1 gap-2">
            <Label htmlFor="agenda-equipe">Equipe</Label>
            <select
              id="agenda-equipe"
              value={selectedEquipeId}
              onChange={(e) => setSelectedEquipeId(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="">Selecione a equipe</option>
              {csGrupos.map((grupo) => (
                <option key={grupo.equipeId} value={grupo.equipeId}>
                  {grupo.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <Label htmlFor="agenda-cliente">Cliente (onboarding)</Label>
            <select
              id="agenda-cliente"
              value={selectedClienteId}
              onChange={(e) => setSelectedClienteId(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="">Sem cliente específico</option>
              {clientesEquipeSelecionada.map((cliente) => (
                <option key={cliente.clienteId} value={cliente.clienteId}>
                  {cliente.clienteNome}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <Label htmlFor="agenda-titulo">Título</Label>
            <Input
              id="agenda-titulo"
              placeholder="Ex: Onboarding inicial LATAM"
              value={reuniaoTitulo}
              onChange={(e) => setReuniaoTitulo(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label htmlFor="agenda-data">Data</Label>
              <DatePickerField
                id="agenda-data"
                value={reuniaoData}
                onChange={setReuniaoData}
                placeholder="Escolher data"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agenda-hora">Hora</Label>
              <Input
                id="agenda-hora"
                type="text"
                value={reuniaoHora}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^\d]/g, "").slice(0, 4);
                  const next =
                    raw.length <= 2 ? raw : `${raw.slice(0, 2)}:${raw.slice(2)}`;
                  setReuniaoHora(next);
                }}
                inputMode="numeric"
                placeholder="HH:mm (24h)"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <Label htmlFor="agenda-descricao">Observações</Label>
            <Input
              id="agenda-descricao"
              placeholder="Pauta, link de call, contexto"
              value={reuniaoDescricao}
              onChange={(e) => setReuniaoDescricao(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Participantes da reunião</p>
            {participantOptions.length === 0 ? (
              <p className="text-xs text-muted-foreground">Selecione uma equipe para carregar participantes.</p>
            ) : (
              <div className="grid grid-cols-1 gap-1.5 rounded-lg border border-border p-2">
                {participantOptions.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={selectedParticipantIds.includes(p.id)}
                      onChange={(e) =>
                        setSelectedParticipantIds((prev) =>
                          e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id),
                        )
                      }
                      className="h-4 w-4"
                    />
                    <span className="font-medium">{p.nome}</span>
                    <span className="text-muted-foreground">({p.role})</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={() => void handleCreateReuniao()} disabled={agendaSaving || !selectedEquipeId}>
              {agendaSaving ? "Agendando..." : "Agendar reunião"}
            </Button>
          </div>

          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs font-semibold text-muted-foreground">Próximas reuniões da equipe</p>
            {agendaLoading ? (
              <p className="text-xs text-muted-foreground">Carregando agenda...</p>
            ) : agendaReunioes.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma reunião cadastrada para essa equipe.</p>
            ) : (
              <div className="max-h-56 space-y-2 overflow-y-auto">
                {agendaReunioes.map((reuniao) => (
                  <div key={reuniao.id} className="rounded-lg border border-border/70 bg-background/60 p-2">
                    <p className="text-xs font-semibold">{reuniao.titulo}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(reuniao.startsAt).toLocaleDateString("pt-BR")} às{" "}
                      {new Date(reuniao.startsAt).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {reuniao.clienteNome ? ` · ${reuniao.clienteNome}` : ""}
                    </p>
                    {reuniao.participantes.length > 0 && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Participantes: {reuniao.participantes.map((p) => p.nome).join(", ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CsAgendarReuniaoPage;

