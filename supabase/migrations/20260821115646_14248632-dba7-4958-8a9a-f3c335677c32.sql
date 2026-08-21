ALTER TABLE public.solar_calc_config
  ADD COLUMN IF NOT EXISTS cod_terminal_zmil text;

UPDATE public.solar_calc_config
   SET cod_terminal_zmil = COALESCE(cod_terminal_zmil, '2P-ZMIL')
 WHERE id = 1;