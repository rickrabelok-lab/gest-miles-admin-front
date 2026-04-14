-- Corrige leitura/escrita de `perfis` para utilizadores com role `admin_master` no painel.
-- Contexto: `perfis_select_team_scoped` usa `public.is_legacy_platform_admin()`, que na migração
-- original só devolvia true para `role = 'admin' AND equipe_id IS NULL`. Quem é `admin_master`
-- ficava sem acesso a perfis de gestores/CS/admin_equipe (o cliente devolvia 0 linhas / "não encontrado").
--
-- Executar no Supabase SQL Editor (projeto ligado ao admin-app).

create or replace function public.is_legacy_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select
        lower(trim(both from p.role::text)) = 'admin_master'
        or (
          lower(trim(both from p.role::text)) = 'admin'
          and p.equipe_id is null
        )
      from public.perfis p
      where p.usuario_id = auth.uid()
      limit 1
    ),
    false
  );
$$;

comment on function public.is_legacy_platform_admin() is
  'True se o utilizador autenticado é admin global: admin_master (qualquer equipe_id) ou admin sem equipe_id.';
