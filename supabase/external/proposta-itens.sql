-- ---------------------------------------------------------------------------
-- Itens das propostas universais do portal (Grupo 2P)
-- Rode este script no projeto grupo-2p (https://npzlinbglznnnwxxcawh.supabase.co) (SQL Editor).
--
-- Espelha o JSON `itens` de public.propostas em linhas analíticas: cada item
-- fica vinculado à proposta (id, nº portal, nº SAP e nº Salesforce) para
-- relatórios e para a integração de produtos com o Salesforce.
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

create table if not exists public.proposta_itens (
  id uuid primary key default gen_random_uuid(),
  proposta_id uuid not null references public.propostas (id) on delete cascade,

  -- Vínculos da proposta (denormalizados para relatório sem join)
  organizacao text not null default 'solar',
  numero text,
  numero_sap text,
  sf_opp_id text,

  -- Item
  ordem integer not null default 0,
  codigo_sap text,
  nome text not null default '',
  quantidade numeric not null default 0,
  valor_unitario numeric not null default 0,
  valor_total numeric not null default 0,
  tabela_preco text,
  valor_manual boolean not null default false,
  extra boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists proposta_itens_proposta_idx on public.proposta_itens (proposta_id);
create index if not exists proposta_itens_numero_sap_idx on public.proposta_itens (numero_sap);
create index if not exists proposta_itens_sf_opp_idx on public.proposta_itens (sf_opp_id);
create index if not exists proposta_itens_codigo_idx on public.proposta_itens (codigo_sap);
create index if not exists proposta_itens_org_idx on public.proposta_itens (organizacao);

grant select, insert, update, delete on public.proposta_itens to authenticated;
grant all on public.proposta_itens to service_role;

alter table public.proposta_itens enable row level security;

-- Leitura/escrita seguem o acesso à proposta pai (mesma regra de propostas).
create policy "proposta_itens_select" on public.proposta_itens
  for select to authenticated
  using (
    exists (
      select 1 from public.propostas p
      where p.id = proposta_id
    )
  );

create policy "proposta_itens_write" on public.proposta_itens
  for all to authenticated
  using (true)
  with check (true);

create or replace function public.touch_proposta_itens_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists proposta_itens_touch on public.proposta_itens;
create trigger proposta_itens_touch
  before update on public.proposta_itens
  for each row execute function public.touch_proposta_itens_updated_at();
