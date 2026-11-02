CREATE TABLE IF NOT EXISTS public.report_access (
  doctor_id text NOT NULL,
  patient_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (doctor_id, patient_id)
);
GRANT SELECT ON public.report_access TO authenticated;
GRANT ALL ON public.report_access TO service_role;
ALTER TABLE public.report_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "report access read own" ON public.report_access FOR SELECT TO authenticated USING (doctor_id = auth.uid()::text);

CREATE OR REPLACE FUNCTION public.has_report_access(patient text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.report_access r WHERE r.doctor_id = auth.uid()::text AND r.patient_id = patient AND r.expires_at > now())
$$;

CREATE OR REPLACE FUNCTION public.unlock_patient_reports(patient text, pin text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
declare h text;
begin
  if auth.uid() is null then return false; end if;
  if not exists (select 1 from public.appointments a where a.patient_id = patient and a.doctor_id = auth.uid()::text) then return false; end if;
  select pin_hash into h from public.report_pins where patient_id = patient;
  if h is null or h <> crypt(pin, h) then return false; end if;
  insert into public.report_access (doctor_id, patient_id, expires_at) values (auth.uid()::text, patient, now() + interval '12 hours')
  on conflict (doctor_id, patient_id) do update set expires_at = excluded.expires_at;
  return true;
end $$;
REVOKE ALL ON FUNCTION public.has_report_access(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.unlock_patient_reports(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.has_report_access(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_patient_reports(text, text) TO authenticated;

DROP POLICY IF EXISTS "consultations read" ON public.consultations;
CREATE POLICY "consultations read" ON public.consultations FOR SELECT TO authenticated USING (
  patient_id = auth.uid()::text OR doctor_id = auth.uid()::text OR public.is_admin() OR public.has_report_access(patient_id));

DROP POLICY IF EXISTS "docs read" ON storage.objects;
CREATE POLICY "docs read" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'documents' AND (public.is_admin() OR EXISTS (SELECT 1 FROM public.appointments a
    WHERE a.id = (storage.foldername(name))[1] AND (auth.uid()::text IN (a.patient_id, a.doctor_id) OR public.has_report_access(a.patient_id)))));