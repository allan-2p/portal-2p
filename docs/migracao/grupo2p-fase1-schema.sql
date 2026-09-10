-- =====================================================================
-- Consolidação no grupo-2p — FASE 1: schema do catálogo
-- Gerado a partir do schema ATUAL do Lovable Cloud (inclui os overrides
-- ativo_override/visibilidade_override). Rodar no projeto grupo-2p
-- (npzlinbglznnnwxxcawh) ANTES de copiar os dados.
--
-- IMPORTANTE: as cópias VELHAS homônimas do grupo-2p precisam sair antes
-- (sap_produtos com 141 linhas e schema sem override). produtos/estoque/
-- containers do espelho têm a mesma estrutura e são recriados aqui.
-- As policies de RLS do Lovable NÃO vêm juntas: dependem de has_feature/
-- is_admin/auth.uid(), e o auth continua no Lovable. O portal acessa por
-- service_role (ignora RLS); o único acesso anônimo é a leitura pública
-- de `produtos` usada pelos sites.
-- =====================================================================

BEGIN;

-- 1) Reconciliação das cópias velhas -----------------------------------
DROP TABLE IF EXISTS public.carregadores_uf_rates CASCADE;
DROP TABLE IF EXISTS public.carregadores_config CASCADE;
DROP TABLE IF EXISTS public.carregadores_ncm CASCADE;
DROP TABLE IF EXISTS public.solar_cupom_usos CASCADE;
DROP TABLE IF EXISTS public.solar_cupons CASCADE;
DROP TABLE IF EXISTS public.solar_calc_config CASCADE;
DROP TABLE IF EXISTS public.solar_trilho_suportes CASCADE;
DROP TABLE IF EXISTS public.solar_suportes CASCADE;
DROP TABLE IF EXISTS public.solar_trilhos CASCADE;
DROP TABLE IF EXISTS public.solar_microinversores CASCADE;
DROP TABLE IF EXISTS public.solar_geradores CASCADE;
DROP TABLE IF EXISTS public.solar_modulos CASCADE;
DROP TABLE IF EXISTS public.produtos CASCADE;
DROP TABLE IF EXISTS public.containers CASCADE;
DROP TABLE IF EXISTS public.estoque_sync_runs CASCADE;
DROP TABLE IF EXISTS public.estoque CASCADE;
DROP TABLE IF EXISTS public.sap_produtos_sync_runs CASCADE;
DROP TABLE IF EXISTS public.sap_catalogo_sap CASCADE;
DROP TABLE IF EXISTS public.sap_produtos CASCADE;

-- 2) Função de apoio dos triggers --------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 3) Schema do catálogo (cópia fiel do Lovable) ------------------------

\restrict fSR5R1mZNpYJNSbdcadVI9dk6u182mUimewtGLvQQRrbPLhFLM6YYkD62TDLfOW

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

CREATE TABLE public.carregadores_config (
    id integer DEFAULT 1 NOT NULL,
    ipi numeric DEFAULT 0.05 NOT NULL,
    pis_cofins numeric DEFAULT 0.0925 NOT NULL,
    aliq_inter numeric DEFAULT 0.04 NOT NULL,
    majoracao_sem_ie numeric DEFAULT 0.25 NOT NULL,
    politica_mb_min numeric DEFAULT 0.33 NOT NULL,
    mb_atencao numeric DEFAULT 0.40 NOT NULL,
    comissao_base text DEFAULT 'MB'::text NOT NULL,
    comissao_pct numeric DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cmv_max numeric DEFAULT 0.605 NOT NULL,
    pct_gerente numeric DEFAULT 0.005 NOT NULL,
    pct_indicacao numeric DEFAULT 0.0025 NOT NULL,
    fator_clt numeric DEFAULT 1.66 NOT NULL,
    pct_representante numeric DEFAULT 0 NOT NULL,
    CONSTRAINT cpo_config_single CHECK ((id = 1))
);

