
ALTER TABLE public.salesperson_goals
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
