CREATE TABLE public.pharmacies (id text PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE, data jsonb NOT NULL DEFAULT '{}'::jsonb);
GRANT SELECT ON public.pharmacies TO anon;
GRANT SELECT, INSERT, UPDATE ON public.pharmacies TO authenticated;
GRANT ALL ON public.pharmacies TO service_role;
ALTER TABLE public.pharmacies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pharmacies read" ON public.pharmacies FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "pharmacies insert" ON public.pharmacies FOR INSERT TO authenticated WITH CHECK (id = auth.uid()::text OR public.is_admin());
CREATE POLICY "pharmacies update" ON public.pharmacies FOR UPDATE TO authenticated USING (id = auth.uid()::text OR public.is_admin());

CREATE TABLE public.medicines (id text PRIMARY KEY, pharmacy_id text NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE, data jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE INDEX medicines_pharmacy_idx ON public.medicines(pharmacy_id);
GRANT SELECT ON public.medicines TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.medicines TO authenticated;
GRANT ALL ON public.medicines TO service_role;
ALTER TABLE public.medicines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "medicines read" ON public.medicines FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "medicines insert" ON public.medicines FOR INSERT TO authenticated WITH CHECK (pharmacy_id = auth.uid()::text);
CREATE POLICY "medicines update" ON public.medicines FOR UPDATE TO authenticated USING (pharmacy_id = auth.uid()::text OR public.is_admin());
CREATE POLICY "medicines delete" ON public.medicines FOR DELETE TO authenticated USING (pharmacy_id = auth.uid()::text OR public.is_admin());

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}');
  r text := case when m->>'role' in ('doctor','pharmacy') then m->>'role' else 'patient' end;
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
  else
    insert into public.patients (id, data) values (uid, coalesce(m->'profile', '{}') || jsonb_build_object('userId', uid));
  end if;
  return new;
end $function$;