CREATE TABLE public.carregadores_ncm (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    codigo text NOT NULL,
    descricao text NOT NULL,
    ipi numeric DEFAULT 0.05 NOT NULL,
    pis_cofins numeric DEFAULT 0.0925 NOT NULL,
    aliq_inter numeric DEFAULT 0.04 NOT NULL,
    tem_st boolean DEFAULT false NOT NULL,
    gera_difal boolean DEFAULT true NOT NULL,
    observacoes text,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.carregadores_uf_rates (
    uf text NOT NULL,
    nome text NOT NULL,
    aliq_interna numeric DEFAULT 0.18 NOT NULL,
    fcp numeric DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    convenio_st boolean DEFAULT false NOT NULL
);

CREATE TABLE public.containers (
    id bigint NOT NULL,
    id_container text NOT NULL,
    material text NOT NULL,
    est_entreposto numeric DEFAULT 0 NOT NULL,
    supplier text,
    dt_remessa text,
    g_weight_total numeric DEFAULT 0 NOT NULL,
    n_weight_total numeric DEFAULT 0 NOT NULL,
    g_weight_un numeric DEFAULT 0 NOT NULL,
    n_weight_un numeric DEFAULT 0 NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.containers ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.containers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE public.estoque (
    material text NOT NULL,
    centro text DEFAULT '9802'::text NOT NULL,
    descricao text,
    ean text,
    ncm text,
    cmm numeric DEFAULT 0 NOT NULL,
    preco_venda numeric DEFAULT 0 NOT NULL,
    valor_estoque numeric DEFAULT 0 NOT NULL,
    grp_mercadorias text,
    tipo_material text,
    umb text,
    est_livre numeric DEFAULT 0 NOT NULL,
    est_bloqueado numeric DEFAULT 0 NOT NULL,
    qtd_pend_faturar numeric DEFAULT 0 NOT NULL,
    est_entreposto numeric DEFAULT 0 NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.estoque_sync_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    status text DEFAULT 'running'::text NOT NULL,
    materiais_count integer DEFAULT 0 NOT NULL,
    containers_count integer DEFAULT 0 NOT NULL,
    ncm_aplicado integer DEFAULT 0 NOT NULL,
    error_message text,
    triggered_by uuid
);

CREATE TABLE public.produtos (
    codigo text NOT NULL,
    descricao text DEFAULT ''::text NOT NULL,
    unidade text,
    ncm text,
    tipo text,
    permissao text DEFAULT 'Todos'::text NOT NULL,
    lista_preco text,
    grp_mercadorias text,
    custo numeric DEFAULT 0 NOT NULL,
    preco_venda numeric DEFAULT 0 NOT NULL,
    visibilidade text DEFAULT 'solar'::text NOT NULL,
    no_catalogo boolean DEFAULT false NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    origem text DEFAULT 'sap'::text NOT NULL,
    sap_raw jsonb,
    last_synced_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.sap_catalogo_sap (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    codigo text NOT NULL,
    descricao text NOT NULL,
    unidade text,
    ncm_codigo text,
    no_catalogo boolean DEFAULT false NOT NULL,
    sap_raw jsonb,
    last_synced_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.sap_produtos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    codigo text NOT NULL,
    descricao text NOT NULL,
    tipo text DEFAULT 'acessorio'::text NOT NULL,
    permissao text DEFAULT 'Admin'::text NOT NULL,
    lista_preco text,
    ativo boolean DEFAULT true NOT NULL,
    sap_raw jsonb,
    last_synced_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    visibilidade text,
    custo numeric DEFAULT 0 NOT NULL,
    preco_sugerido numeric DEFAULT 0 NOT NULL,
    ncm_id uuid,
    origem text DEFAULT 'sap'::text NOT NULL,
    ncm_codigo text,
    imagem_path text,
    vendavel_sap boolean,
    listas_com_preco text,
    preco_vk12 numeric,
    preco_checado_em timestamp with time zone,
    ativo_override boolean,
    ativo_override_por uuid,
    ativo_override_em timestamp with time zone,
    ativo_override_motivo text,
    visibilidade_override text,
    visibilidade_override_por uuid,
    visibilidade_override_em timestamp with time zone,
    visibilidade_override_motivo text,
    CONSTRAINT sap_produtos_permissao_chk CHECK ((permissao = ANY (ARRAY['Todos'::text, 'Admin'::text]))),
    CONSTRAINT sap_produtos_tipo_chk CHECK ((tipo = ANY (ARRAY['trilho'::text, 'trilho_reforcado'::text, 'trilho_light'::text, 'juncao'::text, 'grampo'::text, 'smart10'::text, 'carregador_veicular'::text, 'fixadores'::text, 'acessorio'::text]))),
    CONSTRAINT sap_produtos_visibilidade_check CHECK ((visibilidade = ANY (ARRAY['solar'::text, 'carregadores'::text, 'ambos'::text]))),
    CONSTRAINT sap_produtos_visibilidade_override_check CHECK (((visibilidade_override IS NULL) OR (visibilidade_override = ANY (ARRAY['solar'::text, 'carregadores'::text, 'ambos'::text, 'nenhuma'::text]))))
);

COMMENT ON COLUMN public.sap_produtos.vendavel_sap IS 'Varredura de precos (VK12) no SAP: true = tem preco em alguma lista (vendavel).';

COMMENT ON COLUMN public.sap_produtos.ativo_override IS 'Override manual do flag ativo. NULL = segue a varredura automatica do SAP.';

CREATE TABLE public.sap_produtos_sync_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    status text DEFAULT 'running'::text NOT NULL,
    inserted_count integer DEFAULT 0 NOT NULL,
    updated_count integer DEFAULT 0 NOT NULL,
    error_message text,
    triggered_by uuid,
    CONSTRAINT sap_produtos_sync_status_chk CHECK ((status = ANY (ARRAY['running'::text, 'success'::text, 'error'::text])))
);

CREATE TABLE public.solar_calc_config (
    id integer DEFAULT 1 NOT NULL,
    folga_paineis numeric DEFAULT 20 NOT NULL,
    balanco_ponta numeric DEFAULT 40 NOT NULL,
    barras_longas integer[] DEFAULT ARRAY[6650, 4800, 3600] NOT NULL,
    barra_curta_padrao integer DEFAULT 2400 NOT NULL,
    barra_curta_larga integer DEFAULT 2700 NOT NULL,
    largura_limite integer DEFAULT 1200 NOT NULL,
    altura_min integer DEFAULT 1500 NOT NULL,
    largura_min integer DEFAULT 800 NOT NULL,
    espessura_min integer DEFAULT 30 NOT NULL,
    espessura_max integer DEFAULT 35 NOT NULL,
    limite_paineis_todos_trilhos integer DEFAULT 50 NOT NULL,
    cod_grampo_intermediario text DEFAULT '2P-G'::text NOT NULL,
    cod_grampo_final text DEFAULT '2P-GF3035'::text NOT NULL,
    cod_terminal_aterramento text DEFAULT '2P-GAT'::text NOT NULL,
    cod_juncao text DEFAULT '2P-J'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cod_kit_parafuso_smart text DEFAULT '100000052'::text NOT NULL,
    cod_terminal_m8 text DEFAULT '2P-M8*20'::text NOT NULL,
    cod_terminal_zmi text DEFAULT '2P-ZMI'::text NOT NULL,
    cod_terminal_zmil text,
    CONSTRAINT solar_calc_config_id_check CHECK ((id = 1))
);

CREATE TABLE public.solar_cupom_usos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cupom_id uuid NOT NULL,
    codigo text NOT NULL,
    proposta_id uuid,
    proposta_numero text,
    cliente_nome text,
    cliente_doc text,
    desconto numeric DEFAULT 0 NOT NULL,
    frete_gratis boolean DEFAULT false NOT NULL,
    valor_total numeric DEFAULT 0 NOT NULL,
    user_id uuid,
    user_nome text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.solar_cupons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    codigo text NOT NULL,
    tipos text[] DEFAULT ARRAY['percentual'::text] NOT NULL,
    valor numeric DEFAULT 0 NOT NULL,
    percentual numeric DEFAULT 0 NOT NULL,
    validade date NOT NULL,
    reutilizavel boolean DEFAULT false NOT NULL,
    cliente_doc text,
    cliente_nome text,
    usos integer DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    validade_inicio date,
    limite_usos integer
);

CREATE TABLE public.solar_geradores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    legado_id integer,
    nome text NOT NULL,
    exige_microinversor boolean DEFAULT false NOT NULL,
    oculta_microinversor boolean DEFAULT false NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.solar_microinversores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    modelo_legado integer NOT NULL,
    modulos_por_unidade integer DEFAULT 2 NOT NULL,
    fixadores_por_unidade integer DEFAULT 1 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.solar_modulos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    largura integer,
    altura integer,
    espessura integer,
    personalizado boolean DEFAULT false NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.solar_suportes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    legado_id integer,
    nome text NOT NULL,
    codigo_sap text,
    multiplo integer DEFAULT 2 NOT NULL,
    usa_barra boolean DEFAULT true NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cod_extra text,
    cod_mini_trilho text,
    smart boolean DEFAULT false NOT NULL
);

