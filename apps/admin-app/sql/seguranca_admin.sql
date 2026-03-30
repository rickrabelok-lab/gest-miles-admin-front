-- Módulo de segurança do painel admin: histórico de login, tentativas falhadas, bloqueios e revogação de sessão.
-- Execute no Supabase SQL Editor após auth e perfis existirem.

create table if not exists public.admin_security_settings (
  id int primary key default 1 check (id = 1),
  max_failed_attempts int not null default 5,
  lockout_minutes int not null default 15,
  failure_window_minutes int not null default 15,
  updated_at timestamptz not null default now()
);

insert into public.admin_security_settings (id) values (1)
on conflict (id) do nothing;

create table if not exists public.admin_email_lockouts (
  email_norm text primary key,
  locked_until timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_failed_login (
  id uuid primary key default gen_random_uuid(),
  email_norm text not null,
  ip text null,
  device text null,
  user_agent text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_failed_email_time on public.admin_failed_login (email_norm, created_at desc);

create table if not exists public.admin_login_history (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  email text null,
  ip text null,
  device text null,
  user_agent text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_login_hist_user on public.admin_login_history (usuario_id, created_at desc);
create index if not exists idx_admin_login_hist_time on public.admin_login_history (created_at desc);

create table if not exists public.admin_forced_signouts (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_forced_user_time on public.admin_forced_signouts (usuario_id, created_at desc);

create table if not exists public.admin_session_activity (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  email text null,
  ip text null,
  device text null,
  last_seen_at timestamptz not null default now()
);

create index if not exists idx_admin_session_seen on public.admin_session_activity (last_seen_at desc);

-- Bloqueio: consulta pública (anon) para o ecrã de login
create or replace function public.admin_security_is_email_locked(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  u timestamptz;
  en text := lower(trim(coalesce(p_email, '')));
begin
  if en = '' then
    return jsonb_build_object('locked', false);
  end if;
  select locked_until into u from public.admin_email_lockouts where email_norm = en;
  if u is null then
    return jsonb_build_object('locked', false);
  end if;
  if u > now() then
    return jsonb_build_object('locked', true, 'until', u);
  end if;
  delete from public.admin_email_lockouts where email_norm = en;
  return jsonb_build_object('locked', false);
end;
$$;

grant execute on function public.admin_security_is_email_locked(text) to anon, authenticated;

-- Registar falha + aplicar limite e bloqueio temporário
create or replace function public.admin_security_on_failed_login(
  p_email text,
  p_ip text,
  p_device text,
  p_user_agent text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  en text := lower(trim(coalesce(p_email, '')));
  max_att int;
  lock_m int;
  win_m int;
  cnt int;
  new_until timestamptz;
begin
  if en = '' then
    return jsonb_build_object('ok', false, 'reason', 'empty_email');
  end if;

  insert into public.admin_failed_login (email_norm, ip, device, user_agent)
  values (en, nullif(trim(coalesce(p_ip, '')), ''), nullif(trim(coalesce(p_device, '')), ''), nullif(trim(coalesce(p_user_agent, '')), ''));

  select max_failed_attempts, lockout_minutes, failure_window_minutes
  into max_att, lock_m, win_m
  from public.admin_security_settings
  where id = 1;

  max_att := coalesce(max_att, 5);
  lock_m := coalesce(lock_m, 15);
  win_m := coalesce(win_m, 15);

  select count(*)::int into cnt
  from public.admin_failed_login
  where email_norm = en
    and created_at > (now() - ((win_m::text || ' minutes')::interval));

  if cnt >= max_att then
    new_until := now() + ((lock_m::text || ' minutes')::interval);
    insert into public.admin_email_lockouts (email_norm, locked_until, updated_at)
    values (en, new_until, now())
    on conflict (email_norm) do update
      set locked_until = excluded.locked_until,
          updated_at = now();
    return jsonb_build_object('ok', true, 'now_locked', true, 'locked_until', new_until, 'failures_in_window', cnt);
  end if;

  return jsonb_build_object('ok', true, 'now_locked', false, 'failures_in_window', cnt);
end;
$$;

grant execute on function public.admin_security_on_failed_login(text, text, text, text) to anon, authenticated;

-- Após login bem-sucedido (JWT válido): histórico + limpar bloqueio desse email
create or replace function public.admin_security_on_login_success(p_ip text, p_device text, p_user_agent text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  em text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  insert into public.admin_login_history (usuario_id, email, ip, device, user_agent)
  values (
    uid,
    nullif(em, ''),
    nullif(trim(coalesce(p_ip, '')), ''),
    nullif(trim(coalesce(p_device, '')), ''),
    nullif(trim(coalesce(p_user_agent, '')), '')
  );

  if em <> '' then
    delete from public.admin_email_lockouts where email_norm = em;
  end if;
end;
$$;

grant execute on function public.admin_security_on_login_success(text, text, text) to authenticated;

-- Admin força fim de sessão remota (cliente deve fazer polling / visibility)
create or replace function public.admin_security_force_signout(p_target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.perfis p
    where p.usuario_id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'forbidden';
  end if;

  insert into public.admin_forced_signouts (usuario_id) values (p_target_user);
end;
$$;

grant execute on function public.admin_security_force_signout(uuid) to authenticated;

alter table public.admin_security_settings enable row level security;
alter table public.admin_email_lockouts enable row level security;
alter table public.admin_failed_login enable row level security;
alter table public.admin_login_history enable row level security;
alter table public.admin_forced_signouts enable row level security;
alter table public.admin_session_activity enable row level security;

drop policy if exists admin_security_settings_admin on public.admin_security_settings;
create policy admin_security_settings_admin
on public.admin_security_settings
for all
to authenticated
using (
  exists (select 1 from public.perfis p where p.usuario_id = auth.uid() and p.role = 'admin')
)
with check (
  exists (select 1 from public.perfis p where p.usuario_id = auth.uid() and p.role = 'admin')
);

drop policy if exists admin_email_lockouts_admin on public.admin_email_lockouts;
create policy admin_email_lockouts_admin
on public.admin_email_lockouts
for all
to authenticated
using (
  exists (select 1 from public.perfis p where p.usuario_id = auth.uid() and p.role = 'admin')
)
with check (
  exists (select 1 from public.perfis p where p.usuario_id = auth.uid() and p.role = 'admin')
);

drop policy if exists admin_failed_login_admin on public.admin_failed_login;
create policy admin_failed_login_admin
on public.admin_failed_login
for select
to authenticated
using (
  exists (select 1 from public.perfis p where p.usuario_id = auth.uid() and p.role = 'admin')
);

drop policy if exists admin_login_history_admin on public.admin_login_history;
create policy admin_login_history_admin
on public.admin_login_history
for select
to authenticated
using (
  exists (select 1 from public.perfis p where p.usuario_id = auth.uid() and p.role = 'admin')
);

drop policy if exists admin_forced_signouts_select on public.admin_forced_signouts;
create policy admin_forced_signouts_select
on public.admin_forced_signouts
for select
to authenticated
using (
  usuario_id = auth.uid()
  or exists (select 1 from public.perfis p where p.usuario_id = auth.uid() and p.role = 'admin')
);

drop policy if exists admin_forced_signouts_insert_admin on public.admin_forced_signouts;
create policy admin_forced_signouts_insert_admin
on public.admin_forced_signouts
for insert
to authenticated
with check (
  exists (select 1 from public.perfis p where p.usuario_id = auth.uid() and p.role = 'admin')
);

drop policy if exists admin_session_activity_select on public.admin_session_activity;
create policy admin_session_activity_select
on public.admin_session_activity
for select
to authenticated
using (
  usuario_id = auth.uid()
  or exists (select 1 from public.perfis p where p.usuario_id = auth.uid() and p.role = 'admin')
);

drop policy if exists admin_session_activity_insert on public.admin_session_activity;
create policy admin_session_activity_insert
on public.admin_session_activity
for insert
to authenticated
with check (usuario_id = auth.uid());

drop policy if exists admin_session_activity_update on public.admin_session_activity;
create policy admin_session_activity_update
on public.admin_session_activity
for update
to authenticated
using (usuario_id = auth.uid())
with check (usuario_id = auth.uid());
