create table if not exists public.fila_processos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('envio_email', 'alerta', 'processamento')),
  status text not null check (status in ('pendente', 'processando', 'concluido', 'erro')),
  tentativas integer not null default 0 check (tentativas >= 0),
  payload jsonb null,
  erro_mensagem text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fila_processos_status on public.fila_processos(status);
create index if not exists idx_fila_processos_created_at on public.fila_processos(created_at desc);

alter table public.fila_processos enable row level security;

drop policy if exists fila_processos_admin_all on public.fila_processos;
create policy fila_processos_admin_all
on public.fila_processos
for all
to authenticated
using (
  exists (
    select 1 from public.perfis p
    where p.usuario_id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.perfis p
    where p.usuario_id = auth.uid() and p.role = 'admin'
  )
);