CREATE TABLE public.solar_trilho_suportes (
    trilho_id uuid NOT NULL,
    suporte_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.solar_trilhos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    legado_id integer,
    nome text NOT NULL,
    familia text DEFAULT 'padrao'::text NOT NULL,
    codigo_sap text,
    laje boolean DEFAULT false NOT NULL,
    orientacao_fixa text,
    suporte_fixo_legado integer,
    ativo boolean DEFAULT true NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cod_4800 text,
    cod_3600 text,
    cod_2400 text,
    cod_2700 text
);

ALTER TABLE ONLY public.containers
    ADD CONSTRAINT containers_id_container_material_key UNIQUE (id_container, material);

ALTER TABLE ONLY public.containers
    ADD CONSTRAINT containers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.carregadores_config
    ADD CONSTRAINT cpo_config_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.carregadores_ncm
    ADD CONSTRAINT cpo_ncm_codigo_key UNIQUE (codigo);

ALTER TABLE ONLY public.carregadores_ncm
    ADD CONSTRAINT cpo_ncm_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.carregadores_uf_rates
    ADD CONSTRAINT cpo_uf_rates_pkey PRIMARY KEY (uf);

ALTER TABLE ONLY public.estoque
    ADD CONSTRAINT estoque_pkey PRIMARY KEY (material);

