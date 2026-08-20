-- Rode no projeto grupo-2p (banco do portal).
-- Tabela espelho do cadastro de clientes no SAP: guarda o KUNNR, a equipe /
-- escritório de vendas, o vendedor e o payload enviado em cada sincronização.
-- Nada aqui é editável pelo portal — é escrito pela integração.

create table if not exists public.clientes_sap (
  cliente_id uuid primary key,
  doc text not null,
  razao_social text,
  organizacao text,
  instancia text,
  numero_sap text,               -- KUNNR
  escopo_org text,               -- solar | carregadores | grupo
  equipe_vendas text,            -- VKGRP
  escritorio_vendas text,        -- VKBUR
  vendedor_sap text,
  tabela_preco text,             -- PLTYP
  condicao_pgto_sap text,        -- ZTERM
  status text,                   -- enviado | erro
  mensagem text,
  payload jsonb,
  sincronizado_em timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists clientes_sap_doc_idx on public.clientes_sap (doc);
create index if not exists clientes_sap_numero_idx on public.clientes_sap (numero_sap);

grant all on public.clientes_sap to service_role;
alter table public.clientes_sap enable row level security;

-- Carga inicial com o que já existe na tabela `clientes`.
insert into public.clientes_sap (
  cliente_id, doc, razao_social, organizacao, instancia, numero_sap,
  escopo_org, equipe_vendas, escritorio_vendas, tabela_preco,
  condicao_pgto_sap, status, mensagem, sincronizado_em
)
select c.id, c.doc, c.razao_social, c.organizacao, c.instancia, c.numero_sap,
       coalesce(c.escopo_org, case
         when coalesce(c.organizacao, '') ilike '%grupo%' then 'grupo'
         when coalesce(c.organizacao, c.instancia, '') ilike '%carregad%' then 'carregadores'
         else 'solar' end),
       coalesce(c.equipe_vendas, case
         when coalesce(c.organizacao, '') ilike '%grupo%' then '003'
         when coalesce(c.organizacao, c.instancia, '') ilike '%carregad%' then '002'
         else '001' end),
       coalesce(c.escritorio_vendas, case
         when coalesce(c.organizacao, '') ilike '%grupo%' then '0004'
         when coalesce(c.organizacao, c.instancia, '') ilike '%carregad%' then '0003'
         else '0002' end),
       c.tabela_preco, c.condicao_pgto_sap, c.sap_status, c.sap_erro, c.sincronizado_em
  from public.clientes c
 where c.numero_sap is not null
on conflict (cliente_id) do nothing;

-- Preenche os cadastros antigos que ficaram sem equipe/escritório.
update public.clientes c
   set escopo_org = coalesce(c.escopo_org, s.escopo_org),
       equipe_vendas = coalesce(c.equipe_vendas, s.equipe_vendas),
       escritorio_vendas = coalesce(c.escritorio_vendas, s.escritorio_vendas)
  from public.clientes_sap s
 where s.cliente_id = c.id
   and (c.escopo_org is null or c.equipe_vendas is null or c.escritorio_vendas is null);
