-- Rode ESTE script no SQL Editor do projeto grupo-2p (npzlinbglznnnwxxcawh),
-- que é o banco usado pelo portal para clientes/contatos.
-- Ele é idempotente: pode ser rodado quantas vezes precisar.

-- Integração SAP + Salesforce (rodar também no projeto grupo-2p)
-- ---------------------------------------------------------------------------
alter table public.clientes add column if not exists finalidade text;          -- Revenda | Industrialização | Uso e Consumo
alter table public.clientes add column if not exists tabela_preco text;        -- PLTYP (ex.: 2P-0001)
alter table public.clientes add column if not exists condicao_pgto_sap text;   -- ZTERM
alter table public.clientes add column if not exists numero_sap text;          -- KUNNR devolvido pelo SAP
alter table public.clientes add column if not exists sap_status text;          -- enviado | erro
alter table public.clientes add column if not exists sap_erro text;
alter table public.clientes add column if not exists sf_account_id text;
alter table public.clientes add column if not exists sf_contact_id text;
alter table public.clientes add column if not exists sf_status text;           -- enviado | erro
alter table public.clientes add column if not exists sf_erro text;
alter table public.clientes add column if not exists sincronizado_em timestamptz;

create index if not exists clientes_numero_sap_idx on public.clientes (numero_sap);

-- Tabela de contatos dos clientes.
-- Rode este script no projeto único grupo-2p (mesmo banco da tabela `clientes`).
-- Cada contato é um registro próprio, vinculado à conta pelo id do cadastro e,
-- principalmente, pelo CÓDIGO SAP (numero_sap) e pelo ID Salesforce da conta
-- (sf_account_id). O id do Contact no Salesforce fica em sf_contact_id.

create extension if not exists "pgcrypto";

create table if not exists public.contatos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  instancia text not null,
  organizacao text not null default '2P Solar',

  -- Vínculos com a conta
  cliente_doc text not null default '',
  numero_sap text,
  sf_account_id text,
  sf_contact_id text,
  sf_status text,
  sf_erro text,

  -- Dados do contato
  tipo text not null default 'outro',           -- principal | financeiro | outro
  nome text not null default '',
  cargo text,
  emails jsonb not null default '[]'::jsonb,
  telefones jsonb not null default '[]'::jsonb,
  ativo boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, tipo, nome)
);

create index if not exists idx_contatos_cliente on public.contatos (cliente_id);
create index if not exists idx_contatos_sap on public.contatos (numero_sap);
create index if not exists idx_contatos_sf_account on public.contatos (sf_account_id);
create index if not exists idx_contatos_doc on public.contatos (cliente_doc);

grant select, insert, update, delete on public.contatos to authenticated;
grant all on public.contatos to service_role;

alter table public.contatos enable row level security;

drop policy if exists "Autenticados leem contatos" on public.contatos;
create policy "Autenticados leem contatos"
  on public.contatos for select to authenticated using (true);

drop policy if exists "Autenticados criam contatos" on public.contatos;
create policy "Autenticados criam contatos"
  on public.contatos for insert to authenticated with check (true);

drop policy if exists "Autenticados atualizam contatos" on public.contatos;
create policy "Autenticados atualizam contatos"
  on public.contatos for update to authenticated using (true) with check (true);

drop policy if exists "Somente service role exclui contatos" on public.contatos;
create policy "Somente service role exclui contatos"
  on public.contatos for delete to service_role using (true);

-- Espelha os contatos que já estavam gravados no JSON da tabela `clientes`.
insert into public.contatos (cliente_id, instancia, organizacao, cliente_doc, numero_sap, sf_account_id, sf_contact_id, tipo, nome, cargo, emails, telefones)
select c.id,
       c.instancia,
       c.organizacao,
       regexp_replace(coalesce(c.doc, ''), '\D', '', 'g'),
       c.numero_sap,
       c.sf_account_id,
       case when j.value->>'tipo' = 'principal' then c.sf_contact_id end,
       coalesce(j.value->>'tipo', 'outro'),
       coalesce(j.value->>'nome', ''),
       nullif(j.value->>'cargo', ''),
       coalesce(j.value->'emails', '[]'::jsonb),
       coalesce(j.value->'telefones', '[]'::jsonb)
  from public.clientes c
  cross join lateral jsonb_array_elements(coalesce(c.contatos, '[]'::jsonb)) j
 where coalesce(j.value->>'nome', '') <> ''
on conflict (cliente_id, tipo, nome) do nothing;
