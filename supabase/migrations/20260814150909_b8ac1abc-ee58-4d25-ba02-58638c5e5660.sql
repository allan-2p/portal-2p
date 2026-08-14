CREATE TABLE IF NOT EXISTS public.produtos (
  codigo text PRIMARY KEY,
  descricao text NOT NULL DEFAULT '',
  unidade text,
  ncm text,
  tipo text,
  permissao text NOT NULL DEFAULT 'Todos',
  lista_preco text,
  grp_mercadorias text,
  custo numeric NOT NULL DEFAULT 0,
  preco_venda numeric NOT NULL DEFAULT 0,
  visibilidade text NOT NULL DEFAULT 'solar',
  no_catalogo boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  origem text NOT NULL DEFAULT 'sap',
  sap_raw jsonb,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.produtos TO authenticated;
GRANT ALL ON public.produtos TO service_role;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "produtos leitura interna" ON public.produtos FOR SELECT TO authenticated USING (true);
CREATE TRIGGER produtos_touch BEFORE UPDATE ON public.produtos FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX IF NOT EXISTS idx_produtos_visibilidade ON public.produtos (visibilidade);

CREATE TABLE IF NOT EXISTS public.estoque (
  material text PRIMARY KEY,
  centro text NOT NULL DEFAULT '9802',
  descricao text,
  ean text,
  ncm text,
  cmm numeric NOT NULL DEFAULT 0,
  preco_venda numeric NOT NULL DEFAULT 0,
  valor_estoque numeric NOT NULL DEFAULT 0,
  grp_mercadorias text,
  tipo_material text,
  umb text,
  est_livre numeric NOT NULL DEFAULT 0,
  est_bloqueado numeric NOT NULL DEFAULT 0,
  qtd_pend_faturar numeric NOT NULL DEFAULT 0,
  est_entreposto numeric NOT NULL DEFAULT 0,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.estoque TO authenticated;
GRANT ALL ON public.estoque TO service_role;
ALTER TABLE public.estoque ENABLE ROW LEVEL SECURITY;
CREATE POLICY "estoque leitura interna" ON public.estoque FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.containers (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_container text NOT NULL,
  material text NOT NULL,
  est_entreposto numeric NOT NULL DEFAULT 0,
  supplier text,
  dt_remessa text,
  g_weight_total numeric NOT NULL DEFAULT 0,
  n_weight_total numeric NOT NULL DEFAULT 0,
  g_weight_un numeric NOT NULL DEFAULT 0,
  n_weight_un numeric NOT NULL DEFAULT 0,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id_container, material)
);
GRANT SELECT ON public.containers TO authenticated;
GRANT ALL ON public.containers TO service_role;
ALTER TABLE public.containers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "containers leitura interna" ON public.containers FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_containers_material ON public.containers (material);

CREATE TABLE IF NOT EXISTS public.estoque_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  materiais_count integer NOT NULL DEFAULT 0,
  containers_count integer NOT NULL DEFAULT 0,
  ncm_aplicado integer NOT NULL DEFAULT 0,
  error_message text,
  triggered_by uuid
);
GRANT SELECT ON public.estoque_sync_runs TO authenticated;
GRANT ALL ON public.estoque_sync_runs TO service_role;
ALTER TABLE public.estoque_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "estoque runs leitura interna" ON public.estoque_sync_runs FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.check_disponibilidade(p_material text, p_qtd numeric)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
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
REVOKE ALL ON FUNCTION public.check_disponibilidade(text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_disponibilidade(text, numeric) TO authenticated, service_role;