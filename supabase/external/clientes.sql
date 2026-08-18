-- Tabela universal de cadastro de clientes.
-- Rode este script no projeto único grupo-2p.
-- As unidades são separadas pelas colunas:
--   organizacao = '2P Solar' | '2P Carregadores'
--   instancia   = 'solar'    | 'carregadores'


create extension if not exists "pgcrypto";

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  organizacao text not null,
  instancia text not null,

  -- Identificação
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

  -- Contato
  email text,
  telefone text,
  site text,
  contatos jsonb not null default '[]'::jsonb,
  contato_nome text,
  contato_cargo text,
  contato_email text,
  contato_telefone text,

  -- Endereço
  cep text,
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf text not null,
  municipio_ibge text,

  -- Comercial
  condicao_pagamento text,
  observacoes text,
  ativo boolean not null default true,

  -- Auditoria
  enriquecimento jsonb,
  created_by uuid,
  created_by_nome text,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists clientes_doc_key on public.clientes (doc);
create index if not exists clientes_razao_social_idx on public.clientes (razao_social);

-- Acesso apenas pelo backend do portal (chave secreta do projeto).
grant all on public.clientes to service_role;
alter table public.clientes enable row level security;

-- ---------------------------------------------------------------------------
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
