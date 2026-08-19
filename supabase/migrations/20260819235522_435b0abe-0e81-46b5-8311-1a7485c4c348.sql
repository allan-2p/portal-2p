-- normaliza códigos para maiúsculas quando não houver conflito
UPDATE public.solar_cupons c
SET codigo = upper(c.codigo)
WHERE c.codigo <> upper(c.codigo)
  AND NOT EXISTS (
    SELECT 1 FROM public.solar_cupons o
    WHERE o.id <> c.id AND upper(o.codigo) = upper(c.codigo)
  );

CREATE UNIQUE INDEX IF NOT EXISTS solar_cupons_codigo_upper_key
  ON public.solar_cupons (upper(codigo));