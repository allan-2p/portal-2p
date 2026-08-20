CREATE TABLE public.solar_cupom_usos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cupom_id uuid NOT NULL REFERENCES public.solar_cupons(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  proposta_id uuid,
  proposta_numero text,
  cliente_nome text,
  cliente_doc text,
  desconto numeric NOT NULL DEFAULT 0,
  frete_gratis boolean NOT NULL DEFAULT false,
  valor_total numeric NOT NULL DEFAULT 0,
  user_id uuid,
  user_nome text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX solar_cupom_usos_cupom_proposta_key
  ON public.solar_cupom_usos (cupom_id, proposta_id)
  WHERE proposta_id IS NOT NULL;
CREATE INDEX solar_cupom_usos_cupom_idx ON public.solar_cupom_usos (cupom_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.solar_cupom_usos TO authenticated;
GRANT ALL ON public.solar_cupom_usos TO service_role;

ALTER TABLE public.solar_cupom_usos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "solar_cupom_usos leitura escopo" ON public.solar_cupom_usos
  FOR SELECT TO authenticated
  USING (
    is_admin()
    OR auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.user_instance_access uia
      WHERE uia.user_id = auth.uid() AND uia.instance_id = 'solar'
    )
  );
CREATE POLICY "solar_cupom_usos insere" ON public.solar_cupom_usos
  FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());
CREATE POLICY "solar_cupom_usos exclui (admin)" ON public.solar_cupom_usos
  FOR DELETE TO authenticated USING (is_admin());

CREATE OR REPLACE FUNCTION public.solar_cupom_usos_sync_contador()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.solar_cupons c
     SET usos = (SELECT count(*) FROM public.solar_cupom_usos u WHERE u.cupom_id = c.id),
         updated_at = now()
   WHERE c.id = COALESCE(NEW.cupom_id, OLD.cupom_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_solar_cupom_usos_sync
AFTER INSERT OR DELETE ON public.solar_cupom_usos
FOR EACH ROW EXECUTE FUNCTION public.solar_cupom_usos_sync_contador();