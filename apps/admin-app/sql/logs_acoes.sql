create table if not exists public.logs_acoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  tipo_acao text not null,
  entidade_afetada text not null,
  entidade_id text not null,
  details jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists idx_logs_acoes_created_at on public.logs_acoes(created_at desc);
create index if not exists idx_logs_acoes_tipo_acao on public.logs_acoes(tipo_acao);
create index if not exists idx_logs_acoes_entidade on public.logs_acoes(entidade_afetada, entidade_id);

alter table public.logs_acoes enable row level security;

drop policy if exists logs_acoes_select_self_or_admin on public.logs_acoes;
create policy logs_acoes_select_self_or_admin
on public.logs_acoes
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.perfis p
    where p.usuario_id = auth.uid()
      and p.role = 'admin'
  )
);

drop policy if exists logs_acoes_insert_self_or_admin on public.logs_acoes;
create policy logs_acoes_insert_self_or_admin
on public.logs_acoes
for insert
to authenticated
with check (
  user_id = auth.uid()
  or exists (
    select 1
    from public.perfis p
    where p.usuario_id = auth.uid()
      and p.role = 'admin'
  )
);
