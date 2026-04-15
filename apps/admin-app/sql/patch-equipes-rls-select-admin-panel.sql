-- Permite leitura da tabela `public.equipes` no painel admin quando o perfil é
-- `admin_geral` ou `admin_master` (além do que já existir para `admin` global).
--
-- Sintoma: em `/equipes` aparecem 0 equipas e KPIs a zero, mas na base há linhas
-- (ex.: equipa do João Carvalho). O PostgREST devolve `[]` sem erro quando o RLS
-- não devolve nenhuma linha.
--
-- Executar no Supabase SQL Editor do mesmo projecto que o admin-app.
-- Não activa RLS aqui; só adiciona políticas permissivas em cima das existentes.
--
-- Relacionado: `patch-is-legacy-platform-admin-admin-master.sql` (função
-- `is_legacy_platform_admin`) — não inclua `admin_geral` nessa função se outras
-- políticas dependem dela e não quiser alargar acesso a `perfis`.

drop policy if exists equipes_select_admin_geral_panel on public.equipes;
create policy equipes_select_admin_geral_panel
on public.equipes
for select
to authenticated
using (
  exists (
    select 1
    from public.perfis p
    where p.usuario_id = auth.uid()
      and lower(trim(both from p.role::text)) = 'admin_geral'
  )
);

drop policy if exists equipes_select_admin_master_panel on public.equipes;
create policy equipes_select_admin_master_panel
on public.equipes
for select
to authenticated
using (
  exists (
    select 1
    from public.perfis p
    where p.usuario_id = auth.uid()
      and lower(trim(both from p.role::text)) = 'admin_master'
  )
);
