import { useMemo, useState } from "react";
import { useEffect } from "react";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  loadOnboardingSnapshot,
  loadOnboardingSnapshotFromBackend,
  saveOnboardingSnapshot,
} from "@/services/adminOnboardingStore";

function relDaysFrom(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000)));
}

function pctColor(progresso: number): string {
  if (progresso >= 100) return "ok";
  if (progresso > 50) return "pu";
  return "warn";
}

export default function AdminOnboardingPage() {
  const [snapshot, setSnapshot] = useState(() => loadOnboardingSnapshot());
  const [selectedId, setSelectedId] = useState(snapshot.equipes[0]?.equipeId ?? "");
  const [configOpen, setConfigOpen] = useState(false);
  const [newEtapa, setNewEtapa] = useState("");

  useEffect(() => {
    let cancelled = false;
    void loadOnboardingSnapshotFromBackend().then((remoteSnapshot) => {
      if (cancelled) return;
      setSnapshot(remoteSnapshot);
      if (!remoteSnapshot.equipes.some((team) => team.equipeId === selectedId)) {
        setSelectedId(remoteSnapshot.equipes[0]?.equipeId ?? "");
      }
    });
    return () => {
      cancelled = true;
    };
    // Carrega dados reais no mount; mantém fallback local se backend indisponível.
  }, []);

  const persist = (next: typeof snapshot) => {
    setSnapshot(next);
    saveOnboardingSnapshot(next);
  };

  const selected = useMemo(
    () => snapshot.equipes.find((team) => team.equipeId === selectedId) ?? snapshot.equipes[0],
    [selectedId, snapshot.equipes],
  );

  const kpi = useMemo(() => {
    const completo = snapshot.equipes.filter((team) => team.progresso === 100).length;
    const progresso = snapshot.equipes.filter((team) => team.progresso > 0 && team.progresso < 100).length;
    const travadas = snapshot.equipes.filter((team) => (team.diasSemProgresso ?? 0) >= 7).length;
    const medias = snapshot.equipes
      .filter((team) => typeof team.diasParaConcluir === "number")
      .map((team) => team.diasParaConcluir as number);
    const mediaDias = medias.length ? Math.round(medias.reduce((sum, value) => sum + value, 0) / medias.length) : 18;
    return { completo, progresso, travadas, mediaDias };
  }, [snapshot.equipes]);

  if (!selected) return null;

  return (
    <div className="gm-onb-page">
      <div className="gm-onb-page-hdr">
        <div>
          <div className="gm-onb-page-title">Onboarding por Equipe</div>
          <div className="gm-onb-page-sub">Acompanhe o progresso de ativação de cada equipe e reduza churn nos primeiros 30 dias</div>
        </div>
        <button type="button" className="gm-onb-btn gm-onb-btn-o" onClick={() => setConfigOpen(true)}>
          Configurar etapas
        </button>
      </div>

      <div className="gm-onb-kpi4">
        <div className="gm-onb-kpi gr"><div className="gm-onb-kl">Onboarding completo</div><div className="gm-onb-kv text-[#16A34A]">{kpi.completo}</div><div className="gm-onb-ks">equipes totalmente ativas</div></div>
        <div className="gm-onb-kpi pu"><div className="gm-onb-kl">Em progresso</div><div className="gm-onb-kv">{kpi.progresso}</div><div className="gm-onb-ks">completando as etapas</div></div>
        <div className="gm-onb-kpi am"><div className="gm-onb-kl">Travadas</div><div className="gm-onb-kv text-[#D97706]">{kpi.travadas}</div><div className="gm-onb-ks">sem progresso há 7+ dias</div></div>
        <div className="gm-onb-kpi bl"><div className="gm-onb-kl">Tempo médio de ativação</div><div className="gm-onb-kv">{kpi.mediaDias} dias</div><div className="gm-onb-ks">do cadastro ao primeiro uso real</div></div>
      </div>

      <div className="gm-onb-g21">
        <div className="gm-onb-card">
          <div className="gm-onb-card-h">
            <div className="gm-onb-card-ti">Progresso de onboarding</div>
            <span className="gm-onb-muted">Clique para ver detalhes</span>
          </div>
          {snapshot.equipes.map((team) => (
            <button
              key={team.equipeId}
              type="button"
              className={cn("gm-onb-team-card", selected.equipeId === team.equipeId && "active", team.status === "travado" && "stuck")}
              onClick={() => setSelectedId(team.equipeId)}
            >
              <div className="gm-onb-tob-top">
                <div className="gm-onb-left">
                  <div className="gm-onb-av">{team.equipeAvatar}</div>
                  <div>
                    <div className="gm-onb-name">{team.equipeNome}</div>
                    <div className="gm-onb-sub">{team.plano} · Criada há {relDaysFrom(team.criadaEm)} dias</div>
                  </div>
                </div>
                <span className={cn("gm-onb-badge", team.status === "completo" && "b-ok", team.status === "progresso" && "b-pu", team.status === "travado" && "b-warn", team.status === "novo" && "b-off")}>
                  {team.status === "completo" ? "✓ Completo" : team.status === "progresso" ? "Em progresso" : team.status === "travado" ? "⚠ Travada" : "Novo"}
                </span>
              </div>
              <div className="gm-onb-progress-row">
                <span className={cn("pct", pctColor(team.progresso) === "ok" && "ok", pctColor(team.progresso) === "pu" && "pu", pctColor(team.progresso) === "warn" && "warn")}>{team.progresso}%</span>
                <div className="bar"><div className={cn("fill", pctColor(team.progresso))} style={{ width: `${team.progresso}%` }} /></div>
                <span className="steps">{team.etapasCompletas} / 8 etapas</span>
              </div>
              <div className="gm-onb-meta-row">
                <div className="dots">
                  {Array.from({ length: 8 }).map((_, index) => (
                    <div key={index} className={cn("dot", index < team.etapasCompletas && "done", index === team.etapasCompletas && team.etapasCompletas < 8 && "current", index > team.etapasCompletas && "todo")} />
                  ))}
                </div>
                <span className={cn("meta-text", team.status === "completo" && "ok", team.status === "travado" && "warn")}>
                  {team.status === "completo"
                    ? `Ativação concluída em ${team.diasParaConcluir ?? 0} dias`
                    : team.status === "travado"
                    ? `Parado há ${team.diasSemProgresso ?? 0} dias`
                    : `Próximo: ${team.etapas.find((step) => step.status === "current")?.nome ?? "Etapa final"}`}
                </span>
              </div>
            </button>
          ))}
        </div>

        <div className="gm-onb-right">
          {selected.status === "travado" ? (
            <div className="gm-onb-risk-banner">
              <div>
                <div className="title">⚠ {selected.equipeNome} está travada há {selected.diasSemProgresso ?? 0} dias na etapa "3 clientes cadastrados".</div>
                <div className="sub">Equipes que não progridem nos primeiros 30 dias têm 3x mais churn.</div>
              </div>
              <button type="button" className="gm-onb-btn-sm gm-onb-btn-sm-warn">Enviar lembrete agora</button>
            </div>
          ) : null}

          <div className="gm-onb-card">
            <div className="gm-onb-dark-h">
              <div className="left">
                <div className="av">{selected.equipeAvatar}</div>
                <div>
                  <div className="name">{selected.equipeNome}</div>
                  <div className="sub">{selected.status === "completo" ? `${selected.diasParaConcluir ?? 0} dias para conclusão` : "Onboarding em andamento"} · {selected.plano.replace("Plano ", "")}</div>
                </div>
              </div>
              <div className="right">
                <div className={cn("pct", pctColor(selected.progresso))}>{selected.progresso}%</div>
                <div className="label">completo</div>
              </div>
            </div>
            <div className="gm-onb-checklist">
              <div className="gm-onb-checklist-label">Checklist de ativação</div>
              {selected.etapas.map((step, index) => (
                <div key={step.id} className={cn("gm-onb-check-step", step.status, index === selected.etapas.length - 1 && "last")}>
                  <div className={cn("icon", step.status, step.isMilestone && "milestone")}>
                    {step.status === "done" ? "✓" : step.status === "current" ? "🕒" : step.isMilestone ? "🏆" : ""}
                  </div>
                  <div className="body">
                    <div className={cn("title", step.status === "todo" && "todo")}>{step.emoji} {step.nome}</div>
                    <div className="desc">{step.descricao}</div>
                    {step.status === "done" && step.concluidaEm ? <div className="date done">Concluído em {new Date(step.concluidaEm).toLocaleDateString("pt-BR")}</div> : null}
                    {step.status === "current" ? <div className="date pending">Esperado: {step.diasEsperados} dias</div> : null}
                    {step.status === "todo" && selected.status === "travado" && step.id <= 3 ? <div className="date stuck">Parado há {selected.diasSemProgresso ?? 0} dias</div> : null}
                  </div>
                </div>
              ))}
            </div>
            <div className="gm-onb-footer-actions">
              {selected.status === "completo" ? (
                <>
                  <button className="gm-onb-btn-sm gm-onb-btn-sm-p">Enviar e-mail de parabéns</button>
                  <button className="gm-onb-btn-sm gm-onb-btn-sm-o">Ver equipe →</button>
                </>
              ) : null}
              {selected.status === "progresso" ? (
                <>
                  <button className="gm-onb-btn-sm gm-onb-btn-sm-warn">Enviar lembrete</button>
                  <button className="gm-onb-btn-sm gm-onb-btn-sm-p">Ver etapa atual →</button>
                </>
              ) : null}
              {selected.status === "travado" ? (
                <>
                  <button className="gm-onb-btn-sm gm-onb-btn-sm-err">Enviar lembrete urgente</button>
                  <button className="gm-onb-btn-sm gm-onb-btn-sm-p">Contatar equipe →</button>
                </>
              ) : null}
              {selected.status === "novo" ? <button className="gm-onb-btn-sm gm-onb-btn-sm-ok">Enviar e-mail de boas-vindas</button> : null}
            </div>
          </div>

          <div className="gm-onb-card">
            <div className="gm-onb-card-h"><div className="gm-onb-card-ti">Métricas de ativação</div></div>
            <div className="gm-onb-mini">
              <div className="row"><span>Tempo até 1ª emissão</span><strong>6 dias</strong></div>
              <div className="row"><span>Tempo até 10 clientes</span><strong>{selected.diasParaConcluir ?? 18} dias</strong></div>
              <div className="row"><span>Lembretes enviados</span><strong>{selected.lembretesEnviados}</strong></div>
              <div className="row"><span>Pontuação de saúde</span><strong className={cn(selected.pontuacaoSaude > 80 ? "ok" : selected.pontuacaoSaude >= 60 ? "warn" : "err")}>{selected.pontuacaoSaude} / 100</strong></div>
            </div>
          </div>
        </div>
      </div>

      <div className="gm-onb-card">
        <div className="gm-onb-card-h"><div className="gm-onb-card-ti">Automações de onboarding</div></div>
        <div className="gm-onb-auto-list">
          {snapshot.automacoes.map((auto) => (
            <div key={auto.id} className="gm-onb-toggle-row">
              <div>
                <div className="label">{auto.label}</div>
                <div className="sub">{auto.descricao}</div>
              </div>
              <button
                className={cn("gm-onb-toggle", auto.enabled ? "on" : "off")}
                onClick={() =>
                  persist({
                    ...snapshot,
                    automacoes: snapshot.automacoes.map((item) => (item.id === auto.id ? { ...item, enabled: !item.enabled } : item)),
                  })
                }
              />
            </div>
          ))}
        </div>
      </div>

      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader><DialogTitle>Configurar etapas</DialogTitle></DialogHeader>
          <div className="gm-onb-config-list">
            {snapshot.etapaConfig.map((step) => (
              <div key={step.id} className="gm-onb-config-item">
                <span className="drag">⠿</span>
                <span className="name">{step.nome}</span>
                <button
                  className={cn("gm-onb-toggle", step.enabled ? "on" : "off")}
                  onClick={() =>
                    persist({
                      ...snapshot,
                      etapaConfig: snapshot.etapaConfig.map((item) => (item.id === step.id ? { ...item, enabled: !item.enabled } : item)),
                    })
                  }
                />
                <input
                  type="number"
                  value={step.diasEsperados}
                  onChange={(event) =>
                    persist({
                      ...snapshot,
                      etapaConfig: snapshot.etapaConfig.map((item) =>
                        item.id === step.id ? { ...item, diasEsperados: Math.max(1, Number(event.target.value) || 1) } : item,
                      ),
                    })
                  }
                />
              </div>
            ))}
            <div className="gm-onb-add-step">
              <input value={newEtapa} onChange={(e) => setNewEtapa(e.target.value)} placeholder="Adicionar nova etapa (visual)" />
              <button
                className="gm-onb-btn-sm gm-onb-btn-sm-p"
                onClick={() => {
                  if (!newEtapa.trim()) return;
                  persist({
                    ...snapshot,
                    etapaConfig: [...snapshot.etapaConfig, { id: snapshot.etapaConfig.length + 1, nome: newEtapa.trim(), enabled: true, diasEsperados: 7 }],
                  });
                  setNewEtapa("");
                }}
              >
                + Etapa
              </button>
            </div>
          </div>
          <DialogFooter>
            <button className="gm-onb-btn gm-onb-btn-o" onClick={() => setConfigOpen(false)}>Cancelar</button>
            <button className="gm-onb-btn gm-onb-btn-p" onClick={() => setConfigOpen(false)}>Salvar configuração</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
