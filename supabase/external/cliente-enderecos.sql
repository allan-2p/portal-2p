-- Endereços de entrega do cliente (portal universal 2P).
-- Rode este script no projeto grupo-2p.
--
-- O endereço de FATURAMENTO continua nas colunas da tabela `clientes`
-- (vem da consulta do CNPJ). Esta tabela guarda apenas os endereços de
-- ENTREGA que o vendedor cadastra, com um favorito por cliente para já vir
-- pré-selecionado nas propostas.

create extension if not exists "pgcrypto";

create table if not exists public.cliente_enderecos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null,
  cliente_doc text not null,
  instancia text not null,
  organizacao text,

  apelido text,                 -- "Obra Campinas", "Galpão matriz"…
  cep text,
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf text,
  contato text,
  telefone text,
  observacoes text,

  favorito boolean not null default false,
  ativo boolean not null default true,

  created_by uuid,
  created_by_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cliente_enderecos_cliente_idx on public.cliente_enderecos (cliente_id);
create index if not exists cliente_enderecos_doc_idx on public.cliente_enderecos (cliente_doc);

-- Um único favorito por cliente.
create unique index if not exists cliente_enderecos_favorito_key
  on public.cliente_enderecos (cliente_id)
  where favorito;

-- Acesso apenas pelo backend do portal (chave de serviço).
grant all on public.cliente_enderecos to service_role;
alter table public.cliente_enderecos enable row level security;

do $$
begin
  if exists (select 1 from pg_proc where proname = 'touch_updated_at') then
    drop trigger if exists cliente_enderecos_touch on public.cliente_enderecos;
    create trigger cliente_enderecos_touch before update on public.cliente_enderecos
      for each row execute function public.touch_updated_at();
  end if;
end $$;
