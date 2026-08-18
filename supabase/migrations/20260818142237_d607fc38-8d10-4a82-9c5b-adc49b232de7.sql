create extension if not exists "pgcrypto";

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  organizacao text not null,
  instancia text not null,
  doc text not null,
  razao_social text not null,
  nome_fantasia text,
  ie text,
  ie_situacao text,
  suframa text,
  suframa_situacao text,
  contribuinte boolean not null default false,
  regime_tributario text,
  natureza_juridica text,
  porte text,
  situacao_cadastral text,
  data_abertura text,
  capital_social numeric,
  cnae_principal_codigo text,
  cnae_principal_descricao text,
  cnaes_secundarios jsonb not null default '[]'::jsonb,
  email text,
  telefone text,
  site text,
  contatos jsonb not null default '[]'::jsonb,
  contato_nome text,
  contato_cargo text,
  contato_email text,
  contato_telefone text,
  cep text,
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf text not null,
  municipio_ibge text,
  condicao_pagamento text,
  observacoes text,
  ativo boolean not null default true,
  enriquecimento jsonb,
  created_by uuid,
  created_by_nome text,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalidade text,
  tabela_preco text,
  condicao_pgto_sap text,
  numero_sap text,
  sap_status text,
  sap_erro text,
  sf_account_id text,
  sf_contact_id text,
  sf_status text,
  sf_erro text,
  sincronizado_em timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes TO authenticated;
GRANT ALL ON public.clientes TO service_role;

alter table public.clientes enable row level security;

create unique index if not exists clientes_doc_key on public.clientes (doc);
create index if not exists clientes_razao_social_idx on public.clientes (razao_social);
create index if not exists clientes_numero_sap_idx on public.clientes (numero_sap);

create policy "Usuários autenticados podem ler clientes" on public.clientes for select to authenticated using (true);
create policy "Usuários autenticados podem inserir clientes" on public.clientes for insert to authenticated with check (true);
create policy "Usuários autenticados podem atualizar clientes" on public.clientes for update to authenticated using (true) with check (true);

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger clientes_touch_updated_at
before update on public.clientes
for each row execute function public.touch_updated_at();