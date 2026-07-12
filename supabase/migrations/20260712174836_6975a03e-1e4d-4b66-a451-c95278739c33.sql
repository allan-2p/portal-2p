
-- 1) Enum de escopo de filtro
DO $$ BEGIN
  CREATE TYPE public.filter_scope AS ENUM ('geral', 'pre_vendas', 'carteira', 'individual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Coluna em profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS filter_scope public.filter_scope NOT NULL DEFAULT 'individual';

-- 3) Enum de equipes SF
DO $$ BEGIN
  CREATE TYPE public.sf_team AS ENUM ('pre_vendas', 'carteira');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4) Tabela de equipes SF
CREATE TABLE IF NOT EXISTS public.salesforce_team_members (
  sf_user_id text PRIMARY KEY,
  team public.sf_team NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.salesforce_team_members TO authenticated;
GRANT ALL ON public.salesforce_team_members TO service_role;

ALTER TABLE public.salesforce_team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read teams" ON public.salesforce_team_members;
CREATE POLICY "Authenticated can read teams"
  ON public.salesforce_team_members FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins manage teams" ON public.salesforce_team_members;
CREATE POLICY "Admins manage teams"
  ON public.salesforce_team_members FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_salesforce_team_members_updated_at ON public.salesforce_team_members;
CREATE TRIGGER trg_salesforce_team_members_updated_at
  BEFORE UPDATE ON public.salesforce_team_members
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
