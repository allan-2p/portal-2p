-- Consultor por instância (cadastros com atuação Grupo 2P).
-- Rode no projeto grupo-2p (https://npzlinbglznnnwxxcawh.supabase.co).
--
-- Um cliente com escopo_org = 'grupo' aparece nas duas unidades e pode ter um
-- vendedor responsável diferente em cada uma. No SAP continua existindo apenas
-- um vendedor principal (par canônico consultor_sap / consultor_nome); estas
-- colunas valem só para o portal (visibilidade e carteira por unidade).
--
-- Regra de leitura: consultor da instância X = consultor_<X>_* quando
-- preenchido; caso contrário, o par canônico consultor_*.

alter table public.clientes add column if not exists consultor_solar_sap text;
alter table public.clientes add column if not exists consultor_solar_nome text;
alter table public.clientes add column if not exists consultor_solar_id uuid;

alter table public.clientes add column if not exists consultor_carregadores_sap text;
alter table public.clientes add column if not exists consultor_carregadores_nome text;
alter table public.clientes add column if not exists consultor_carregadores_id uuid;

-- Backfill: o consultor atual passa a valer para a unidade de origem do
-- cadastro. A outra unidade fica em branco (herda o canônico) até alguém
-- definir um responsável próprio.
update public.clientes
   set consultor_solar_sap = consultor_sap,
       consultor_solar_nome = consultor_nome,
       consultor_solar_id = consultor_id
 where coalesce(instancia, 'solar') = 'solar'
   and consultor_solar_sap is null
   and consultor_solar_nome is null;

update public.clientes
   set consultor_carregadores_sap = consultor_sap,
       consultor_carregadores_nome = consultor_nome,
       consultor_carregadores_id = consultor_id
 where instancia = 'carregadores'
   and consultor_carregadores_sap is null
   and consultor_carregadores_nome is null;

create index if not exists clientes_consultor_solar_sap_idx on public.clientes (consultor_solar_sap);
create index if not exists clientes_consultor_carregadores_sap_idx on public.clientes (consultor_carregadores_sap);