ALTER TABLE ONLY public.estoque_sync_runs
    ADD CONSTRAINT estoque_sync_runs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.produtos
    ADD CONSTRAINT produtos_pkey PRIMARY KEY (codigo);

ALTER TABLE ONLY public.sap_catalogo_sap
    ADD CONSTRAINT sap_catalogo_sap_codigo_key UNIQUE (codigo);

ALTER TABLE ONLY public.sap_catalogo_sap
    ADD CONSTRAINT sap_catalogo_sap_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sap_produtos
    ADD CONSTRAINT sap_produtos_codigo_key UNIQUE (codigo);

ALTER TABLE ONLY public.sap_produtos
    ADD CONSTRAINT sap_produtos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sap_produtos_sync_runs
    ADD CONSTRAINT sap_produtos_sync_runs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.solar_calc_config
    ADD CONSTRAINT solar_calc_config_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.solar_cupom_usos
    ADD CONSTRAINT solar_cupom_usos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.solar_cupons
    ADD CONSTRAINT solar_cupons_codigo_key UNIQUE (codigo);

ALTER TABLE ONLY public.solar_cupons
    ADD CONSTRAINT solar_cupons_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.solar_geradores
    ADD CONSTRAINT solar_geradores_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.solar_microinversores
    ADD CONSTRAINT solar_microinversores_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.solar_modulos
    ADD CONSTRAINT solar_modulos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.solar_suportes
    ADD CONSTRAINT solar_suportes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.solar_trilho_suportes
    ADD CONSTRAINT solar_trilho_suportes_pkey PRIMARY KEY (trilho_id, suporte_id);

ALTER TABLE ONLY public.solar_trilhos
    ADD CONSTRAINT solar_trilhos_pkey PRIMARY KEY (id);

