-- ---------------------------------------------------------------------------
-- Propostas universais do portal (Grupo 2P)
-- Rode este script no projeto único grupo-2p (SQL Editor).
-- A separação das unidades é feita pela coluna `organizacao`
-- ('carregadores' | 'solar').
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

create table if not exists public.propostas (
  id uuid primary key default gen_random_uuid(),
  organizacao text not null default 'carregadores',

  numero text,
  numero_sap text,
  nome text,
  status text not null default 'Salvo',

  -- Cliente
  cliente_nome text not null,
  cliente_telefone text,
  cliente_email text,
  cliente_doc text,
  cliente_ie text,
  uf text not null default 'SP',
  contribuinte boolean not null default false,
  finalidade_uso text not null default 'uso_consumo',

  -- Comercial
  previsao_fechamento date,
  tipo_nf text not null default 'venda',
  forma_pagamento text,
  faturar_cliente_final boolean not null default false,
  faturamento jsonb not null default '{}'::jsonb,
  entrega_diferente boolean not null default false,
  entrega jsonb not null default '{}'::jsonb,

  -- Frete
  frete_mod text not null default 'CIF',
  frete_valor numeric not null default 0,
  frete_area_rural boolean not null default false,
  frete_prazo integer,
  transportadora text,
  transportadora_documento text,
  transportadora_id text,

  -- Itens e totais (calculados no servidor)
  itens jsonb not null default '[]'::jsonb,
  totais jsonb not null default '{}'::jsonb,
  observacoes text,

  -- Indicação
  indicacao boolean not null default false,
  padrinho_id uuid,
  padrinho_nome text,

  -- Autoria
  created_by uuid,
  criado_por_nome text,
  consultor_id uuid,
  consultor_nome text,
  finalizado_por uuid,
  finalizado_por_nome text,
  finalizado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists propostas_numero_uidx on public.propostas (numero) where numero is not null;
create unique index if not exists propostas_numero_sap_uidx on public.propostas (numero_sap) where numero_sap is not null;
create index if not exists propostas_organizacao_idx on public.propostas (organizacao);
create index if not exists propostas_created_at_idx on public.propostas (created_at desc);

create table if not exists public.propostas_conclusao_log (
  id uuid primary key default gen_random_uuid(),
  proposta_id uuid,
  numero text,
  status text,
  resultado text not null,
  origem text not null default 'portal',
  actor_id uuid,
  actor_email text,
  actor_nome text,
  detalhe text,
  created_at timestamptz not null default now()
);

create index if not exists propostas_conclusao_log_created_idx
  on public.propostas_conclusao_log (created_at desc);

-- Acesso somente pelo backend do portal (chave secreta do projeto).
grant all on public.propostas to service_role;
grant all on public.propostas_conclusao_log to service_role;
alter table public.propostas enable row level security;
alter table public.propostas_conclusao_log enable row level security;

-- ---------------------------------------------------------------------------
-- Migração das propostas que estavam no banco antigo do portal
-- ---------------------------------------------------------------------------
insert into public.propostas (id,numero,cliente_nome,cliente_telefone,cliente_email,cliente_doc,cliente_ie,uf,contribuinte,frete_mod,frete_valor,itens,totais,status,created_by,created_at,updated_at,finalidade_uso,observacoes,consultor_id,consultor_nome,criado_por_nome,finalizado_por,finalizado_por_nome,finalizado_em,nome,numero_sap,indicacao,padrinho_id,padrinho_nome,previsao_fechamento,tipo_nf,faturar_cliente_final,forma_pagamento,entrega_diferente,entrega,frete_area_rural,faturamento,transportadora,transportadora_documento,transportadora_id,frete_prazo,organizacao) select id,numero,cliente_nome,cliente_telefone,cliente_email,cliente_doc,cliente_ie,uf,contribuinte,frete_mod,frete_valor,itens,totais,status,created_by,created_at,updated_at,finalidade_uso,observacoes,consultor_id,consultor_nome,criado_por_nome,finalizado_por,finalizado_por_nome,finalizado_em,nome,numero_sap,indicacao,padrinho_id,padrinho_nome,previsao_fechamento,tipo_nf,faturar_cliente_final,forma_pagamento,entrega_diferente,entrega,frete_area_rural,faturamento,transportadora,transportadora_documento,transportadora_id,frete_prazo,organizacao from jsonb_populate_record(null::public.propostas, '{"id": "2ac0807f-fb54-4a00-b660-ea336bc5bf0f", "uf": "SP", "nome": "Carregador 80kW", "itens": [{"qtd": 1, "nome": "Carregador Veicular DC 80kW 2Plugs BMDC", "valor": 73000, "codigo": "200000684", "produtoId": "9cc0fc09-3002-4275-ae90-177977d8c1f6", "valorManual": true}], "numero": "552553", "status": "Salvo", "totais": {"mb": 26069.142857142855, "rl": 60569.142857142855, "ipi": 3476.1904761904734, "icms": 2780.952380952381, "custo": 0, "mbPct": 0.3571115459882583, "valor": 73000, "comissao": 2679.5560299453764, "icmsRate": 0.04, "pisCofins": 6173.714285714286, "valorTotal": 74500}, "entrega": {"uf": "SP", "cep": "02279010", "bairro": "VILA NILO", "cidade": "SAO PAULO", "numero": "299", "contato": "", "telefone": "(11) 29514463", "logradouro": "RUA CIRENE DE OLIVEIRA LAET", "complemento": ""}, "tipo_nf": "venda", "frete_mod": "DEDICADO", "indicacao": false, "cliente_ie": "", "created_at": "2026-08-18T16:12:35.000485+00:00", "created_by": "5157ed6f-ece9-4352-a807-a41f40aa6fae", "numero_sap": null, "updated_at": "2026-08-18T16:12:35.000485+00:00", "cliente_doc": "58528906000163", "faturamento": {}, "frete_prazo": null, "frete_valor": 1500, "observacoes": "Valores dos itens expressos com IPI.", "organizacao": "carregadores", "padrinho_id": null, "cliente_nome": "IAT ARQUITETURA", "consultor_id": "5157ed6f-ece9-4352-a807-a41f40aa6fae", "contribuinte": false, "cliente_email": "adriana@adrianacontabil.com.br", "finalizado_em": null, "padrinho_nome": null, "consultor_nome": "Bruno Amaral", "finalidade_uso": "revenda", "finalizado_por": null, "transportadora": null, "criado_por_nome": "Bruno Amaral", "forma_pagamento": "pix", "cliente_telefone": "(11) 29514463", "frete_area_rural": false, "entrega_diferente": false, "transportadora_id": null, "finalizado_por_nome": null, "previsao_fechamento": null, "faturar_cliente_final": false, "transportadora_documento": null}'::jsonb) on conflict (id) do nothing;
insert into public.propostas (id,numero,cliente_nome,cliente_telefone,cliente_email,cliente_doc,cliente_ie,uf,contribuinte,frete_mod,frete_valor,itens,totais,status,created_by,created_at,updated_at,finalidade_uso,observacoes,consultor_id,consultor_nome,criado_por_nome,finalizado_por,finalizado_por_nome,finalizado_em,nome,numero_sap,indicacao,padrinho_id,padrinho_nome,previsao_fechamento,tipo_nf,faturar_cliente_final,forma_pagamento,entrega_diferente,entrega,frete_area_rural,faturamento,transportadora,transportadora_documento,transportadora_id,frete_prazo,organizacao) select id,numero,cliente_nome,cliente_telefone,cliente_email,cliente_doc,cliente_ie,uf,contribuinte,frete_mod,frete_valor,itens,totais,status,created_by,created_at,updated_at,finalidade_uso,observacoes,consultor_id,consultor_nome,criado_por_nome,finalizado_por,finalizado_por_nome,finalizado_em,nome,numero_sap,indicacao,padrinho_id,padrinho_nome,previsao_fechamento,tipo_nf,faturar_cliente_final,forma_pagamento,entrega_diferente,entrega,frete_area_rural,faturamento,transportadora,transportadora_documento,transportadora_id,frete_prazo,organizacao from jsonb_populate_record(null::public.propostas, E'{"id": "ad5e8f88-a2e3-44aa-9ae9-22e041eb2e54", "uf": "RN", "nome": "Carregador 80kw", "itens": [{"qtd": 1, "nome": "Carregador Veicular DC 80kW 2Plugs BMDC", "valor": 72000, "codigo": "200000684", "produtoId": "9cc0fc09-3002-4275-ae90-177977d8c1f6", "valorManual": true}], "numero": "192618", "status": "Salvo", "totais": {"mb": 25239.428571428565, "rl": 59739.428571428565, "ipi": 3428.571428571435, "icms": 2742.8571428571427, "custo": 0, "mbPct": 0.35054761904761894, "valor": 72000, "comissao": 1990.4872877637724, "icmsRate": 0.04, "pisCofins": 6089.142857142856, "valorTotal": 74300}, "entrega": {"uf": "RN", "cep": "59078360", "bairro": "CAPIM MACIO", "cidade": "NATAL", "numero": "1900", "contato": "", "telefone": "(84) 92090489", "logradouro": "RUA MONTE SINAI", "complemento": ""}, "tipo_nf": "venda", "frete_mod": "DEDICADO", "indicacao": false, "cliente_ie": "204967686", "created_at": "2026-08-18T16:23:14.846751+00:00", "created_by": "5157ed6f-ece9-4352-a807-a41f40aa6fae", "numero_sap": null, "updated_at": "2026-08-18T16:23:14.846751+00:00", "cliente_doc": "30961378000112", "faturamento": {}, "frete_prazo": null, "frete_valor": 2300, "observacoes": "Valores dos itens expressos com IPI.\\nO DIFAL não é de responsabilidade da 2P, sendo o recolhimento de responsabilidade do destinatário.", "organizacao": "carregadores", "padrinho_id": null, "cliente_nome": "AWR ENGENHARIA", "consultor_id": "5157ed6f-ece9-4352-a807-a41f40aa6fae", "contribuinte": true, "cliente_email": "contato@awrenergia.com.br", "finalizado_em": null, "padrinho_nome": null, "consultor_nome": "Bruno Amaral", "finalidade_uso": "revenda", "finalizado_por": null, "transportadora": null, "criado_por_nome": "Bruno Amaral", "forma_pagamento": "pix", "cliente_telefone": "(84) 92090489", "frete_area_rural": false, "entrega_diferente": false, "transportadora_id": null, "finalizado_por_nome": null, "previsao_fechamento": null, "faturar_cliente_final": false, "transportadora_documento": null}'::jsonb) on conflict (id) do nothing;
insert into public.propostas (id,numero,cliente_nome,cliente_telefone,cliente_email,cliente_doc,cliente_ie,uf,contribuinte,frete_mod,frete_valor,itens,totais,status,created_by,created_at,updated_at,finalidade_uso,observacoes,consultor_id,consultor_nome,criado_por_nome,finalizado_por,finalizado_por_nome,finalizado_em,nome,numero_sap,indicacao,padrinho_id,padrinho_nome,previsao_fechamento,tipo_nf,faturar_cliente_final,forma_pagamento,entrega_diferente,entrega,frete_area_rural,faturamento,transportadora,transportadora_documento,transportadora_id,frete_prazo,organizacao) select id,numero,cliente_nome,cliente_telefone,cliente_email,cliente_doc,cliente_ie,uf,contribuinte,frete_mod,frete_valor,itens,totais,status,created_by,created_at,updated_at,finalidade_uso,observacoes,consultor_id,consultor_nome,criado_por_nome,finalizado_por,finalizado_por_nome,finalizado_em,nome,numero_sap,indicacao,padrinho_id,padrinho_nome,previsao_fechamento,tipo_nf,faturar_cliente_final,forma_pagamento,entrega_diferente,entrega,frete_area_rural,faturamento,transportadora,transportadora_documento,transportadora_id,frete_prazo,organizacao from jsonb_populate_record(null::public.propostas, E'{"id": "e4b205e3-b52e-4f56-a801-e6f83afdfcc8", "uf": "PI", "nome": "Carregador 80kw", "itens": [{"qtd": 1, "nome": "Carregador Veicular DC 80kW 2Plugs BMDC", "valor": 70500, "codigo": "200000684", "produtoId": "9cc0fc09-3002-4275-ae90-177977d8c1f6", "valorManual": true}], "numero": "860724", "status": "Salvo", "totais": {"mb": 23994.857142857145, "rl": 58494.857142857145, "ipi": 3357.142857142855, "icms": 2685.714285714286, "custo": 0, "mbPct": 0.3403525835866262, "valor": 70500, "comissao": 1105.049665583756, "icmsRate": 0.04, "pisCofins": 5962.285714285715, "valorTotal": 73750}, "entrega": {"uf": "PI", "cep": "64018-000", "bairro": "VERMELHA", "cidade": "TERESINA", "numero": "2089", "contato": "Davi", "telefone": "(86) 81313095", "logradouro": "AVENIDA PEDRO FREITAS", "complemento": ""}, "tipo_nf": "venda", "frete_mod": "DEDICADO", "indicacao": false, "cliente_ie": "196604281", "created_at": "2026-08-18T17:07:42.87297+00:00", "created_by": "5157ed6f-ece9-4352-a807-a41f40aa6fae", "numero_sap": "000015", "updated_at": "2026-08-18T17:07:42.87297+00:00", "cliente_doc": "35940290000138", "faturamento": {}, "frete_prazo": null, "frete_valor": 3250, "observacoes": "Valores dos itens expressos com IPI.\\nO DIFAL não é de responsabilidade da 2P, sendo o recolhimento de responsabilidade do destinatário.", "organizacao": "carregadores", "padrinho_id": null, "cliente_nome": "IPSOLAR", "consultor_id": "5157ed6f-ece9-4352-a807-a41f40aa6fae", "contribuinte": true, "cliente_email": "ipsolarenergia@hotmail.com", "finalizado_em": null, "padrinho_nome": null, "consultor_nome": "Bruno Amaral", "finalidade_uso": "revenda", "finalizado_por": null, "transportadora": null, "criado_por_nome": "Bruno Amaral", "forma_pagamento": "pix", "cliente_telefone": "(86) 81313095", "frete_area_rural": false, "entrega_diferente": true, "transportadora_id": null, "finalizado_por_nome": null, "previsao_fechamento": null, "faturar_cliente_final": false, "transportadora_documento": null}'::jsonb) on conflict (id) do nothing;
insert into public.propostas (id,numero,cliente_nome,cliente_telefone,cliente_email,cliente_doc,cliente_ie,uf,contribuinte,frete_mod,frete_valor,itens,totais,status,created_by,created_at,updated_at,finalidade_uso,observacoes,consultor_id,consultor_nome,criado_por_nome,finalizado_por,finalizado_por_nome,finalizado_em,nome,numero_sap,indicacao,padrinho_id,padrinho_nome,previsao_fechamento,tipo_nf,faturar_cliente_final,forma_pagamento,entrega_diferente,entrega,frete_area_rural,faturamento,transportadora,transportadora_documento,transportadora_id,frete_prazo,organizacao) select id,numero,cliente_nome,cliente_telefone,cliente_email,cliente_doc,cliente_ie,uf,contribuinte,frete_mod,frete_valor,itens,totais,status,created_by,created_at,updated_at,finalidade_uso,observacoes,consultor_id,consultor_nome,criado_por_nome,finalizado_por,finalizado_por_nome,finalizado_em,nome,numero_sap,indicacao,padrinho_id,padrinho_nome,previsao_fechamento,tipo_nf,faturar_cliente_final,forma_pagamento,entrega_diferente,entrega,frete_area_rural,faturamento,transportadora,transportadora_documento,transportadora_id,frete_prazo,organizacao from jsonb_populate_record(null::public.propostas, E'{"id": "d3bd5f5e-1289-4f2c-af59-5f8ebc7a6f2e", "uf": "SP", "nome": "Carregador 80kw", "itens": [{"qtd": 1, "nome": "Carregador Veicular DC 80kW 2Plugs BMDC", "valor": 72000, "codigo": "200000684", "produtoId": "9cc0fc09-3002-4275-ae90-177977d8c1f6", "valorManual": true}], "numero": "485664", "status": "Salvo", "totais": {"mb": 25239.428571428565, "rl": 59739.428571428565, "ipi": 3428.571428571435, "icms": 2742.8571428571427, "custo": 0, "mbPct": 0.35054761904761894, "valor": 72000, "comissao": 1990.4872877637724, "icmsRate": 0.04, "pisCofins": 6089.142857142856, "valorTotal": 73190}, "entrega": {"uf": "SP", "cep": "16018-640", "bairro": "Vila Santa Maria", "cidade": "Araçatuba", "numero": "25", "contato": "", "telefone": "(18) 81472812", "logradouro": "Av. Joaquim Pompeu de Toledo", "complemento": ""}, "tipo_nf": "venda", "frete_mod": "DEDICADO", "indicacao": false, "cliente_ie": "177605487119", "created_at": "2026-08-18T14:48:07.84469+00:00", "created_by": "5157ed6f-ece9-4352-a807-a41f40aa6fae", "numero_sap": null, "updated_at": "2026-08-18T14:48:07.84469+00:00", "cliente_doc": "46717819000175", "faturamento": {}, "frete_prazo": null, "frete_valor": 1190, "observacoes": "Valores dos itens expressos com IPI.\\nO DIFAL não é de responsabilidade da 2P, sendo o recolhimento de responsabilidade do destinatário.", "organizacao": "carregadores", "padrinho_id": null, "cliente_nome": "POLARIS ENERGIA SOLAR", "consultor_id": "5157ed6f-ece9-4352-a807-a41f40aa6fae", "contribuinte": true, "cliente_email": "contato@polarisenergiasolar.com", "finalizado_em": null, "padrinho_nome": null, "consultor_nome": "Bruno Amaral", "finalidade_uso": "revenda", "finalizado_por": null, "transportadora": null, "criado_por_nome": "Bruno Amaral", "forma_pagamento": null, "cliente_telefone": "(18) 81472812", "frete_area_rural": false, "entrega_diferente": true, "transportadora_id": null, "finalizado_por_nome": null, "previsao_fechamento": null, "faturar_cliente_final": false, "transportadora_documento": null}'::jsonb) on conflict (id) do nothing;
insert into public.propostas (id,numero,cliente_nome,cliente_telefone,cliente_email,cliente_doc,cliente_ie,uf,contribuinte,frete_mod,frete_valor,itens,totais,status,created_by,created_at,updated_at,finalidade_uso,observacoes,consultor_id,consultor_nome,criado_por_nome,finalizado_por,finalizado_por_nome,finalizado_em,nome,numero_sap,indicacao,padrinho_id,padrinho_nome,previsao_fechamento,tipo_nf,faturar_cliente_final,forma_pagamento,entrega_diferente,entrega,frete_area_rural,faturamento,transportadora,transportadora_documento,transportadora_id,frete_prazo,organizacao) select id,numero,cliente_nome,cliente_telefone,cliente_email,cliente_doc,cliente_ie,uf,contribuinte,frete_mod,frete_valor,itens,totais,status,created_by,created_at,updated_at,finalidade_uso,observacoes,consultor_id,consultor_nome,criado_por_nome,finalizado_por,finalizado_por_nome,finalizado_em,nome,numero_sap,indicacao,padrinho_id,padrinho_nome,previsao_fechamento,tipo_nf,faturar_cliente_final,forma_pagamento,entrega_diferente,entrega,frete_area_rural,faturamento,transportadora,transportadora_documento,transportadora_id,frete_prazo,organizacao from jsonb_populate_record(null::public.propostas, E'{"id": "d44accb4-1d30-4cf1-9d3c-22fda1bb91b5", "uf": "MT", "nome": "Carregador 80kw", "itens": [{"qtd": 1, "nome": "Carregador Veicular DC 80kW 2Plugs BMDC", "valor": 72500, "codigo": "200000684", "produtoId": "9cc0fc09-3002-4275-ae90-177977d8c1f6", "valorManual": true}], "numero": "548731", "status": "Salvo", "totais": {"mb": 25654.285714285703, "rl": 60154.2857142857, "ipi": 3452.3809523809614, "icms": 2761.9047619047615, "custo": 0, "mbPct": 0.3538522167487683, "valor": 72500, "comissao": 2382.586122534094, "icmsRate": 0.04, "pisCofins": 6131.428571428571, "valorTotal": 74000}, "entrega": {"uf": "MT", "cep": "78455000", "bairro": "VENEZA", "cidade": "LUCAS DO RIO VERDE", "numero": "1796 S", "contato": "", "telefone": "(65) 84312698", "logradouro": "RUA ITANHANGA", "complemento": "QUADRA02 LOTE 17"}, "tipo_nf": "venda", "frete_mod": "DEDICADO", "indicacao": false, "cliente_ie": "00136755348", "created_at": "2026-08-18T16:45:50.957603+00:00", "created_by": "5157ed6f-ece9-4352-a807-a41f40aa6fae", "numero_sap": "000014", "updated_at": "2026-08-18T16:45:50.957603+00:00", "cliente_doc": "26878754000132", "faturamento": {}, "frete_prazo": null, "frete_valor": 1500, "observacoes": "Valores dos itens expressos com IPI.\\nO DIFAL não é de responsabilidade da 2P, sendo o recolhimento de responsabilidade do destinatário.", "organizacao": "carregadores", "padrinho_id": null, "cliente_nome": "PALLE - ARQUITETURA, ENGENHARIA E ENERGIA SOLAR", "consultor_id": "5157ed6f-ece9-4352-a807-a41f40aa6fae", "contribuinte": true, "cliente_email": "pallet.lucas@gmail.com", "finalizado_em": null, "padrinho_nome": null, "consultor_nome": "Bruno Amaral", "finalidade_uso": "industrializacao", "finalizado_por": null, "transportadora": null, "criado_por_nome": "Bruno Amaral", "forma_pagamento": "boleto_vista", "cliente_telefone": "(65) 84312698", "frete_area_rural": false, "entrega_diferente": false, "transportadora_id": null, "finalizado_por_nome": null, "previsao_fechamento": null, "faturar_cliente_final": false, "transportadora_documento": null}'::jsonb) on conflict (id) do nothing;
