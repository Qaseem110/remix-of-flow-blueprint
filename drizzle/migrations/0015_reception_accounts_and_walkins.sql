ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('patient','doctor','admin','pharmacy','receptionist'));

CREATE TABLE public.receptionists (
  id text PRIMARY KEY,
  doctor_id text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.receptionists TO authenticated;
GRANT ALL ON public.receptionists TO service_role;
ALTER TABLE public.receptionists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reception read" ON public.receptionists FOR SELECT TO authenticated USING (id = auth.uid()::text OR doctor_id = auth.uid()::text OR public.is_admin());
CREATE POLICY "reception doctor update" ON public.receptionists FOR UPDATE TO authenticated USING (doctor_id = auth.uid()::text OR public.is_admin()) WITH CHECK (doctor_id = auth.uid()::text OR public.is_admin());

CREATE OR REPLACE FUNCTION public.reception_doctor() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT doctor_id FROM public.receptionists WHERE id = auth.uid()::text
$$;
CREATE OR REPLACE FUNCTION public.reception_can(_perm text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce((SELECT (data->'permissions'->>_perm)::boolean FROM public.receptionists WHERE id = auth.uid()::text), false)
$$;

DROP POLICY IF EXISTS "appointments insert" ON public.appointments;
CREATE POLICY "appointments insert" ON public.appointments FOR INSERT TO authenticated
  WITH CHECK (patient_id = auth.uid()::text OR public.is_admin() OR (doctor_id = public.reception_doctor() AND public.reception_can('book')));
DROP POLICY IF EXISTS "appointments update" ON public.appointments;
CREATE POLICY "appointments update" ON public.appointments FOR UPDATE TO authenticated
  USING (patient_id = auth.uid()::text OR doctor_id = auth.uid()::text OR public.is_admin() OR doctor_id = public.reception_doctor());

-- Messages for patients without an app account; sent over WhatsApp once it is connected.
CREATE TABLE public.message_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  body text NOT NULL,
  appointment_id text,
  status text NOT NULL DEFAULT 'pending',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
GRANT INSERT ON public.message_outbox TO authenticated;
GRANT SELECT ON public.message_outbox TO authenticated;
GRANT ALL ON public.message_outbox TO service_role;
ALTER TABLE public.message_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "outbox insert" ON public.message_outbox FOR INSERT TO authenticated WITH CHECK (status = 'pending');
CREATE POLICY "outbox admin read" ON public.message_outbox FOR SELECT TO authenticated USING (public.is_admin());

-- Reception accounts are created by the server only (role set in app metadata, which users cannot change).
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}');
  r text := case when coalesce(new.raw_app_meta_data->>'role','') = 'receptionist' then 'receptionist' when m->>'role' in ('doctor','pharmacy') then m->>'role' else 'patient' end;
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
  elsif r = 'receptionist' then
    null;
  else
    insert into public.patients (id, data) values (uid, coalesce(m->'profile', '{}') || jsonb_build_object('userId', uid));
  end if;
  return new;
end $$;