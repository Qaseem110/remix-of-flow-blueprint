ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role = ANY (ARRAY['patient','doctor','admin','pharmacy','receptionist','lab']));

CREATE TABLE IF NOT EXISTS public.labs (
  id text PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.labs TO anon;
GRANT SELECT, INSERT, UPDATE ON public.labs TO authenticated;
GRANT ALL ON public.labs TO service_role;
ALTER TABLE public.labs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "labs read" ON public.labs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "labs insert" ON public.labs FOR INSERT TO authenticated WITH CHECK (id = auth.uid()::text OR public.is_admin());
CREATE POLICY "labs update" ON public.labs FOR UPDATE TO authenticated USING (id = auth.uid()::text OR public.is_admin());

CREATE TABLE IF NOT EXISTS public.lab_orders (
  id text PRIMARY KEY,
  lab_id text NOT NULL REFERENCES public.labs(id),
  patient_id text NOT NULL,
  doctor_id text NOT NULL,
  appointment_id text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.lab_orders TO authenticated;
GRANT ALL ON public.lab_orders TO service_role;
ALTER TABLE public.lab_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lab orders read" ON public.lab_orders FOR SELECT TO authenticated
  USING (lab_id = auth.uid()::text OR patient_id = auth.uid()::text OR doctor_id = auth.uid()::text OR public.is_admin() OR public.has_report_access(patient_id));
-- A lab order always needs a doctor's prescription: either the doctor orders it, or the patient books against a prescription from their own consultation.
CREATE POLICY "lab orders insert" ON public.lab_orders FOR INSERT TO authenticated WITH CHECK (
  (doctor_id = auth.uid()::text AND EXISTS (SELECT 1 FROM public.appointments a WHERE a.id = appointment_id AND a.doctor_id = auth.uid()::text AND a.patient_id = lab_orders.patient_id))
  OR (patient_id = auth.uid()::text AND EXISTS (SELECT 1 FROM public.consultations c WHERE c.id = appointment_id AND c.patient_id = auth.uid()::text AND c.doctor_id = lab_orders.doctor_id
      AND (jsonb_array_length(coalesce(c.data->'prescription','[]'::jsonb)) > 0 OR coalesce(c.data->>'labTests','') <> '')))
);
CREATE POLICY "lab orders update" ON public.lab_orders FOR UPDATE TO authenticated
  USING (lab_id = auth.uid()::text OR patient_id = auth.uid()::text OR public.is_admin());

-- Uploaded lab results can never be removed, and only the lab may add them.
CREATE OR REPLACE FUNCTION public.guard_lab_order() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare old_ids text[]; new_ids text[];
begin
  if new.lab_id <> old.lab_id or new.patient_id <> old.patient_id or new.doctor_id <> old.doctor_id or new.appointment_id <> old.appointment_id then
    raise exception 'Lab order details cannot be changed';
  end if;
  select coalesce(array_agg(d->>'id'), '{}') into old_ids from jsonb_array_elements(coalesce(old.data->'documents','[]'::jsonb)) d;
  select coalesce(array_agg(d->>'id'), '{}') into new_ids from jsonb_array_elements(coalesce(new.data->'documents','[]'::jsonb)) d;
  if not (old_ids <@ new_ids) then raise exception 'Lab reports cannot be deleted'; end if;
  if auth.uid() is not null and auth.uid()::text <> old.lab_id and not public.is_admin() then
    if new_ids <> old_ids then raise exception 'Only the laboratory can upload reports'; end if;
    if coalesce(new.data->>'status','') <> coalesce(old.data->>'status','') and new.data->>'status' <> 'Cancelled' then raise exception 'Not allowed'; end if;
  end if;
  return new;
end $$;
DROP TRIGGER IF EXISTS guard_lab_order ON public.lab_orders;
CREATE TRIGGER guard_lab_order BEFORE UPDATE ON public.lab_orders FOR EACH ROW EXECUTE FUNCTION public.guard_lab_order();

CREATE POLICY "lab results upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'documents' AND (storage.foldername(name))[1] = 'lab'
  AND EXISTS (SELECT 1 FROM public.lab_orders o WHERE o.id = (storage.foldername(name))[2] AND o.lab_id = auth.uid()::text)
);
CREATE POLICY "lab results read" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'documents' AND (storage.foldername(name))[1] = 'lab'
  AND EXISTS (SELECT 1 FROM public.lab_orders o WHERE o.id = (storage.foldername(name))[2]
    AND (o.lab_id = auth.uid()::text OR o.patient_id = auth.uid()::text OR o.doctor_id = auth.uid()::text OR public.is_admin() OR public.has_report_access(o.patient_id)))
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}');
  r text := case when coalesce(new.raw_app_meta_data->>'role','') = 'receptionist' then 'receptionist' when m->>'role' in ('doctor','pharmacy','lab') then m->>'role' else 'patient' end;
  verify boolean := coalesce((select (data->>'doctorVerification')::boolean from public.settings where id = 'global'), true);
  uid text := new.id::text;
begin
  insert into public.profiles (id, role, data) values (uid, r, jsonb_build_object(
    'id', uid, 'role', r, 'name', coalesce(m->>'name', ''), 'email', new.email, 'phone', coalesce(m->>'phone', ''),
    'active', true, 'createdAt', now()));
  if r = 'doctor' then
    insert into public.doctors (id, data) values (uid, coalesce(m->'profile', '{}') || jsonb_build_object(
      'userId', uid, 'experience', 0, 'fee', 0, 'languages', '[]'::jsonb, 'about', '', 'services', '[]'::jsonb,
      'verification', case when verify then 'Pending Verification' else 'Approved' end));
    insert into public.availability (id, data) values (uid, jsonb_build_object('doctorId', uid, 'days', '[0,1,2,3,4]'::jsonb,
      'start', '09:00', 'end', '17:00', 'duration', 30, 'blocked', '[]'::jsonb, 'blockedDays', '[]'::jsonb));
    insert into public.notifications (id, user_id, data)
      select 'N-' || substr(md5(random()::text || p.id), 1, 10), p.id, jsonb_build_object('id', 'N-' || substr(md5(random()::text), 1, 10),
        'userId', p.id, 'title', 'New doctor registration', 'body', coalesce(m->>'name','A doctor') || ' is awaiting verification.',
        'at', now(), 'read', false, 'link', '/admin')
      from public.profiles p where p.role = 'admin';
  elsif r = 'pharmacy' then
    insert into public.pharmacies (id, data) values (uid, coalesce(m->'profile', '{}') || jsonb_build_object('userId', uid, 'phone', coalesce(m->>'phone', '')));
  elsif r = 'lab' then
    insert into public.labs (id, data) values (uid, coalesce(m->'profile', '{}') || jsonb_build_object('userId', uid, 'phone', coalesce(m->>'phone', '')));
  elsif r = 'receptionist' then
    null;
  else
    insert into public.patients (id, data) values (uid, coalesce(m->'profile', '{}') || jsonb_build_object('userId', uid));
  end if;
  return new;
end $function$;