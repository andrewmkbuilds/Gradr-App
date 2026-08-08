CREATE POLICY "Users read own interview report files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'interview-reports' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users upload own interview report files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'interview-reports' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users update own interview report files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'interview-reports' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users delete own interview report files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'interview-reports' AND (storage.foldername(name))[1] = auth.uid()::text);