CREATE INDEX idx_containers_material ON public.containers USING btree (material);

CREATE INDEX idx_produtos_visibilidade ON public.produtos USING btree (visibilidade);

CREATE INDEX sap_catalogo_sap_descricao_idx ON public.sap_catalogo_sap USING btree (descricao);

CREATE INDEX sap_produtos_permissao_idx ON public.sap_produtos USING btree (permissao);

CREATE INDEX sap_produtos_tipo_idx ON public.sap_produtos USING btree (tipo);

CREATE INDEX sap_produtos_visibilidade_idx ON public.sap_produtos USING btree (visibilidade);

CREATE INDEX solar_cupom_usos_cupom_idx ON public.solar_cupom_usos USING btree (cupom_id, created_at DESC);

CREATE UNIQUE INDEX solar_cupom_usos_cupom_proposta_key ON public.solar_cupom_usos USING btree (cupom_id, proposta_id) WHERE (proposta_id IS NOT NULL);

CREATE UNIQUE INDEX solar_cupons_codigo_upper_key ON public.solar_cupons USING btree (upper(codigo));

CREATE UNIQUE INDEX solar_trilhos_legado_id_key ON public.solar_trilhos USING btree (legado_id) WHERE (legado_id IS NOT NULL);

CREATE TRIGGER cpo_ncm_touch BEFORE UPDATE ON public.carregadores_ncm FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER produtos_touch BEFORE UPDATE ON public.produtos FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER sap_catalogo_sap_touch BEFORE UPDATE ON public.sap_catalogo_sap FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER sap_produtos_touch BEFORE UPDATE ON public.sap_produtos FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER touch_solar_micro BEFORE UPDATE ON public.solar_microinversores FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_solar_cupom_usos_sync AFTER INSERT OR DELETE ON public.solar_cupom_usos FOR EACH ROW EXECUTE FUNCTION public.solar_cupom_usos_sync_contador();

CREATE TRIGGER trg_solar_cupons_updated BEFORE UPDATE ON public.solar_cupons FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_solar_geradores_updated BEFORE UPDATE ON public.solar_geradores FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_solar_modulos_updated BEFORE UPDATE ON public.solar_modulos FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_solar_suportes_updated BEFORE UPDATE ON public.solar_suportes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_solar_trilhos_updated BEFORE UPDATE ON public.solar_trilhos FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE ONLY public.sap_produtos
    ADD CONSTRAINT sap_produtos_ncm_id_fkey FOREIGN KEY (ncm_id) REFERENCES public.carregadores_ncm(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.solar_cupom_usos
    ADD CONSTRAINT solar_cupom_usos_cupom_id_fkey FOREIGN KEY (cupom_id) REFERENCES public.solar_cupons(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.solar_trilho_suportes
    ADD CONSTRAINT solar_trilho_suportes_suporte_id_fkey FOREIGN KEY (suporte_id) REFERENCES public.solar_suportes(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.solar_trilho_suportes
    ADD CONSTRAINT solar_trilho_suportes_trilho_id_fkey FOREIGN KEY (trilho_id) REFERENCES public.solar_trilhos(id) ON DELETE CASCADE;

ALTER TABLE public.carregadores_config ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.carregadores_ncm ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.carregadores_uf_rates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.containers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.estoque ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.estoque_sync_runs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sap_catalogo_sap ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sap_produtos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sap_produtos_sync_runs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.solar_calc_config ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.solar_cupom_usos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.solar_cupons ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.solar_geradores ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.solar_microinversores ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.solar_modulos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.solar_suportes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.solar_trilho_suportes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.solar_trilhos ENABLE ROW LEVEL SECURITY;

\unrestrict fSR5R1mZNpYJNSbdcadVI9dk6u182mUimewtGLvQQRrbPLhFLM6YYkD62TDLfOW


-- 4) RPCs de disponibilidade -------------------------------------------
CREATE OR REPLACE FUNCTION public.check_disponibilidade(p_material text, p_qtd numeric)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE
  v_imediato numeric;
  v_entreposto numeric;
  v_acc numeric;
  r record;
BEGIN
  SELECT greatest(coalesce(est_livre,0) - coalesce(qtd_pend_faturar,0), 0), coalesce(est_entreposto,0)
    INTO v_imediato, v_entreposto
    FROM public.estoque WHERE material = p_material;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'Produto sem estoque cadastrado');
  END IF;

  IF v_imediato >= p_qtd THEN
    RETURN jsonb_build_object('ok', true, 'disponivel', true, 'tipo', 'imediato', 'msg', 'Disponibilidade Imediata');
  END IF;

  IF v_imediato + v_entreposto >= p_qtd THEN
    RETURN jsonb_build_object('ok', true, 'disponivel', true, 'tipo', 'entreposto', 'msg', 'Disponível no Entreposto');
  END IF;

  v_acc := v_imediato + v_entreposto;
  FOR r IN
    SELECT dt_remessa, est_entreposto FROM public.containers
     WHERE material = p_material AND dt_remessa IS NOT NULL
     ORDER BY dt_remessa ASC
  LOOP
    v_acc := v_acc + coalesce(r.est_entreposto, 0);
    IF v_acc >= p_qtd THEN
      RETURN jsonb_build_object('ok', true, 'disponivel', false, 'tipo', 'eta', 'dt_remessa', r.dt_remessa);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'disponivel', false, 'tipo', 'indisponivel', 'msg', 'Verificar Disponibilidade');
