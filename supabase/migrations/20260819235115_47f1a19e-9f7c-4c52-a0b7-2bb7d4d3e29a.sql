DELETE FROM public.solar_trilho_suportes WHERE trilho_id IN ('20427060-7515-410d-9043-971e52a92dd3','ba8e1825-9f86-4f23-89df-d5e0279908f1');
DELETE FROM public.solar_trilhos WHERE id IN ('20427060-7515-410d-9043-971e52a92dd3','ba8e1825-9f86-4f23-89df-d5e0279908f1');
CREATE UNIQUE INDEX IF NOT EXISTS solar_trilhos_legado_id_key ON public.solar_trilhos (legado_id) WHERE legado_id IS NOT NULL;