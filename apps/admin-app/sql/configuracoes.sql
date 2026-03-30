-- Configuração global da aplicação (lida por todos os perfis autenticados; escrita só admin).
-- Ativar Realtime no Supabase: Database → Replication → public.configuracoes (para atualização em tempo real).

create table if not exists public.configuracoes (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  valor jsonb not null default '{}'::jsonb,
  descricao text null,
  versao int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users (id) on delete set null
);

create index if not exists idx_configuracoes_chave on public.configuracoes (chave);

create table if not exists public.configuracoes_historico (
  id uuid primary key default gen_random_uuid(),
  configuracao_id uuid not null references public.configuracoes (id) on delete cascade,
  chave text not null,
  valor_anterior jsonb null,
  valor_novo jsonb not null,
  versao int not null,
  alterado_em timestamptz not null default now(),
  alterado_por uuid null references auth.users (id) on delete set null
);

create index if not exists idx_config_hist_chave on public.configuracoes_historico (chave, alterado_em desc);
create index if not exists idx_config_hist_config on public.configuracoes_historico (configuracao_id, alterado_em desc);

create or replace function public.configuracoes_bump_versao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.valor is distinct from new.valor then
    new.versao := old.versao + 1;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists tr_configuracoes_bump on public.configuracoes;
create trigger tr_configuracoes_bump
before update on public.configuracoes
for each row
execute procedure public.configuracoes_bump_versao();

create or replace function public.configuracoes_log_historico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.configuracoes_historico (configuracao_id, chave, valor_anterior, valor_novo, versao, alterado_por)
    values (new.id, new.chave, null, new.valor, new.versao, new.updated_by);
  elsif tg_op = 'UPDATE' and old.valor is distinct from new.valor then
    insert into public.configuracoes_historico (configuracao_id, chave, valor_anterior, valor_novo, versao, alterado_por)
    values (new.id, new.chave, old.valor, new.valor, new.versao, new.updated_by);
  end if;
  return new;
end;
$$;

drop trigger if exists tr_configuracoes_hist on public.configuracoes;
create trigger tr_configuracoes_hist
after insert or update on public.configuracoes
for each row
execute procedure public.configuracoes_log_historico();

alter table public.configuracoes enable row level security;
alter table public.configuracoes_historico enable row level security;

drop policy if exists configuracoes_select_auth on public.configuracoes;
create policy configuracoes_select_auth
on public.configuracoes
for select
to authenticated
using (true);

drop policy if exists configuracoes_select_anon on public.configuracoes;
create policy configuracoes_select_anon
on public.configuracoes
for select
to anon
using (true);

drop policy if exists configuracoes_write_admin on public.configuracoes;
create policy configuracoes_write_admin
on public.configuracoes
for all
to authenticated
using (
  exists (select 1 from public.perfis p where p.usuario_id = auth.uid() and p.role = 'admin')
)
with check (
  exists (select 1 from public.perfis p where p.usuario_id = auth.uid() and p.role = 'admin')
);

drop policy if exists configuracoes_historico_select_admin on public.configuracoes_historico;
create policy configuracoes_historico_select_admin
on public.configuracoes_historico
for select
to authenticated
using (
  exists (select 1 from public.perfis p where p.usuario_id = auth.uid() and p.role = 'admin')
);

-- Valores iniciais (idempotente)
insert into public.configuracoes (chave, valor, descricao)
values
  ('sistema.app_nome', '"Gest Miles"'::jsonb, 'Nome exibido no cabeçalho e títulos'),
  ('sistema.logo_url', '""'::jsonb, 'URL pública do logótipo (opcional)'),
  ('sistema.cor_primaria', '"#8b5cf6"'::jsonb, 'Cor primária (hex) — aplicada como variável CSS'),
  ('sistema.cor_secundaria', '"#06b6d4"'::jsonb, 'Cor secundária (hex)'),
  ('sistema.cor_accent', '"#22c55e"'::jsonb, 'Cor de destaque (hex)'),
  ('negocio.score', '{"formula":"weighted","pesos":{"engajamento":0.4,"volume":0.3,"recencia":0.3},"notas":"Ajuste pesos; consumo em apps via useAppConfig."}'::jsonb, 'Parâmetros de cálculo de score'),
  ('negocio.economia', '{"moeda_padrao":"BRL","arredondamento":2}'::jsonb, 'Regras de economia / moeda'),
  ('negocio.limites', '{"max_clientes_por_gestor":200,"max_upload_mb":10}'::jsonb, 'Limites operacionais'),
  ('financeiro.categorias', '{"receita":["assinatura_equipe","assinatura_cliente","agencia_viagens"],"despesa":["marketing","ferramentas","equipe","infraestrutura"]}'::jsonb, 'Listas de categorias (referência para UI)'),
  ('financeiro.taxas', '{"iva_padrao":0,"taxa_servico_pct":0}'::jsonb, 'Taxas e impostos padrão'),
  ('viagens.status_padrao', '["planejada","em_andamento","chegada_confirmada","finalizada"]'::jsonb, 'Estados disponíveis para viagens'),
  ('viagens.alertas', '{"pre_viagem_horas":24,"pos_viagem_horas":48}'::jsonb, 'Regras de alertas automáticos'),
  ('notificacoes.templates', '{"boas_vindas":"Olá {{nome}}, bem-vindo ao {{app_nome}}.","lembrete_viagem":"A sua viagem para {{destino}} aproxima-se."}'::jsonb, 'Templates de mensagens (placeholders livres)')
on conflict (chave) do nothing;
