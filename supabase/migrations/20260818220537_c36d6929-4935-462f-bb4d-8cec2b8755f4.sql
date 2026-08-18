create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null default 'info',
  titulo text not null,
  descricao text,
  link text,
  ref_tipo text,
  ref_id text,
  chave text,
  lida_em timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists notificacoes_chave_uidx on public.notificacoes (user_id, chave) where chave is not null;
create index if not exists notificacoes_user_created_idx on public.notificacoes (user_id, created_at desc);

grant select, update on public.notificacoes to authenticated;
grant all on public.notificacoes to service_role;

alter table public.notificacoes enable row level security;

create policy "Usuario ve suas notificacoes"
  on public.notificacoes for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "Usuario marca suas notificacoes como lidas"
  on public.notificacoes for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());