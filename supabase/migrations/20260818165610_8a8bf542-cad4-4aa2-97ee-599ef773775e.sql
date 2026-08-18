ALTER TABLE public.sap_produtos
  ADD COLUMN IF NOT EXISTS peso_bruto_kg numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cubagem_m3 numeric NOT NULL DEFAULT 0;