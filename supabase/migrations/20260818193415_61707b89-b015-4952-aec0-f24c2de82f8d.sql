-- ============ Calculadora 2P (Solar) ============

CREATE TABLE public.solar_modulos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  largura integer,
  altura integer,
  espessura integer,
  personalizado boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.solar_modulos TO authenticated;
GRANT ALL ON public.solar_modulos TO service_role;
ALTER TABLE public.solar_modulos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "solar_modulos leitura" ON public.solar_modulos FOR SELECT TO authenticated USING (true);
CREATE POLICY "solar_modulos insere" ON public.solar_modulos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "solar_modulos atualiza" ON public.solar_modulos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "solar_modulos exclui (admin)" ON public.solar_modulos FOR DELETE TO authenticated USING (public.is_admin());

CREATE TABLE public.solar_geradores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legado_id integer,
  nome text NOT NULL,
  exige_microinversor boolean NOT NULL DEFAULT false,
  oculta_microinversor boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.solar_geradores TO authenticated;
GRANT ALL ON public.solar_geradores TO service_role;
ALTER TABLE public.solar_geradores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "solar_geradores leitura" ON public.solar_geradores FOR SELECT TO authenticated USING (true);
CREATE POLICY "solar_geradores insere" ON public.solar_geradores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "solar_geradores atualiza" ON public.solar_geradores FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "solar_geradores exclui (admin)" ON public.solar_geradores FOR DELETE TO authenticated USING (public.is_admin());

CREATE TABLE public.solar_trilhos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legado_id integer,
  nome text NOT NULL,
  familia text NOT NULL DEFAULT 'padrao',
  codigo_sap text,
  laje boolean NOT NULL DEFAULT false,
  orientacao_fixa text,
  suporte_fixo_legado integer,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.solar_trilhos TO authenticated;
GRANT ALL ON public.solar_trilhos TO service_role;
ALTER TABLE public.solar_trilhos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "solar_trilhos leitura" ON public.solar_trilhos FOR SELECT TO authenticated USING (true);
CREATE POLICY "solar_trilhos insere" ON public.solar_trilhos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "solar_trilhos atualiza" ON public.solar_trilhos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "solar_trilhos exclui (admin)" ON public.solar_trilhos FOR DELETE TO authenticated USING (public.is_admin());

CREATE TABLE public.solar_suportes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legado_id integer,
  nome text NOT NULL,
  codigo_sap text,
  multiplo integer NOT NULL DEFAULT 2,
  usa_barra boolean NOT NULL DEFAULT true,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.solar_suportes TO authenticated;
GRANT ALL ON public.solar_suportes TO service_role;
ALTER TABLE public.solar_suportes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "solar_suportes leitura" ON public.solar_suportes FOR SELECT TO authenticated USING (true);
CREATE POLICY "solar_suportes insere" ON public.solar_suportes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "solar_suportes atualiza" ON public.solar_suportes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "solar_suportes exclui (admin)" ON public.solar_suportes FOR DELETE TO authenticated USING (public.is_admin());

