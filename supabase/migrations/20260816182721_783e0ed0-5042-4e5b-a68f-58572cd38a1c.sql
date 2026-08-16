ALTER TABLE public.sap_produtos ADD COLUMN IF NOT EXISTS imagem_path text;

CREATE POLICY "produtos_imagens_read_authenticated"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'produtos');

CREATE POLICY "produtos_imagens_insert_admin"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'produtos' AND public.is_admin());

CREATE POLICY "produtos_imagens_update_admin"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'produtos' AND public.is_admin())
WITH CHECK (bucket_id = 'produtos' AND public.is_admin());

CREATE POLICY "produtos_imagens_delete_admin"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'produtos' AND public.is_admin());