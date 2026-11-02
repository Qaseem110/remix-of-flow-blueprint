-- Sahoolat: extra setup to remove current limits. Run AFTER schema.sql.

-- 1) File uploads stored on the server (private bucket, max 10 MB, PDF/JPG/PNG)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do nothing;
-- Files are saved as  <appointment-id>/<file-name>; only that appointment's patient, doctor or an admin can access them.
create policy "docs read" on storage.objects for select to authenticated using (
  bucket_id = 'documents' and (public.is_admin() or exists (select 1 from public.appointments a
    where a.id = (storage.foldername(name))[1] and auth.uid()::text in (a.patient_id, a.doctor_id))));
create policy "docs upload" on storage.objects for insert to authenticated with check (
  bucket_id = 'documents' and (public.is_admin() or exists (select 1 from public.appointments a
    where a.id = (storage.foldername(name))[1] and auth.uid()::text in (a.patient_id, a.doctor_id))));

-- 2) Doctor private notes in their own table that patients can never read
create table if not exists public.private_notes (id text primary key, doctor_id text not null, notes text not null default '');
grant select, insert, update on public.private_notes to authenticated;
grant all on public.private_notes to service_role;
alter table public.private_notes enable row level security;
create policy "notes read" on public.private_notes for select to authenticated using (doctor_id = auth.uid()::text or public.is_admin());
create policy "notes insert" on public.private_notes for insert to authenticated with check (doctor_id = auth.uid()::text);
create policy "notes update" on public.private_notes for update to authenticated using (doctor_id = auth.uid()::text);
-- Move any private notes out of the patient-visible record automatically
create or replace function public.split_private_notes() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.data->>'privateNotes', '') <> '' then
    insert into public.private_notes (id, doctor_id, notes) values (new.id, new.doctor_id, new.data->>'privateNotes')
    on conflict (id) do update set notes = excluded.notes;
  end if;
  new.data := new.data - 'privateNotes';
  return new;
end $$;
drop trigger if exists split_private_notes on public.consultations;
create trigger split_private_notes before insert or update on public.consultations for each row execute function public.split_private_notes();
update public.consultations set data = data;  -- move notes already saved

-- 3) Queue numbers re-ordered by time on the server whenever a booking changes
create or replace function public.renumber_queue() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return null; end if;
  update public.appointments a set data = jsonb_set(a.data, '{queueNumber}', to_jsonb(q.n))
  from (select id, row_number() over (order by data->>'time') as n from public.appointments
        where doctor_id = new.doctor_id and data->>'date' = new.data->>'date'
          and data->>'status' not in ('Cancelled','Rescheduled')) q
  where a.id = q.id and (a.data->>'queueNumber')::int is distinct from q.n;
  return null;
end $$;
drop trigger if exists renumber_queue on public.appointments;
create trigger renumber_queue after insert or update on public.appointments for each row execute function public.renumber_queue();

-- 4) Block double-booking of the same doctor slot
create unique index if not exists one_booking_per_slot on public.appointments (doctor_id, (data->>'date'), (data->>'time'))
  where data->>'status' not in ('Cancelled','Rescheduled','No Show');

-- 5) Clinic check-in kiosk without signing in (by appointment ID or phone, today only)
create or replace function public.kiosk_check_in(method text, value text) returns text
language plpgsql security definer set search_path = public as $$
declare a record; s jsonb;
begin
  select data into s from public.settings where id = 'global';
  if not coalesce((s->'checkInMethods'->>method)::boolean, false) then raise exception 'This check-in method is disabled'; end if;
  if method = 'appointmentId' then
    select * into a from public.appointments where upper(id) = upper(trim(value));
  else
    select ap.* into a from public.appointments ap join public.profiles p on p.id = ap.patient_id
    where replace(p.data->>'phone',' ','') = replace(value,' ','') and ap.data->>'date' = to_char(now(),'YYYY-MM-DD')
      and ap.data->>'type' = 'clinic' and ap.data->>'status' = 'Confirmed' order by ap.data->>'time' limit 1;
  end if;
  if a is null then raise exception 'No matching appointment found'; end if;
  if a.data->>'type' <> 'clinic' then raise exception 'Online appointments don''t require check-in'; end if;
  if a.data->>'date' <> to_char(now(),'YYYY-MM-DD') then raise exception 'Check-in is only available on the appointment day'; end if;
  if a.data->>'status' <> 'Confirmed' then raise exception 'Cannot check in — status is %', a.data->>'status'; end if;
  update public.appointments set data = data || jsonb_build_object('status','Checked-In','checkedInAt', now()) where id = a.id;
  return a.id;
end $$;
grant execute on function public.kiosk_check_in(text, text) to anon, authenticated;

-- 6) Instant updates on other devices (queue, notifications)
alter publication supabase_realtime add table public.appointments, public.notifications, public.consultations, public.availability;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE TABLE public.report_pins (patient_id text PRIMARY KEY, pin_hash text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.report_pins TO service_role;
ALTER TABLE public.report_pins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_report_pin(pin text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if pin !~ '^\d{4,6}$' then raise exception 'PIN must be 4-6 digits'; end if;
  insert into public.report_pins (patient_id, pin_hash) values (auth.uid()::text, crypt(pin, gen_salt('bf')))
  on conflict (patient_id) do update set pin_hash = excluded.pin_hash, updated_at = now();
end $$;

CREATE OR REPLACE FUNCTION public.has_report_pin(patient text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (select 1 from public.report_pins where patient_id = patient);
$$;

CREATE OR REPLACE FUNCTION public.verify_report_pin(patient text, pin text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
declare h text;
begin
  if auth.uid() is null then return false; end if;
  select pin_hash into h from public.report_pins where patient_id = patient;
  if h is null then return false; end if;
  return h = crypt(pin, h);
end $$;

REVOKE ALL ON FUNCTION public.set_report_pin(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.has_report_pin(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.verify_report_pin(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_report_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_report_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_report_pin(text, text) TO authenticated;CREATE TABLE public.pharmacies (id text PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE, data jsonb NOT NULL DEFAULT '{}'::jsonb);
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
end $function$;ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('patient','doctor','admin','pharmacy'));
-- PIN unlock: doctor gets 12h access to all the patient's reports
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