create table if not exists public.assinaturas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('cliente', 'equipe')),
  referencia_id uuid not null,
  status text not null check (status in ('ativa', 'vencida', 'trial')),
  data_inicio date not null,
  data_fim date not null,
  cancelado_em timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_assinaturas_tipo_ref on public.assinaturas(tipo, referencia_id);
create index if not exists idx_assinaturas_status on public.assinaturas(status);
create index if not exists idx_assinaturas_data_fim on public.assinaturas(data_fim);
create index if not exists idx_assinaturas_cancelado_em on public.assinaturas(cancelado_em);

-- Motivo opcional para churn (assinaturas tipo cliente inativas); execute em bases já criadas.
alter table public.assinaturas add column if not exists motivo_churn text null;

alter table public.assinaturas enable row level security;

drop policy if exists assinaturas_admin_all on public.assinaturas;
create policy assinaturas_admin_all
on public.assinaturas
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

drop policy if exists assinaturas_read_scope on public.assinaturas;
create policy assinaturas_read_scope
on public.assinaturas
for select
to authenticated
using (
  (tipo = 'cliente' and referencia_id = auth.uid())
  or (
    tipo = 'equipe'
    and exists (
      select 1 from public.perfis p
      where p.usuario_id = auth.uid()
        and p.equipe_id is not null
        and p.equipe_id = assinaturas.referencia_id
    )
  )
);