CREATE TABLE public.solar_trilho_suportes (
  trilho_id uuid NOT NULL REFERENCES public.solar_trilhos(id) ON DELETE CASCADE,
  suporte_id uuid NOT NULL REFERENCES public.solar_suportes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trilho_id, suporte_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.solar_trilho_suportes TO authenticated;
GRANT ALL ON public.solar_trilho_suportes TO service_role;
ALTER TABLE public.solar_trilho_suportes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "solar_trilho_suportes leitura" ON public.solar_trilho_suportes FOR SELECT TO authenticated USING (true);
CREATE POLICY "solar_trilho_suportes insere" ON public.solar_trilho_suportes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "solar_trilho_suportes atualiza" ON public.solar_trilho_suportes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "solar_trilho_suportes exclui" ON public.solar_trilho_suportes FOR DELETE TO authenticated USING (true);

CREATE TABLE public.solar_calc_config (
  id integer PRIMARY KEY DEFAULT 1,
  folga_paineis numeric NOT NULL DEFAULT 20,
  balanco_ponta numeric NOT NULL DEFAULT 40,
  barras_longas integer[] NOT NULL DEFAULT ARRAY[6650, 4800, 3600],
  barra_curta_padrao integer NOT NULL DEFAULT 2400,
  barra_curta_larga integer NOT NULL DEFAULT 2700,
  largura_limite integer NOT NULL DEFAULT 1200,
  altura_min integer NOT NULL DEFAULT 1500,
  largura_min integer NOT NULL DEFAULT 800,
  espessura_min integer NOT NULL DEFAULT 30,
  espessura_max integer NOT NULL DEFAULT 35,
  limite_paineis_todos_trilhos integer NOT NULL DEFAULT 50,
  cod_grampo_intermediario text NOT NULL DEFAULT '2P-G',
  cod_grampo_final text NOT NULL DEFAULT '2P-GF3035',
  cod_terminal_aterramento text NOT NULL DEFAULT '2P-GAT',
  cod_juncao text NOT NULL DEFAULT '2P-J',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT solar_calc_config_id_check CHECK (id = 1)
);
GRANT SELECT, INSERT, UPDATE ON public.solar_calc_config TO authenticated;
GRANT ALL ON public.solar_calc_config TO service_role;
ALTER TABLE public.solar_calc_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "solar_calc_config leitura" ON public.solar_calc_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "solar_calc_config insere" ON public.solar_calc_config FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "solar_calc_config atualiza" ON public.solar_calc_config FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.solar_cupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  tipos text[] NOT NULL DEFAULT ARRAY['percentual'],
  valor numeric NOT NULL DEFAULT 0,
  percentual numeric NOT NULL DEFAULT 0,
  validade date NOT NULL,
  reutilizavel boolean NOT NULL DEFAULT false,
  cliente_doc text,
  cliente_nome text,
  usos integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.solar_cupons TO authenticated;
GRANT ALL ON public.solar_cupons TO service_role;
ALTER TABLE public.solar_cupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "solar_cupons leitura" ON public.solar_cupons FOR SELECT TO authenticated USING (true);
CREATE POLICY "solar_cupons insere" ON public.solar_cupons FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "solar_cupons atualiza" ON public.solar_cupons FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "solar_cupons exclui (admin)" ON public.solar_cupons FOR DELETE TO authenticated USING (public.is_admin());

CREATE TRIGGER trg_solar_modulos_updated BEFORE UPDATE ON public.solar_modulos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_solar_geradores_updated BEFORE UPDATE ON public.solar_geradores
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_solar_trilhos_updated BEFORE UPDATE ON public.solar_trilhos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_solar_suportes_updated BEFORE UPDATE ON public.solar_suportes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_solar_cupons_updated BEFORE UPDATE ON public.solar_cupons
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ Dados iniciais ============

INSERT INTO public.solar_calc_config (id) VALUES (1);

INSERT INTO public.solar_modulos (nome, largura, altura, espessura, personalizado, ordem) VALUES
  ('570Wp - Genérico', 1134, 2278, 30, false, 1),
  ('610Wp - Genérico', 1134, 2384, 30, false, 2),
  ('700Wp - Genérico', 1303, 2384, 33, false, 3),
  ('Canadian HiKu7 645Wp', 1303, 2384, 35, false, 4),
  ('ASTROENERGY CHSM72N 585w', 1134, 2278, 30, false, 5),
  ('ERA-72HC 545W', 1134, 2279, 35, false, 6),
  ('JINKO 550W N-TYPE', 1134, 2278, 30, false, 7),
  ('OSDA ODA-144MH 580W', 1134, 2278, 30, false, 8),
  ('DAH DHM-72X10 550W', 1134, 2279, 35, false, 9),
  ('Intelbras EMSL-590M HC', 1134, 2443, 35, false, 10),
  ('JINKO TIGER PRO 72HC-TV 535W', 1134, 2274, 35, false, 11),
  ('SUNOVA SS-550-72MDH', 1134, 2279, 35, false, 12),
  ('Canadian - HiKu6 - Mono 535W', 1135, 2254, 35, false, 13),
  ('JA-Solar-550wp', 1134, 2279, 35, false, 14),
  ('Longi - LR5-72HBD-530W', 1133, 2256, 35, false, 15),
  ('Personalizado', NULL, NULL, NULL, true, 99);

INSERT INTO public.solar_geradores (legado_id, nome, exige_microinversor, oculta_microinversor, ordem) VALUES
  (1, 'Microinversor', true, false, 1),
  (2, 'Inversor string', false, false, 2),
  (3, 'Somente estrutura', false, true, 3);

INSERT INTO public.solar_trilhos (legado_id, nome, familia, laje, orientacao_fixa, suporte_fixo_legado, ordem) VALUES
  (1, 'Trilho padrão', 'padrao', false, NULL, NULL, 1),
  (2, 'Trilho reforçado', 'reforcado', false, NULL, NULL, 2),
  (3, 'Trilho para laje', 'padrao', true, NULL, NULL, 3),
  (4, 'Trilho solo', 'padrao', false, NULL, 14, 4),
  (5, 'Trilho paisagem', 'padrao', false, 'P', 13, 5),
  (6, 'Trilho light', 'light', false, NULL, NULL, 6),
  (7, 'Mini trilho', 'padrao', false, NULL, NULL, 7);

INSERT INTO public.solar_suportes (legado_id, nome, multiplo, usa_barra, ordem) VALUES
  (1,  'Suporte 1 — telha cerâmica', 2, true, 1),
  (2,  'Suporte 2 — telha cerâmica reforçado', 2, true, 2),
  (3,  'Suporte 3 — telha metálica', 2, true, 3),
  (4,  'Suporte 4 — telha metálica reforçado', 2, true, 4),
  (7,  'Suporte 7 — fibrocimento', 2, true, 5),
  (8,  'Suporte 8 — fibrocimento reforçado', 2, true, 6),
  (9,  'Suporte 9 — laje Smart', 2, false, 7),
  (10, 'Suporte 10 — laje mini trilho', 2, false, 8),
  (11, 'Suporte 11 — parafuso estrutural', 1, true, 9),
  (12, 'Suporte 12 — parafuso reforçado', 2, true, 10),
  (13, 'Suporte 13 — paisagem', 2, false, 11),
  (14, 'Suporte 14 — solo', 2, false, 12),
  (15, 'Suporte 15 — Smart 10', 2, false, 13),
  (16, 'Suporte 16 — Smart 15', 2, false, 14),
  (17, 'Suporte 17 — Smart 20', 2, false, 15),
  (18, 'Suporte 18 — telha shingle', 2, true, 16),
  (19, 'Suporte 19 — telha shingle reforçado', 2, true, 17),
  (20, 'Suporte 20 — laje mini trilho reforçado', 2, false, 18);

INSERT INTO public.solar_trilho_suportes (trilho_id, suporte_id)
SELECT t.id, s.id
FROM public.solar_trilhos t
JOIN public.solar_suportes s ON TRUE
WHERE (t.legado_id IN (1, 6) AND s.legado_id IN (1,2,3,4,7,8,11,12,18,19))
   OR (t.legado_id = 2 AND s.legado_id IN (3,4,7,8,12,19))
   OR (t.legado_id = 3 AND s.legado_id IN (9,10,20))
   OR (t.legado_id = 4 AND s.legado_id IN (14))
   OR (t.legado_id = 5 AND s.legado_id IN (13))
   OR (t.legado_id = 7 AND s.legado_id IN (15,16,17));