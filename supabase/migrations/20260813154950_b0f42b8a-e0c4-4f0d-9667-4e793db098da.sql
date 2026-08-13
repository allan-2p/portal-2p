CREATE TABLE IF NOT EXISTS public.cpo_clientes_im_legado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  razao_social text,
  doc text,
  im text NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cpo_clientes_im_legado TO authenticated;
GRANT ALL ON public.cpo_clientes_im_legado TO service_role;

ALTER TABLE public.cpo_clientes_im_legado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read legacy im archive"
ON public.cpo_clientes_im_legado
FOR SELECT
TO authenticated
USING (public.is_admin());

INSERT INTO public.cpo_clientes_im_legado (cliente_id, razao_social, doc, im)
SELECT c.id, c.razao_social, c.doc, btrim(c.im)
FROM public.cpo_clientes c
WHERE c.im IS NOT NULL AND btrim(c.im) <> '';

ALTER TABLE public.cpo_clientes DROP COLUMN IF EXISTS im;