-- =============================================================================
-- subscriptions — tabela + RLS para o painel admin (Assinaturas & Receita)
-- Execute no SQL Editor do Supabase (projeto ligado ao admin-app).
--
-- Corrige: "Tabela subscriptions não disponível" (relação inexistente) ou
-- leitura vazia / permission denied sem políticas.
-- =============================================================================

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  equipe_id uuid null references public.equipes (id) on delete set null,
  usuario_id uuid null references auth.users (id) on delete set null,
  status text not null default 'active',
  expires_at timestamptz null,
  current_period_end timestamptz null,
  end_at timestamptz null,
  valid_until timestamptz null,
  data_fim timestamptz null,
  canceled_at timestamptz null,
  cancelled_at timestamptz null,
  email text null,
  customer_email text null,
  user_email text null,
  nome text null,
  plan text null,
  plano text null,
  amount numeric null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_subscriptions_equipe_id on public.subscriptions (equipe_id);
create index if not exists idx_subscriptions_usuario_id on public.subscriptions (usuario_id);
create index if not exists idx_subscriptions_status on public.subscriptions (status);
create index if not exists idx_subscriptions_expires_at on public.subscriptions (expires_at);

comment on table public.subscriptions is 'Assinaturas / períodos de acesso — consumida pelo gest-miles-admin-front (listSubscriptionsAdmin).';

alter table public.subscriptions enable row level security;

-- Quem pode ler/alterar: admin global, admin_master, ou admin/admin_equipe da mesma equipe (equipe_id na linha).
drop policy if exists subscriptions_select_admin on public.subscriptions;
create policy subscriptions_select_admin on public.subscriptions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.perfis p
      where p.usuario_id = auth.uid()
        and (
          lower(trim(coalesce(p.role, ''))) = 'admin_master'
          or (lower(trim(coalesce(p.role, ''))) = 'admin' and p.equipe_id is null)
          or (
            lower(trim(coalesce(p.role, ''))) in ('admin', 'admin_equipe')
            and p.equipe_id is not null
            and equipe_id is not null
            and equipe_id = p.equipe_id
          )
        )
    )
  );

drop policy if exists subscriptions_insert_admin on public.subscriptions;
create policy subscriptions_insert_admin on public.subscriptions
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.perfis p
      where p.usuario_id = auth.uid()
        and (
          lower(trim(coalesce(p.role, ''))) = 'admin_master'
          or (lower(trim(coalesce(p.role, ''))) = 'admin' and p.equipe_id is null)
          or (
            lower(trim(coalesce(p.role, ''))) in ('admin', 'admin_equipe')
            and p.equipe_id is not null
            and equipe_id is not null
            and equipe_id = p.equipe_id
          )
        )
    )
  );

drop policy if exists subscriptions_update_admin on public.subscriptions;
create policy subscriptions_update_admin on public.subscriptions
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.perfis p
      where p.usuario_id = auth.uid()
        and (
          lower(trim(coalesce(p.role, ''))) = 'admin_master'
          or (lower(trim(coalesce(p.role, ''))) = 'admin' and p.equipe_id is null)
          or (
            lower(trim(coalesce(p.role, ''))) in ('admin', 'admin_equipe')
            and p.equipe_id is not null
            and equipe_id is not null
            and equipe_id = p.equipe_id
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.perfis p
      where p.usuario_id = auth.uid()
        and (
          lower(trim(coalesce(p.role, ''))) = 'admin_master'
          or (lower(trim(coalesce(p.role, ''))) = 'admin' and p.equipe_id is null)
          or (
            lower(trim(coalesce(p.role, ''))) in ('admin', 'admin_equipe')
            and p.equipe_id is not null
            and equipe_id is not null
            and equipe_id = p.equipe_id
          )
        )
    )
  );

drop policy if exists subscriptions_delete_admin on public.subscriptions;
create policy subscriptions_delete_admin on public.subscriptions
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.perfis p
      where p.usuario_id = auth.uid()
        and (
          lower(trim(coalesce(p.role, ''))) = 'admin_master'
          or (lower(trim(coalesce(p.role, ''))) = 'admin' and p.equipe_id is null)
        )
    )
  );

grant select, insert, update, delete on public.subscriptions to authenticated;
