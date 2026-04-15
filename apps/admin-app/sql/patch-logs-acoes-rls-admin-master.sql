-- Permite que perfis com role `admin_master` leiam e insiram em `logs_acoes` (antes só `admin`).
-- Executar no Supabase SQL Editor se os logs não aparecem para o utilizador admin master.

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
      and lower(trim(both from p.role::text)) in ('admin', 'admin_master')
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
      and lower(trim(both from p.role::text)) in ('admin', 'admin_master')
  )
);
