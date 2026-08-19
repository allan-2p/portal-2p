-- 1. Microinversores
CREATE TABLE IF NOT EXISTS public.solar_microinversores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  modelo_legado integer NOT NULL,
  modulos_por_unidade integer NOT NULL DEFAULT 2,
  fixadores_por_unidade integer NOT NULL DEFAULT 1,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.solar_microinversores TO authenticated;
GRANT ALL ON public.solar_microinversores TO service_role;
ALTER TABLE public.solar_microinversores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "solar_micro_read" ON public.solar_microinversores;
CREATE POLICY "solar_micro_read" ON public.solar_microinversores FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "solar_micro_write" ON public.solar_microinversores;
CREATE POLICY "solar_micro_write" ON public.solar_microinversores FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP TRIGGER IF EXISTS touch_solar_micro ON public.solar_microinversores;
CREATE TRIGGER touch_solar_micro BEFORE UPDATE ON public.solar_microinversores
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.solar_microinversores (nome, modelo_legado, modulos_por_unidade, fixadores_por_unidade, ordem)
VALUES ('Deye',1,2,2,1),('Hoymiles',2,2,2,2),('ApSystems QT2',3,2,2,3),('ApSystems DS3D',4,1,1,4),('Enphase',5,1,1,5)
ON CONFLICT DO NOTHING;

-- 2. Códigos por comprimento nos trilhos
ALTER TABLE public.solar_trilhos
  ADD COLUMN IF NOT EXISTS cod_4800 text,
  ADD COLUMN IF NOT EXISTS cod_3600 text,
  ADD COLUMN IF NOT EXISTS cod_2400 text,
  ADD COLUMN IF NOT EXISTS cod_2700 text;

-- 3. Suportes: códigos e marcação smart
ALTER TABLE public.solar_suportes
  ADD COLUMN IF NOT EXISTS cod_extra text,
  ADD COLUMN IF NOT EXISTS cod_mini_trilho text,
  ADD COLUMN IF NOT EXISTS smart boolean NOT NULL DEFAULT false;

-- 4. Config: códigos que faltavam
ALTER TABLE public.solar_calc_config
  ADD COLUMN IF NOT EXISTS cod_kit_parafuso_smart text NOT NULL DEFAULT '100000052',
  ADD COLUMN IF NOT EXISTS cod_terminal_m8 text NOT NULL DEFAULT '2P-M8*20',
  ADD COLUMN IF NOT EXISTS cod_terminal_zmi text NOT NULL DEFAULT '2P-ZMI';

-- 5. Recadastro dos trilhos (Trilho, Smart 10, Reforçado, Zipado ativos)
UPDATE public.solar_trilhos SET ativo = false;
INSERT INTO public.solar_trilhos (legado_id, nome, familia, laje, orientacao_fixa, ativo, ordem, cod_4800, cod_3600, cod_2400, cod_2700)
VALUES
  (1,'Trilho','padrao',false,NULL,true,1,'2P-TC4800','2P-TC3600','2P-TC2400','2P-TC2700'),
  (8,'Smart 10','padrao',false,NULL,true,2,NULL,NULL,NULL,NULL),
  (2,'Reforçado','reforcado',false,NULL,true,3,'2P-TCR4800','2P-TCR3600','2P-TCR2400','2P-TCR2700'),
  (9,'Zipado','padrao',false,NULL,true,4,NULL,NULL,NULL,NULL)
ON CONFLICT DO NOTHING;
UPDATE public.solar_trilhos t SET ativo = true, ordem = v.ordem, nome = v.nome, familia = v.familia,
  cod_4800 = v.c48, cod_3600 = v.c36, cod_2400 = v.c24, cod_2700 = v.c27
FROM (VALUES
  (1,'Trilho','padrao',1,'2P-TC4800','2P-TC3600','2P-TC2400','2P-TC2700'),
  (8,'Smart 10','padrao',2,NULL,NULL,NULL,NULL),
  (2,'Reforçado','reforcado',3,'2P-TCR4800','2P-TCR3600','2P-TCR2400','2P-TCR2700'),
  (9,'Zipado','padrao',4,NULL,NULL,NULL,NULL)
) AS v(legado,nome,familia,ordem,c48,c36,c24,c27)
WHERE t.legado_id = v.legado;

