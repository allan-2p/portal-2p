-- Rode no projeto grupo-2p (banco do portal).
-- Campos espelhados do SAP: equipe de vendas (VKGRP / EQUIPE_VENDAS) e
-- escritório de vendas (VKBUR / ESCRITORIO). Não são editáveis no portal —
-- o portal grava conforme a organização do cliente e sobrescreve com o retorno
-- do SAP quando ele devolver os valores.
--
--   2P Solar         -> EQUIPE_VENDAS 001 / ESCRITORIO 0002
--   2P Carregadores  -> EQUIPE_VENDAS 002 / ESCRITORIO 0003
--   Grupo 2P (ambas) -> EQUIPE_VENDAS 003 / ESCRITORIO 0004

alter table public.clientes add column if not exists equipe_vendas text;
alter table public.clientes add column if not exists escritorio_vendas text;
alter table public.clientes add column if not exists escopo_org text; -- solar | carregadores | grupo

-- Preenche os cadastros já existentes conforme a organização atual.
update public.clientes
   set escopo_org = case
         when coalesce(organizacao, '') ilike '%grupo%' then 'grupo'
         when coalesce(organizacao, instancia, '') ilike '%carregad%' then 'carregadores'
         else 'solar'
       end
 where escopo_org is null;

update public.clientes
   set equipe_vendas = case escopo_org when 'grupo' then '003' when 'carregadores' then '002' else '001' end,
       escritorio_vendas = case escopo_org when 'grupo' then '0004' when 'carregadores' then '0003' else '0002' end
 where equipe_vendas is null or escritorio_vendas is null;

create index if not exists clientes_escritorio_vendas_idx on public.clientes (escritorio_vendas);
