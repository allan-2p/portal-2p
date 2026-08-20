ALTER TABLE public.solar_cupons
  ADD COLUMN IF NOT EXISTS validade_inicio date,
  ADD COLUMN IF NOT EXISTS limite_usos integer;