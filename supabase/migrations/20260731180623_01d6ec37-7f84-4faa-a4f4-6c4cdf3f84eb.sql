
CREATE POLICY "top20 read authenticated" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'top20');
CREATE POLICY "top20 insert admin" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'top20' AND private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "top20 update admin" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'top20' AND private.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (bucket_id = 'top20' AND private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "top20 delete admin" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'top20' AND private.has_role(auth.uid(), 'admin'::app_role));
