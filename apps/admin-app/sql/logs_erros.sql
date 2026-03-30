create table if not exists public.logs_erros (
  id uuid primary key default gen_random_uuid(),
  mensagem text not null,
  stack text null,
  origem text not null check (origem in ('frontend', 'backend', 'api')),
  created_at timestamptz not null default now()
);

create index if not exists idx_logs_erros_created_at on public.logs_erros(created_at desc);
create index if not exists idx_logs_erros_origem on public.logs_erros(origem);

alter table public.logs_erros enable row level security;

drop policy if exists logs_erros_admin_select on public.logs_erros;
create policy logs_erros_admin_select
on public.logs_erros
for select
to authenticated
using (
  exists (
    select 1 from public.perfis p
    where p.usuario_id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists logs_erros_admin_insert on public.logs_erros;
create policy logs_erros_admin_insert
on public.logs_erros
for insert
to authenticated
with check (
  exists (
    select 1 from public.perfis p
    where p.usuario_id = auth.uid() and p.role = 'admin'
  )
);
