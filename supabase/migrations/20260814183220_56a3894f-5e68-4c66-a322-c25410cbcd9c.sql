ALTER TABLE public.cpo_proposals
  ADD COLUMN IF NOT EXISTS nome text,
  ADD COLUMN IF NOT EXISTS numero_sap text;