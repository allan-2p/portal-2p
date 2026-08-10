UPDATE public.cpo_clientes SET created_by = created_by WHERE false;
ALTER TABLE public.cpo_clientes ALTER COLUMN created_by SET DEFAULT auth.uid();
DELETE FROM public.cpo_clientes WHERE created_by IS NULL;
ALTER TABLE public.cpo_clientes ALTER COLUMN created_by SET NOT NULL;