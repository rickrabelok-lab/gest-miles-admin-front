create table if not exists public.viagens (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.perfis(usuario_id) on delete cascade,
  equipe_id uuid null references public.equipes(id) on delete set null,
  destino text not null,
  data_ida date not null,
  data_volta date not null,
  qtd_passageiros integer not null default 1,
  status text not null default 'planejada' check (status in ('planejada', 'em_andamento', 'chegada_confirmada', 'finalizada')),
  checkin_enviado boolean not null default false,
  chegada_enviada boolean not null default false,
  retorno_enviado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_viagens_equipe_id on public.viagens(equipe_id);
create index if not exists idx_viagens_data_ida on public.viagens(data_ida);
create index if not exists idx_viagens_destino on public.viagens(destino);

