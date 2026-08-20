CREATE POLICY "danfes_read_authenticated"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'danfes');