ALTER TABLE public.credito_analises
  ADD COLUMN IF NOT EXISTS contato_nome text,
  ADD COLUMN IF NOT EXISTS contato_email text,
  ADD COLUMN IF NOT EXISTS contato_telefone text,
  ADD COLUMN IF NOT EXISTS empresa_secundaria boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS empresa_secundaria_nome text,
  ADD COLUMN IF NOT EXISTS empresa_secundaria_doc text,
  ADD COLUMN IF NOT EXISTS anexos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS responsavel_analise text,
  ADD COLUMN IF NOT EXISTS autorizacao_diretoria text;

CREATE POLICY "credito_anexos_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'credito-anexos');
CREATE POLICY "credito_anexos_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'credito-anexos');
CREATE POLICY "credito_anexos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'credito-anexos');