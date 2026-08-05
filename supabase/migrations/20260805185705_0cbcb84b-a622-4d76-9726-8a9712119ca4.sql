CREATE TABLE public.cpo_products (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  potencia text,
  custo numeric not null default 0,
  preco_sugerido numeric not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cpo_products TO authenticated;
GRANT ALL ON public.cpo_products TO service_role;
ALTER TABLE public.cpo_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cpo_products_all" ON public.cpo_products FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.cpo_uf_rates (
  uf text primary key,
  nome text not null,
  aliq_interna numeric not null default 0.18,
  fcp numeric not null default 0,
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cpo_uf_rates TO authenticated;
GRANT ALL ON public.cpo_uf_rates TO service_role;
ALTER TABLE public.cpo_uf_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cpo_uf_rates_all" ON public.cpo_uf_rates FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.cpo_config (
  id int primary key default 1,
  ipi numeric not null default 0.05,
  pis_cofins numeric not null default 0.0925,
  aliq_inter numeric not null default 0.04,
  majoracao_sem_ie numeric not null default 0.25,
  politica_mb_min numeric not null default 0.33,
  mb_atencao numeric not null default 0.40,
  comissao_base text not null default 'MB',
  comissao_pct numeric not null default 0,
  updated_at timestamptz not null default now(),
  CONSTRAINT cpo_config_single CHECK (id = 1)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cpo_config TO authenticated;
GRANT ALL ON public.cpo_config TO service_role;
ALTER TABLE public.cpo_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cpo_config_all" ON public.cpo_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.cpo_proposals (
  id uuid primary key default gen_random_uuid(),
  numero text,
  cliente_nome text not null,
  cliente_telefone text,
  cliente_email text,
  cliente_doc text,
  cliente_ie text,
  uf text not null default 'SP',
  contribuinte boolean not null default false,
  frete_mod text not null default 'FOB',
  frete_valor numeric not null default 0,
  itens jsonb not null default '[]'::jsonb,
  totais jsonb not null default '{}'::jsonb,
  status text not null default 'Salvo',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cpo_proposals TO authenticated;
GRANT ALL ON public.cpo_proposals TO service_role;
ALTER TABLE public.cpo_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cpo_proposals_all" ON public.cpo_proposals FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.cpo_config (id) VALUES (1);

INSERT INTO public.cpo_products (nome, potencia, custo, preco_sugerido) VALUES
 ('Balanceador de Carga','7,4kW - 80kW',8000,16000),
 ('Carregador 2P AC 7,4kW','7,4kW',1250,3024),
 ('Carregador 2P CC 80kW','80kW',45000,90000);

INSERT INTO public.cpo_uf_rates (uf, nome, aliq_interna, fcp) VALUES
 ('AC','Acre',0.19,0),('AL','Alagoas',0.19,0.01),('AP','Amapá',0.18,0),('AM','Amazonas',0.20,0),
 ('BA','Bahia',0.205,0),('CE','Ceará',0.20,0),('DF','Distrito Federal',0.20,0),('ES','Espírito Santo',0.17,0),
 ('GO','Goiás',0.19,0),('MA','Maranhão',0.22,0),('MT','Mato Grosso',0.17,0),('MS','Mato Grosso do Sul',0.17,0),
 ('MG','Minas Gerais',0.18,0),('PA','Pará',0.19,0),('PB','Paraíba',0.20,0),('PR','Paraná',0.195,0),
 ('PE','Pernambuco',0.205,0),('PI','Piauí',0.21,0),('RJ','Rio de Janeiro',0.20,0.02),('RN','Rio Grande do Norte',0.18,0),
 ('RS','Rio Grande do Sul',0.17,0),('RO','Rondônia',0.195,0),('RR','Roraima',0.20,0),('SC','Santa Catarina',0.17,0),
 ('SP','São Paulo',0.18,0),('SE','Sergipe',0.19,0),('TO','Tocantins',0.20,0);