END;
$$;

CREATE OR REPLACE FUNCTION public.reservar_estoque_pendente(p_itens jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_alterados integer := 0;
  v_count integer;
  r record;
BEGIN
  FOR r IN
    SELECT (e->>'material') AS material, COALESCE((e->>'qtd')::numeric, 0) AS qtd
    FROM jsonb_array_elements(COALESCE(p_itens, '[]'::jsonb)) e
  LOOP
    IF r.material IS NULL OR r.qtd <= 0 THEN CONTINUE; END IF;
    UPDATE public.estoque
       SET qtd_pend_faturar = COALESCE(qtd_pend_faturar, 0) + r.qtd
     WHERE material = r.material;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_alterados := v_alterados + v_count;
  END LOOP;
  RETURN v_alterados;
END;
$$;

-- 5) Grants -------------------------------------------------------------
GRANT ALL ON public.sap_produtos TO service_role;
GRANT ALL ON public.sap_catalogo_sap TO service_role;
GRANT ALL ON public.sap_produtos_sync_runs TO service_role;
GRANT ALL ON public.estoque TO service_role;
GRANT ALL ON public.estoque_sync_runs TO service_role;
GRANT ALL ON public.containers TO service_role;
GRANT ALL ON public.produtos TO service_role;
GRANT ALL ON public.solar_modulos TO service_role;
GRANT ALL ON public.solar_geradores TO service_role;
GRANT ALL ON public.solar_microinversores TO service_role;
GRANT ALL ON public.solar_trilhos TO service_role;
GRANT ALL ON public.solar_suportes TO service_role;
GRANT ALL ON public.solar_trilho_suportes TO service_role;
GRANT ALL ON public.solar_calc_config TO service_role;
GRANT ALL ON public.solar_cupons TO service_role;
GRANT ALL ON public.solar_cupom_usos TO service_role;
GRANT ALL ON public.carregadores_ncm TO service_role;
GRANT ALL ON public.carregadores_config TO service_role;
GRANT ALL ON public.carregadores_uf_rates TO service_role;
GRANT SELECT ON public.produtos TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_disponibilidade(text, numeric) TO service_role, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_estoque_pendente(jsonb) TO service_role;

-- 6) Leitura pública do catálogo (sites 2P) -----------------------------
CREATE POLICY "produtos publicos" ON public.produtos
  FOR SELECT TO anon, authenticated
  USING (ativo AND no_catalogo);

COMMIT;

-- 7) Storage: bucket `produtos` (criar pela UI/API do grupo-2p, privado)
--    As imagens são copiadas pelo script scripts/migrar-catalogo-grupo2p.mjs
--    (etapa --fotos), que usa signed URLs de origem e upload no destino.
