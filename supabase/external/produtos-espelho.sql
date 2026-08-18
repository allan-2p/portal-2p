-- Espelho de produtos/estoque do SAP no banco do Grupo 2P.
-- Rode este script UMA vez no projeto grupo-2p (https://npzlinbglznnnwxxcawh.supabase.co).
-- O portal é a fonte da verdade: após cada sincronização com o SAP ele replica
-- estas três tabelas (ver src/lib/produtos-mirror.server.ts).

create table if not exists public.produtos (
  codigo text primary key,
  descricao text not null default '',
  unidade text,
  ncm text,
  tipo text,
  permissao text not null default 'Todos',
  lista_preco text,
  grp_mercadorias text,
  custo numeric not null default 0,
  preco_venda numeric not null default 0,
  visibilidade text not null default 'solar',
  no_catalogo boolean not null default false,
  ativo boolean not null default true,
  origem text not null default 'sap',
  sap_raw jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_produtos_visibilidade on public.produtos (visibilidade);

create table if not exists public.estoque (
  material text primary key,
  centro text not null default '9802',
  descricao text,
  ean text,
  ncm text,
  cmm numeric not null default 0,
  preco_venda numeric not null default 0,
  valor_estoque numeric not null default 0,
  grp_mercadorias text,
  tipo_material text,
  umb text,
  est_livre numeric not null default 0,
  est_bloqueado numeric not null default 0,
  qtd_pend_faturar numeric not null default 0,
  est_entreposto numeric not null default 0,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.containers (
  id bigint generated always as identity primary key,
  id_container text not null,
  material text not null,
  est_entreposto numeric not null default 0,
  supplier text,
  dt_remessa text,
  g_weight_total numeric not null default 0,
  n_weight_total numeric not null default 0,
  g_weight_un numeric not null default 0,
  n_weight_un numeric not null default 0,
  atualizado_em timestamptz not null default now(),
  unique (id_container, material)
);
create index if not exists idx_containers_material on public.containers (material);

-- Leitura pública (sites) apenas do que está marcado para catálogo.
alter table public.produtos enable row level security;
alter table public.estoque enable row level security;
alter table public.containers enable row level security;

grant select on public.produtos to anon, authenticated;
grant select on public.estoque to anon, authenticated;
grant select on public.containers to anon, authenticated;
grant all on public.produtos to service_role;
grant all on public.estoque to service_role;
grant all on public.containers to service_role;

drop policy if exists "produtos catalogo publico" on public.produtos;
create policy "produtos catalogo publico" on public.produtos
  for select using (ativo and no_catalogo);

drop policy if exists "estoque leitura publica" on public.estoque;
create policy "estoque leitura publica" on public.estoque
  for select using (true);

drop policy if exists "containers leitura publica" on public.containers;
create policy "containers leitura publica" on public.containers
  for select using (true);