-- 6. Recadastro completo dos suportes
INSERT INTO public.solar_suportes (legado_id, nome, codigo_sap, multiplo, usa_barra, ativo, ordem)
SELECT v.legado, v.nome, v.cod, v.mult, v.usa_barra, v.ativo, v.ordem
FROM (VALUES
  (1,'X - metálico','2P-XM',2,true,true,1),
  (2,'L - metálico','2P-LMET',2,true,true,2),
  (3,'Gancho','2P-GAN',2,true,true,3),
  (4,'Pris. Madeira','2P-PMABI250',2,true,true,4),
  (5,'MADEIRA30','2P-PM300',2,true,false,5),
  (6,'MADEIRA20','2P-PS200',2,true,false,6),
  (7,'Pris. Metal','2P-PSI250I',2,true,true,7),
  (8,'METAL30','2P-PS300',2,true,false,8),
  (9,'Smart 10-30',NULL,2,false,true,9),
  (10,'Smart 10-50',NULL,2,false,true,10),
  (11,'Laje','2P-SLA',1,true,true,11),
  (12,'Shingle','2P-SHLM',2,true,true,12),
  (13,'Smart 3.4.30',NULL,2,false,true,13),
  (14,'Smart 3.4.50',NULL,2,false,true,14),
  (15,'Smart 3.4.55',NULL,2,false,true,15),
  (16,'Smart 10-55',NULL,2,false,true,16),
  (17,'Zipado',NULL,2,false,true,17),
  (18,'Canalhetão','2P-CAN',2,true,true,18),
  (19,'Pris. Concreto','2P-PC',2,true,true,19),
  (20,'LAJE 10',NULL,2,false,false,20)
) AS v(legado,nome,cod,mult,usa_barra,ativo,ordem)
WHERE NOT EXISTS (SELECT 1 FROM public.solar_suportes s WHERE s.legado_id = v.legado);

UPDATE public.solar_suportes s SET nome = v.nome, codigo_sap = v.cod, multiplo = v.mult,
  usa_barra = v.usa_barra, ativo = v.ativo, ordem = v.ordem,
  smart = (v.legado IN (9,10,13,14,15,16,17,20)),
  cod_mini_trilho = CASE WHEN v.legado IN (9,10,13,14,15,16,17,20) THEN '2P-MTL' ELSE NULL END,
  cod_extra = CASE WHEN v.legado IN (4,19) THEN '2P-LPM10' WHEN v.legado = 7 THEN '2P-PSI250+LPM10-45' ELSE NULL END
FROM (VALUES
  (1,'X - metálico','2P-XM',2,true,true,1),
  (2,'L - metálico','2P-LMET',2,true,true,2),
  (3,'Gancho','2P-GAN',2,true,true,3),
  (4,'Pris. Madeira','2P-PMABI250',2,true,true,4),
  (5,'MADEIRA30','2P-PM300',2,true,false,5),
  (6,'MADEIRA20','2P-PS200',2,true,false,6),
  (7,'Pris. Metal','2P-PSI250I',2,true,true,7),
  (8,'METAL30','2P-PS300',2,true,false,8),
  (9,'Smart 10-30',NULL,2,false,true,9),
  (10,'Smart 10-50',NULL,2,false,true,10),
  (11,'Laje','2P-SLA',1,true,true,11),
  (12,'Shingle','2P-SHLM',2,true,true,12),
  (13,'Smart 3.4.30',NULL,2,false,true,13),
  (14,'Smart 3.4.50',NULL,2,false,true,14),
  (15,'Smart 3.4.55',NULL,2,false,true,15),
  (16,'Smart 10-55',NULL,2,false,true,16),
  (17,'Zipado',NULL,2,false,true,17),
  (18,'Canalhetão','2P-CAN',2,true,true,18),
  (19,'Pris. Concreto','2P-PC',2,true,true,19),
  (20,'LAJE 10',NULL,2,false,false,20)
) AS v(legado,nome,cod,mult,usa_barra,ativo,ordem)
WHERE s.legado_id = v.legado;

-- 7. Vínculos trilho -> suportes
DELETE FROM public.solar_trilho_suportes;
INSERT INTO public.solar_trilho_suportes (trilho_id, suporte_id)
SELECT t.id, s.id FROM public.solar_trilhos t, public.solar_suportes s
WHERE t.ativo AND s.ativo
  AND ((t.legado_id IN (1,2) AND s.smart = false)
    OR (t.legado_id = 8 AND s.nome LIKE 'Smart%')
    OR (t.legado_id = 9 AND s.nome = 'Zipado'))
ON CONFLICT DO NOTHING;

-- 8. Tipos de gerador
UPDATE public.solar_geradores SET ativo = false;
INSERT INTO public.solar_geradores (legado_id, nome, exige_microinversor, oculta_microinversor, ativo, ordem)
SELECT v.legado, v.nome, v.exige, v.oculta, true, v.ordem
FROM (VALUES (1,'Microinversor',true,false,1),(2,'Otimizador',false,false,2),(3,'String',false,true,3))
  AS v(legado,nome,exige,oculta,ordem)
WHERE NOT EXISTS (SELECT 1 FROM public.solar_geradores g WHERE g.legado_id = v.legado);
UPDATE public.solar_geradores g SET nome = v.nome, exige_microinversor = v.exige,
  oculta_microinversor = v.oculta, ativo = true, ordem = v.ordem
FROM (VALUES (1,'Microinversor',true,false,1),(2,'Otimizador',false,false,2),(3,'String',false,true,3))
  AS v(legado,nome,exige,oculta,ordem)
WHERE g.legado_id = v.legado;