create table if not exists public.financeiro_lancamentos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('receita', 'despesa')),
  categoria text not null check (
    categoria in (
      'assinatura_equipe',
      'assinatura_cliente',
      'agencia_viagens',
      'marketing',
      'ferramentas',
      'equipe',
      'infraestrutura'
    )
  ),
  descricao text null,
  detalhes jsonb null,
  valor numeric(14,2) not null check (valor >= 0),
  data date not null,
  equipe_id uuid null references public.equipes(id) on delete set null,
  usuario_id uuid null references public.perfis(usuario_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (tipo = 'receita' and categoria in ('assinatura_equipe', 'assinatura_cliente', 'agencia_viagens'))
    or
    (tipo = 'despesa' and categoria in ('marketing', 'ferramentas', 'equipe', 'infraestrutura'))
  )
);

create index if not exists idx_financeiro_lancamentos_data on public.financeiro_lancamentos(data);
create index if not exists idx_financeiro_lancamentos_tipo on public.financeiro_lancamentos(tipo);
create index if not exists idx_financeiro_lancamentos_equipe_id on public.financeiro_lancamentos(equipe_id);

alter table public.financeiro_lancamentos
  add column if not exists detalhes jsonb null;
