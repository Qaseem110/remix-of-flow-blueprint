CREATE TABLE public.call_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id text NOT NULL,
  uploader_id text NOT NULL DEFAULT (auth.uid())::text,
  role text NOT NULL DEFAULT 'patient',
  path text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.call_recordings TO authenticated;
GRANT ALL ON public.call_recordings TO service_role;
ALTER TABLE public.call_recordings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recordings insert own" ON public.call_recordings FOR INSERT TO authenticated
  WITH CHECK (uploader_id = (auth.uid())::text AND EXISTS (SELECT 1 FROM public.appointments a WHERE a.id = appointment_id AND (a.patient_id = (auth.uid())::text OR a.doctor_id = (auth.uid())::text)));
CREATE POLICY "recordings admin read" ON public.call_recordings FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "recordings upload own folder" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'recordings' AND (storage.foldername(name))[1] = (auth.uid())::text);
CREATE POLICY "recordings admin read files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'recordings' AND public.is_admin());