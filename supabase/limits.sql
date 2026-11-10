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

-- 4) Shared slot times are allowed (group consultations); queue numbers stay unique via allocation
drop index if exists public.one_booking_per_slot;

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
    WHERE a.id = (storage.foldername(name))[1] AND (auth.uid()::text IN (a.patient_id, a.doctor_id) OR public.has_report_access(a.patient_id)))));CREATE OR REPLACE FUNCTION public.renumber_queue() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
CREATE OR REPLACE FUNCTION public.validate_daily_capacity() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE start_min int; end_min int; cap int;
BEGIN
 start_min := split_part(new.data->>'start', ':', 1)::int * 60 + split_part(new.data->>'start', ':', 2)::int;
 end_min := split_part(new.data->>'end', ':', 1)::int * 60 + split_part(new.data->>'end', ':', 2)::int;
 cap := coalesce((new.data->>'dailyLimit')::int, greatest(1, (end_min-start_min)/greatest(1,(new.data->>'duration')::int)));
 IF cap < 1 OR end_min <= start_min OR cap > end_min-start_min THEN RAISE EXCEPTION 'Daily limit must be a positive whole number within your working minutes'; END IF;
 RETURN new;
END $$;
CREATE TRIGGER validate_daily_capacity BEFORE INSERT OR UPDATE ON public.availability FOR EACH ROW EXECUTE FUNCTION public.validate_daily_capacity();
CREATE OR REPLACE FUNCTION public.allocate_daily_booking() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE av jsonb; day date; cap int; start_min int; end_min int; step_min int; candidate text; used int; q int; chosen text; original public.appointments%ROWTYPE;
BEGIN
 IF TG_OP = 'UPDATE' THEN
  IF new.doctor_id IS DISTINCT FROM old.doctor_id OR new.patient_id IS DISTINCT FROM old.patient_id OR new.data->>'date' IS DISTINCT FROM old.data->>'date' OR new.data->>'time' IS DISTINCT FROM old.data->>'time' OR new.data->>'queueNumber' IS DISTINCT FROM old.data->>'queueNumber' THEN RAISE EXCEPTION 'Appointment date, time and queue are system assigned; reschedule instead'; END IF;
  RETURN new;
 END IF;
 -- Lock the doctor's availability row so bookings across devices are allocated sequentially.
 SELECT data INTO av FROM public.availability WHERE id = new.doctor_id FOR UPDATE;
 IF av IS NULL THEN RAISE EXCEPTION 'Doctor has no working hours'; END IF;
 day := (new.data->>'date')::date;
 IF NOT (av->'days' @> to_jsonb(extract(dow from day)::int)) OR coalesce(av->'blockedDays','[]'::jsonb) ? day::text THEN RAISE EXCEPTION 'Doctor is unavailable on this day'; END IF;
 IF coalesce(new.data->>'rescheduledFrom','') <> '' THEN
  SELECT * INTO original FROM public.appointments WHERE id = new.data->>'rescheduledFrom' FOR UPDATE;
  IF original.id IS NULL OR original.patient_id <> new.patient_id OR original.doctor_id <> new.doctor_id OR original.data->>'status' NOT IN ('Confirmed','Pending','Waiting') OR (auth.uid() IS NOT NULL AND auth.uid()::text NOT IN (original.patient_id,original.doctor_id) AND NOT public.is_admin()) THEN RAISE EXCEPTION 'Cannot reschedule this appointment'; END IF;
  UPDATE public.appointments SET data = data || jsonb_build_object('status','Rescheduled','rescheduledTo',new.id) WHERE id = original.id;
 END IF;
 start_min := split_part(av->>'start', ':', 1)::int * 60 + split_part(av->>'start', ':', 2)::int;
 end_min := split_part(av->>'end', ':', 1)::int * 60 + split_part(av->>'end', ':', 2)::int;
 cap := coalesce((av->>'dailyLimit')::int, greatest(1,(end_min-start_min)/greatest(1,(av->>'duration')::int)));
 step_min := greatest(1,(end_min-start_min)/cap);
 SELECT count(*) INTO used FROM public.appointments WHERE doctor_id=new.doctor_id AND data->>'date'=day::text AND data->>'status' NOT IN ('Cancelled','Rescheduled');
 IF used >= cap THEN RAISE EXCEPTION 'Daily patient limit reached. Choose another date.'; END IF;
 FOR i IN 0..cap-1 LOOP
  candidate := lpad(((start_min+i*step_min)/60)::text,2,'0') || ':' || lpad(((start_min+i*step_min)%60)::text,2,'0');
  IF NOT (coalesce(av->'blocked','[]'::jsonb) ? (day::text || ' ' || candidate)) AND (day::timestamp + candidate::time) AT TIME ZONE 'Africa/Tripoli' > now() AND NOT EXISTS (SELECT 1 FROM public.appointments WHERE doctor_id=new.doctor_id AND data->>'date'=day::text AND data->>'time'=candidate AND data->>'status' NOT IN ('Cancelled','Rescheduled')) THEN chosen := candidate; EXIT; END IF;
 END LOOP;
 IF chosen IS NULL THEN RAISE EXCEPTION 'No places available on this day. Choose another date.'; END IF;
 SELECT coalesce(max((data->>'queueNumber')::int),0)+1 INTO q FROM public.appointments WHERE doctor_id=new.doctor_id AND data->>'date'=day::text;
 new.data := new.data || jsonb_build_object('id',new.id,'doctorId',new.doctor_id,'patientId',new.patient_id,'time',chosen,'queueNumber',q,'status','Confirmed');
 RETURN new;
END $$;
CREATE TRIGGER allocate_daily_booking BEFORE INSERT OR UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.allocate_daily_booking();CREATE OR REPLACE FUNCTION public.allocate_daily_booking() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE av jsonb; day date; cap int; start_min int; end_min int; step_min int; candidate text; used int; q int; chosen text; original public.appointments%ROWTYPE;
BEGIN
 IF TG_OP = 'UPDATE' THEN
  IF new.doctor_id IS DISTINCT FROM old.doctor_id OR new.patient_id IS DISTINCT FROM old.patient_id OR new.data->>'date' IS DISTINCT FROM old.data->>'date' OR new.data->>'time' IS DISTINCT FROM old.data->>'time' OR new.data->>'queueNumber' IS DISTINCT FROM old.data->>'queueNumber' THEN RAISE EXCEPTION 'Appointment date, time and queue are system assigned; reschedule instead'; END IF;
  RETURN new;
 END IF;
 SELECT data INTO av FROM public.availability WHERE id = new.doctor_id FOR UPDATE;
 IF av IS NULL THEN RAISE EXCEPTION 'Doctor has no working hours'; END IF;
 day := (new.data->>'date')::date;
 IF NOT (av->'days' @> to_jsonb(extract(dow from day)::int)) OR coalesce(av->'blockedDays','[]'::jsonb) ? day::text THEN RAISE EXCEPTION 'Doctor is unavailable on this day'; END IF;
 IF coalesce(new.data->>'rescheduledFrom','') <> '' THEN
  SELECT * INTO original FROM public.appointments WHERE id = new.data->>'rescheduledFrom' FOR UPDATE;
  IF original.id IS NULL OR original.patient_id <> new.patient_id OR original.doctor_id <> new.doctor_id OR original.data->>'status' NOT IN ('Confirmed','Pending','Waiting') OR (auth.uid() IS NOT NULL AND auth.uid()::text NOT IN (original.patient_id,original.doctor_id) AND NOT public.is_admin()) THEN RAISE EXCEPTION 'Cannot reschedule this appointment'; END IF;
  UPDATE public.appointments SET data = data || jsonb_build_object('status','Rescheduled','rescheduledTo',new.id) WHERE id = original.id;
 END IF;
 start_min := split_part(av->>'start', ':', 1)::int * 60 + split_part(av->>'start', ':', 2)::int;
 end_min := split_part(av->>'end', ':', 1)::int * 60 + split_part(av->>'end', ':', 2)::int;
 cap := coalesce((av->>'dailyLimit')::int, greatest(1,(end_min-start_min)/greatest(1,(av->>'duration')::int)));
 step_min := greatest(1,(end_min-start_min)/cap);
 SELECT count(*) INTO used FROM public.appointments WHERE doctor_id=new.doctor_id AND data->>'date'=day::text AND data->>'status' NOT IN ('Cancelled','Rescheduled');
 IF used >= cap THEN RAISE EXCEPTION 'Daily patient limit reached. Choose another date.'; END IF;
 FOR i IN 0..cap-1 LOOP
  candidate := lpad(((start_min+i*step_min)/60)::text,2,'0') || ':' || lpad(((start_min+i*step_min)%60)::text,2,'0');
  IF NOT (coalesce(av->'blocked','[]'::jsonb) ? (day::text || ' ' || candidate)) AND (day + candidate::time) AT TIME ZONE 'Africa/Tripoli' > now() AND NOT EXISTS (SELECT 1 FROM public.appointments WHERE doctor_id=new.doctor_id AND data->>'date'=day::text AND data->>'time'=candidate AND data->>'status' NOT IN ('Cancelled','Rescheduled')) THEN chosen := candidate; EXIT; END IF;
 END LOOP;
 IF chosen IS NULL THEN RAISE EXCEPTION 'No places available on this day. Choose another date.'; END IF;
 SELECT coalesce(max((data->>'queueNumber')::int),0)+1 INTO q FROM public.appointments WHERE doctor_id=new.doctor_id AND data->>'date'=day::text;
 new.data := new.data || jsonb_build_object('id',new.id,'doctorId',new.doctor_id,'patientId',new.patient_id,'time',chosen,'queueNumber',q,'status','Confirmed');
 RETURN new;
END $$;CREATE OR REPLACE FUNCTION public.schedule_shifts(av jsonb, day date) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE WHEN av->'dateOverrides' ? day::text THEN av->'dateOverrides'->day::text WHEN av ? 'weeklyShifts' THEN coalesce(av->'weeklyShifts'->(extract(dow from day)::int)::text,'[]'::jsonb) WHEN av->'days' @> to_jsonb(extract(dow from day)::int) THEN jsonb_build_array(jsonb_build_object('start',av->>'start','end',av->>'end','capacity',coalesce((av->>'dailyLimit')::int,greatest(1,((split_part(av->>'end',':',1)::int*60+split_part(av->>'end',':',2)::int)-(split_part(av->>'start',':',1)::int*60+split_part(av->>'start',':',2)::int))/greatest(1,(av->>'duration')::int))))) ELSE '[]'::jsonb END;
$$;
CREATE OR REPLACE FUNCTION public.validate_daily_capacity() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE group_shifts jsonb; shift jsonb; start_min int; end_min int; cap int; last_end text;
BEGIN
 IF new.data ? 'weeklyShifts' THEN
  IF jsonb_typeof(new.data->'weeklyShifts') <> 'object' OR (new.data ? 'dateOverrides' AND jsonb_typeof(new.data->'dateOverrides') <> 'object') THEN RAISE EXCEPTION 'Invalid schedule'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(new.data->'weeklyShifts') k WHERE k !~ '^[0-6]$') THEN RAISE EXCEPTION 'Invalid working day'; END IF;
  FOR group_shifts IN SELECT value FROM jsonb_each(new.data->'weeklyShifts') UNION ALL SELECT value FROM jsonb_each(coalesce(new.data->'dateOverrides','{}'::jsonb)) LOOP
   IF jsonb_typeof(group_shifts) <> 'array' THEN RAISE EXCEPTION 'Invalid shifts'; END IF;
   last_end := NULL;
   FOR shift IN SELECT value FROM jsonb_array_elements(group_shifts) ORDER BY value->>'start' LOOP
    IF coalesce(shift->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR coalesce(shift->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR coalesce(shift->>'capacity','') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Invalid shift times or patient limit'; END IF;
    start_min := split_part(shift->>'start',':',1)::int*60+split_part(shift->>'start',':',2)::int;
    end_min := split_part(shift->>'end',':',1)::int*60+split_part(shift->>'end',':',2)::int;
    cap := (shift->>'capacity')::int;
    IF end_min<=start_min OR cap<1 OR cap>end_min-start_min THEN RAISE EXCEPTION 'Invalid shift hours or patient limit'; END IF;
    IF last_end > shift->>'start' THEN RAISE EXCEPTION 'Shifts cannot overlap'; END IF;
    last_end := shift->>'end';
   END LOOP;
  END LOOP;
 ELSE
  start_min := split_part(new.data->>'start',':',1)::int*60+split_part(new.data->>'start',':',2)::int;
  end_min := split_part(new.data->>'end',':',1)::int*60+split_part(new.data->>'end',':',2)::int;
  cap := coalesce((new.data->>'dailyLimit')::int,greatest(1,(end_min-start_min)/greatest(1,(new.data->>'duration')::int)));
  IF cap<1 OR end_min<=start_min OR cap>end_min-start_min THEN RAISE EXCEPTION 'Invalid daily limit'; END IF;
 END IF;
 RETURN new;
END $$;
CREATE OR REPLACE FUNCTION public.allocate_daily_booking() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE av jsonb; shifts jsonb; shift jsonb; day date; cap int; total_cap int; start_min int; end_min int; step_min int; candidate text; used int; q int; chosen text; original public.appointments%ROWTYPE;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF new.doctor_id IS DISTINCT FROM old.doctor_id OR new.patient_id IS DISTINCT FROM old.patient_id OR new.data->>'date' IS DISTINCT FROM old.data->>'date' OR new.data->>'time' IS DISTINCT FROM old.data->>'time' OR new.data->>'queueNumber' IS DISTINCT FROM old.data->>'queueNumber' THEN RAISE EXCEPTION 'Appointment date, time and queue are system assigned; reschedule instead'; END IF;
  RETURN new;
 END IF;
 SELECT data INTO av FROM public.availability WHERE id=new.doctor_id FOR UPDATE;
 IF av IS NULL THEN RAISE EXCEPTION 'Doctor has no working hours'; END IF;
 day := (new.data->>'date')::date;
 shifts := public.schedule_shifts(av,day);
 IF jsonb_array_length(shifts)=0 OR coalesce(av->'blockedDays','[]'::jsonb) ? day::text THEN RAISE EXCEPTION 'Doctor is unavailable on this day'; END IF;
 IF coalesce(new.data->>'rescheduledFrom','')<>'' THEN
  SELECT * INTO original FROM public.appointments WHERE id=new.data->>'rescheduledFrom' FOR UPDATE;
  IF original.id IS NULL OR original.patient_id<>new.patient_id OR original.doctor_id<>new.doctor_id OR original.data->>'status' NOT IN ('Confirmed','Pending','Waiting') OR (auth.uid() IS NOT NULL AND auth.uid()::text NOT IN (original.patient_id,original.doctor_id) AND NOT public.is_admin()) THEN RAISE EXCEPTION 'Cannot reschedule this appointment'; END IF;
  UPDATE public.appointments SET data=data||jsonb_build_object('status','Rescheduled','rescheduledTo',new.id) WHERE id=original.id;
 END IF;
 SELECT sum((value->>'capacity')::int) INTO total_cap FROM jsonb_array_elements(shifts);
 SELECT count(*) INTO used FROM public.appointments WHERE doctor_id=new.doctor_id AND data->>'date'=day::text AND data->>'status' NOT IN ('Cancelled','Rescheduled');
 IF used>=total_cap THEN RAISE EXCEPTION 'Daily patient limit reached. Choose another date.'; END IF;
 FOR shift IN SELECT value FROM jsonb_array_elements(shifts) ORDER BY value->>'start' LOOP
  cap := (shift->>'capacity')::int;
  SELECT count(*) INTO used FROM public.appointments WHERE doctor_id=new.doctor_id AND data->>'date'=day::text AND data->>'status' NOT IN ('Cancelled','Rescheduled') AND data->>'time'>=shift->>'start' AND data->>'time'<shift->>'end';
  IF used>=cap THEN CONTINUE; END IF;
  start_min := split_part(shift->>'start',':',1)::int*60+split_part(shift->>'start',':',2)::int;
  end_min := split_part(shift->>'end',':',1)::int*60+split_part(shift->>'end',':',2)::int;
  IF coalesce(av->>'consultMinutes','') ~ '^[0-9]+$' AND (av->>'consultMinutes')::int>0 THEN step_min := (av->>'consultMinutes')::int; cap := least(cap, greatest(1,(end_min-start_min)/step_min)); ELSE step_min := greatest(1,(end_min-start_min)/cap); END IF;
  FOR i IN 0..cap-1 LOOP
   candidate := lpad(((start_min+i*step_min)/60)::text,2,'0')||':'||lpad(((start_min+i*step_min)%60)::text,2,'0');
   IF NOT (coalesce(av->'blocked','[]'::jsonb) ? (day::text||' '||candidate)) AND (day+candidate::time) AT TIME ZONE 'Africa/Tripoli'>now() AND NOT EXISTS (SELECT 1 FROM public.appointments WHERE doctor_id=new.doctor_id AND data->>'date'=day::text AND data->>'time'=candidate AND data->>'status' NOT IN ('Cancelled','Rescheduled')) THEN chosen:=candidate; EXIT; END IF;
  END LOOP;
  IF chosen IS NOT NULL THEN EXIT; END IF;
 END LOOP;
 IF chosen IS NULL THEN RAISE EXCEPTION 'No places available on this day. Choose another date.'; END IF;
 SELECT coalesce(max((data->>'queueNumber')::int),0)+1 INTO q FROM public.appointments WHERE doctor_id=new.doctor_id AND data->>'date'=day::text;
 new.data:=new.data||jsonb_build_object('id',new.id,'doctorId',new.doctor_id,'patientId',new.patient_id,'time',chosen,'queueNumber',q,'status','Confirmed');
 RETURN new;
END $$;
-- Call recordings (bucket "recordings", private, 50MB) for admin case files
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
-- Re-time queues when per-patient time changes
CREATE OR REPLACE FUNCTION public.guard_appointment_retime() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 RETURN new;
END $$;

CREATE OR REPLACE FUNCTION public.allocate_daily_booking() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE av jsonb; shifts jsonb; shift jsonb; day date; cap int; total_cap int; start_min int; end_min int; step_min int; candidate text; used int; q int; chosen text; original public.appointments%ROWTYPE;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF coalesce(current_setting('app.retime', true),'')='on' AND new.doctor_id=old.doctor_id AND new.patient_id=old.patient_id AND new.data->>'date'=old.data->>'date' AND new.data->>'queueNumber' IS NOT DISTINCT FROM old.data->>'queueNumber' THEN RETURN new; END IF;
  IF new.doctor_id IS DISTINCT FROM old.doctor_id OR new.patient_id IS DISTINCT FROM old.patient_id OR new.data->>'date' IS DISTINCT FROM old.data->>'date' OR new.data->>'time' IS DISTINCT FROM old.data->>'time' OR new.data->>'queueNumber' IS DISTINCT FROM old.data->>'queueNumber' THEN RAISE EXCEPTION 'Appointment date, time and queue are system assigned; reschedule instead'; END IF;
  RETURN new;
 END IF;
 SELECT data INTO av FROM public.availability WHERE id=new.doctor_id FOR UPDATE;
 IF av IS NULL THEN RAISE EXCEPTION 'Doctor has no working hours'; END IF;
 day := (new.data->>'date')::date;
 shifts := public.schedule_shifts(av,day);
 IF jsonb_array_length(shifts)=0 OR coalesce(av->'blockedDays','[]'::jsonb) ? day::text THEN RAISE EXCEPTION 'Doctor is unavailable on this day'; END IF;
 IF coalesce(new.data->>'rescheduledFrom','')<>'' THEN
  SELECT * INTO original FROM public.appointments WHERE id=new.data->>'rescheduledFrom' FOR UPDATE;
  IF original.id IS NULL OR original.patient_id<>new.patient_id OR original.doctor_id<>new.doctor_id OR original.data->>'status' NOT IN ('Confirmed','Pending','Waiting') OR (auth.uid() IS NOT NULL AND auth.uid()::text NOT IN (original.patient_id,original.doctor_id) AND NOT public.is_admin()) THEN RAISE EXCEPTION 'Cannot reschedule this appointment'; END IF;
  UPDATE public.appointments SET data=data||jsonb_build_object('status','Rescheduled','rescheduledTo',new.id) WHERE id=original.id;
 END IF;
 SELECT sum((value->>'capacity')::int) INTO total_cap FROM jsonb_array_elements(shifts);
 SELECT count(*) INTO used FROM public.appointments WHERE doctor_id=new.doctor_id AND data->>'date'=day::text AND data->>'status' NOT IN ('Cancelled','Rescheduled');
 IF used>=total_cap THEN RAISE EXCEPTION 'Daily patient limit reached. Choose another date.'; END IF;
 FOR shift IN SELECT value FROM jsonb_array_elements(shifts) ORDER BY value->>'start' LOOP
  cap := (shift->>'capacity')::int;
  SELECT count(*) INTO used FROM public.appointments WHERE doctor_id=new.doctor_id AND data->>'date'=day::text AND data->>'status' NOT IN ('Cancelled','Rescheduled') AND data->>'time'>=shift->>'start' AND data->>'time'<shift->>'end';
  IF used>=cap THEN CONTINUE; END IF;
  start_min := split_part(shift->>'start',':',1)::int*60+split_part(shift->>'start',':',2)::int;
  end_min := split_part(shift->>'end',':',1)::int*60+split_part(shift->>'end',':',2)::int;
  IF coalesce(av->>'consultMinutes','') ~ '^[0-9]+$' AND (av->>'consultMinutes')::int>0 THEN step_min := (av->>'consultMinutes')::int; cap := least(cap, greatest(1,(end_min-start_min)/step_min)); ELSE step_min := greatest(1,(end_min-start_min)/cap); END IF;
  FOR i IN 0..cap-1 LOOP
   candidate := lpad(((start_min+i*step_min)/60)::text,2,'0')||':'||lpad(((start_min+i*step_min)%60)::text,2,'0');
   IF NOT (coalesce(av->'blocked','[]'::jsonb) ? (day::text||' '||candidate)) AND (day+candidate::time) AT TIME ZONE 'Africa/Tripoli'>now() AND NOT EXISTS (SELECT 1 FROM public.appointments WHERE doctor_id=new.doctor_id AND data->>'date'=day::text AND data->>'time'=candidate AND data->>'status' NOT IN ('Cancelled','Rescheduled')) THEN chosen:=candidate; EXIT; END IF;
  END LOOP;
  IF chosen IS NOT NULL THEN EXIT; END IF;
 END LOOP;
 IF chosen IS NULL THEN RAISE EXCEPTION 'No places available on this day. Choose another date.'; END IF;
 SELECT coalesce(max((data->>'queueNumber')::int),0)+1 INTO q FROM public.appointments WHERE doctor_id=new.doctor_id AND data->>'date'=day::text;
 new.data:=new.data||jsonb_build_object('id',new.id,'doctorId',new.doctor_id,'patientId',new.patient_id,'time',chosen,'queueNumber',q,'status','Confirmed');
 RETURN new;
END $$;

-- Re-time upcoming queues in queue-number order when the doctor's per-patient time changes.
CREATE OR REPLACE FUNCTION public.retime_queue_on_consult_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE step int; today date := (now() AT TIME ZONE 'Africa/Tripoli')::date; d date; shifts jsonb; starts int[]; ends int[]; si int; cur int; appt record; t text;
BEGIN
 IF NOT (coalesce(new.data->>'consultMinutes','') ~ '^[0-9]+$') OR (new.data->>'consultMinutes')::int<1 THEN RETURN new; END IF;
 IF new.data->>'consultMinutes' IS NOT DISTINCT FROM old.data->>'consultMinutes' THEN RETURN new; END IF;
 step := (new.data->>'consultMinutes')::int;
 PERFORM set_config('app.retime','on',true);
 FOR d IN SELECT DISTINCT (data->>'date')::date FROM public.appointments WHERE doctor_id=new.id AND (data->>'date')::date>=today AND data->>'status' IN ('Confirmed','Pending','Waiting') LOOP
  shifts := public.schedule_shifts(new.data,d);
  IF jsonb_array_length(shifts)=0 THEN CONTINUE; END IF;
  SELECT array_agg(split_part(value->>'start',':',1)::int*60+split_part(value->>'start',':',2)::int ORDER BY value->>'start'),
         array_agg(split_part(value->>'end',':',1)::int*60+split_part(value->>'end',':',2)::int ORDER BY value->>'start')
    INTO starts, ends FROM jsonb_array_elements(shifts);
  si := 1; cur := starts[1];
  FOR appt IN SELECT id FROM public.appointments WHERE doctor_id=new.id AND data->>'date'=d::text AND data->>'status' IN ('Confirmed','Pending','Waiting') ORDER BY (data->>'queueNumber')::int LOOP
   WHILE cur+step>ends[si] AND si<array_length(starts,1) LOOP si := si+1; cur := starts[si]; END LOOP;
   t := lpad((cur/60)::text,2,'0')||':'||lpad((cur%60)::text,2,'0');
   UPDATE public.appointments SET data=data||jsonb_build_object('time',t) WHERE id=appt.id;
   cur := cur+step;
  END LOOP;
 END LOOP;
 PERFORM set_config('app.retime','',true);
 RETURN new;
END $$;

DROP TRIGGER IF EXISTS retime_queue_on_consult_change ON public.availability;
CREATE TRIGGER retime_queue_on_consult_change AFTER UPDATE ON public.availability FOR EACH ROW EXECUTE FUNCTION public.retime_queue_on_consult_change();
DROP FUNCTION IF EXISTS public.guard_appointment_retime();
CREATE OR REPLACE FUNCTION public.allocate_daily_booking() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE av jsonb; shifts jsonb; shift jsonb; day date; cap int; total_cap int; start_min int; end_min int; step_min int; candidate text; used int; q int; chosen text; original public.appointments%ROWTYPE;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF coalesce(current_setting('app.retime', true),'')='on' AND new.doctor_id=old.doctor_id AND new.patient_id=old.patient_id AND new.data->>'date'=old.data->>'date' THEN RETURN new; END IF;
  IF new.doctor_id IS DISTINCT FROM old.doctor_id OR new.patient_id IS DISTINCT FROM old.patient_id OR new.data->>'date' IS DISTINCT FROM old.data->>'date' OR new.data->>'time' IS DISTINCT FROM old.data->>'time' OR new.data->>'queueNumber' IS DISTINCT FROM old.data->>'queueNumber' THEN RAISE EXCEPTION 'Appointment date, time and queue are system assigned; reschedule instead'; END IF;
  RETURN new;
 END IF;
 SELECT data INTO av FROM public.availability WHERE id=new.doctor_id FOR UPDATE;
 IF av IS NULL THEN RAISE EXCEPTION 'Doctor has no working hours'; END IF;
 day := (new.data->>'date')::date;
 shifts := public.schedule_shifts(av,day);
 IF jsonb_array_length(shifts)=0 OR coalesce(av->'blockedDays','[]'::jsonb) ? day::text THEN RAISE EXCEPTION 'Doctor is unavailable on this day'; END IF;
 IF coalesce(new.data->>'rescheduledFrom','')<>'' THEN
  SELECT * INTO original FROM public.appointments WHERE id=new.data->>'rescheduledFrom' FOR UPDATE;
  IF original.id IS NULL OR original.patient_id<>new.patient_id OR original.doctor_id<>new.doctor_id OR original.data->>'status' NOT IN ('Confirmed','Pending','Waiting') OR (auth.uid() IS NOT NULL AND auth.uid()::text NOT IN (original.patient_id,original.doctor_id) AND NOT public.is_admin()) THEN RAISE EXCEPTION 'Cannot reschedule this appointment'; END IF;
  UPDATE public.appointments SET data=data||jsonb_build_object('status','Rescheduled','rescheduledTo',new.id) WHERE id=original.id;
 END IF;
 SELECT sum((value->>'capacity')::int) INTO total_cap FROM jsonb_array_elements(shifts);
 SELECT count(*) INTO used FROM public.appointments WHERE doctor_id=new.doctor_id AND data->>'date'=day::text AND data->>'status' NOT IN ('Cancelled','Rescheduled','No Show');
 IF used>=total_cap THEN RAISE EXCEPTION 'Daily patient limit reached. Choose another date.'; END IF;
 FOR shift IN SELECT value FROM jsonb_array_elements(shifts) ORDER BY value->>'start' LOOP
  cap := (shift->>'capacity')::int;
  SELECT count(*) INTO used FROM public.appointments WHERE doctor_id=new.doctor_id AND data->>'date'=day::text AND data->>'status' NOT IN ('Cancelled','Rescheduled','No Show') AND data->>'time'>=shift->>'start' AND data->>'time'<shift->>'end';
  IF used>=cap THEN CONTINUE; END IF;
  start_min := split_part(shift->>'start',':',1)::int*60+split_part(shift->>'start',':',2)::int;
  end_min := split_part(shift->>'end',':',1)::int*60+split_part(shift->>'end',':',2)::int;
  IF coalesce(av->>'consultMinutes','') ~ '^[0-9]+$' AND (av->>'consultMinutes')::int>0 THEN step_min := (av->>'consultMinutes')::int; cap := least(cap, greatest(1,(end_min-start_min)/step_min)); ELSE step_min := greatest(1,(end_min-start_min)/cap); END IF;
  FOR i IN 0..cap-1 LOOP
   candidate := lpad(((start_min+i*step_min)/60)::text,2,'0')||':'||lpad(((start_min+i*step_min)%60)::text,2,'0');
   IF NOT (coalesce(av->'blocked','[]'::jsonb) ? (day::text||' '||candidate)) AND (day+candidate::time) AT TIME ZONE 'Africa/Tripoli'>now() AND NOT EXISTS (SELECT 1 FROM public.appointments WHERE doctor_id=new.doctor_id AND data->>'date'=day::text AND data->>'time'=candidate AND data->>'status' NOT IN ('Cancelled','Rescheduled','No Show')) THEN chosen:=candidate; EXIT; END IF;
  END LOOP;
  IF chosen IS NOT NULL THEN EXIT; END IF;
 END LOOP;
 IF chosen IS NULL THEN RAISE EXCEPTION 'No places available on this day. Choose another date.'; END IF;
 SELECT coalesce(max((data->>'queueNumber')::int),0)+1 INTO q FROM public.appointments WHERE doctor_id=new.doctor_id AND data->>'date'=day::text AND data->>'status' NOT IN ('Cancelled','Rescheduled','No Show');
 new.data:=new.data||jsonb_build_object('id',new.id,'doctorId',new.doctor_id,'patientId',new.patient_id,'time',chosen,'queueNumber',q,'status','Confirmed');
 RETURN new;
END $$;

-- When an appointment is cancelled, rescheduled away or marked no-show, every later waiting patient
-- moves up one place and takes the previous patient's number and time.
CREATE OR REPLACE FUNCTION public.close_queue_gap() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prev_q int; prev_t text; r record;
BEGIN
 IF new.data->>'status' NOT IN ('Cancelled','Rescheduled','No Show') OR old.data->>'status' IN ('Cancelled','Rescheduled','No Show','Completed') THEN RETURN NULL; END IF;
 prev_q := (old.data->>'queueNumber')::int; prev_t := old.data->>'time';
 IF prev_q IS NULL THEN RETURN NULL; END IF;
 PERFORM set_config('app.retime','on',true);
 FOR r IN SELECT id, (data->>'queueNumber')::int AS q, data->>'time' AS t FROM public.appointments
   WHERE doctor_id=new.doctor_id AND data->>'date'=new.data->>'date' AND id<>new.id
     AND data->>'status' IN ('Confirmed','Pending','Waiting','Checked-In') AND (data->>'queueNumber')::int>prev_q
   ORDER BY (data->>'queueNumber')::int LOOP
  UPDATE public.appointments SET data=data||jsonb_build_object('queueNumber',prev_q,'time',prev_t) WHERE id=r.id;
  prev_q := r.q; prev_t := r.t;
 END LOOP;
 PERFORM set_config('app.retime','',true);
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS close_queue_gap ON public.appointments;
CREATE TRIGGER close_queue_gap AFTER UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.close_queue_gap();
CREATE OR REPLACE FUNCTION public.renumber_on_return() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE nums int[]; times text[]; step int; last_t text; m int; i int := 0; r record;
BEGIN
 IF old.data->>'status'<>'No Show' OR new.data->>'status' NOT IN ('Waiting','Confirmed','Checked-In') THEN RETURN NULL; END IF;
 SELECT coalesce(NULLIF(data->>'consultMinutes','')::int,15) INTO step FROM public.availability WHERE id=new.doctor_id;
 step := coalesce(step,15);
 SELECT array_agg((data->>'queueNumber')::int ORDER BY (data->>'queueNumber')::int), array_agg(data->>'time' ORDER BY data->>'time')
   INTO nums, times FROM public.appointments
   WHERE doctor_id=new.doctor_id AND data->>'date'=new.data->>'date' AND id<>new.id AND data->>'status' IN ('Confirmed','Pending','Waiting','Checked-In');
 SELECT max((data->>'queueNumber')::int) INTO m FROM public.appointments WHERE doctor_id=new.doctor_id AND data->>'date'=new.data->>'date';
 last_t := coalesce(times[array_length(times,1)], new.data->>'time');
 m := split_part(last_t,':',1)::int*60+split_part(last_t,':',2)::int + CASE WHEN times IS NULL THEN 0 ELSE step END;
 nums := coalesce(nums,'{}') || (SELECT max((data->>'queueNumber')::int)+1 FROM public.appointments WHERE doctor_id=new.doctor_id AND data->>'date'=new.data->>'date');
 times := coalesce(times,'{}') || (lpad((m/60)::text,2,'0')||':'||lpad((m%60)::text,2,'0'));
 PERFORM set_config('app.retime','on',true);
 FOR r IN SELECT id FROM public.appointments
   WHERE doctor_id=new.doctor_id AND data->>'date'=new.data->>'date' AND data->>'status' IN ('Confirmed','Pending','Waiting','Checked-In')
   ORDER BY coalesce(NULLIF(data->>'queueOrder','')::numeric,(data->>'queueNumber')::numeric) LOOP
  i := i+1;
  UPDATE public.appointments SET data=(data-'queueOrder')||jsonb_build_object('queueNumber',nums[i],'time',times[i]) WHERE id=r.id;
 END LOOP;
 PERFORM set_config('app.retime','',true);
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS renumber_on_return ON public.appointments;
CREATE TRIGGER renumber_on_return AFTER UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.renumber_on_return();
CREATE OR REPLACE FUNCTION public.allocate_daily_booking() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE av jsonb; shifts jsonb; shift jsonb; day date; cap int; total_cap int; start_min int; end_min int; step_min int; candidate text; used int; q int; chosen text; original public.appointments%ROWTYPE; per_slot int; n_slots int;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF coalesce(current_setting('app.retime', true),'')='on' AND new.doctor_id=old.doctor_id AND new.patient_id=old.patient_id AND new.data->>'date'=old.data->>'date' THEN RETURN new; END IF;
  IF new.doctor_id IS DISTINCT FROM old.doctor_id OR new.patient_id IS DISTINCT FROM old.patient_id OR new.data->>'date' IS DISTINCT FROM old.data->>'date' OR new.data->>'time' IS DISTINCT FROM old.data->>'time' OR new.data->>'queueNumber' IS DISTINCT FROM old.data->>'queueNumber' THEN RAISE EXCEPTION 'Appointment date, time and queue are system assigned; reschedule instead'; END IF;
  RETURN new;
 END IF;
 SELECT data INTO av FROM public.availability WHERE id=new.doctor_id FOR UPDATE;
 IF av IS NULL THEN RAISE EXCEPTION 'Doctor has no working hours'; END IF;
 per_slot := CASE WHEN coalesce(av->>'patientsPerSlot','') ~ '^[0-9]+$' THEN greatest(1,(av->>'patientsPerSlot')::int) ELSE 1 END;
 day := (new.data->>'date')::date;
 shifts := public.schedule_shifts(av,day);
 IF jsonb_array_length(shifts)=0 OR coalesce(av->'blockedDays','[]'::jsonb) ? day::text THEN RAISE EXCEPTION 'Doctor is unavailable on this day'; END IF;
 IF coalesce(new.data->>'rescheduledFrom','')<>'' THEN
  SELECT * INTO original FROM public.appointments WHERE id=new.data->>'rescheduledFrom' FOR UPDATE;
  IF original.id IS NULL OR original.patient_id<>new.patient_id OR original.doctor_id<>new.doctor_id OR original.data->>'status' NOT IN ('Confirmed','Pending','Waiting') OR (auth.uid() IS NOT NULL AND auth.uid()::text NOT IN (original.patient_id,original.doctor_id) AND NOT public.is_admin()) THEN RAISE EXCEPTION 'Cannot reschedule this appointment'; END IF;
  UPDATE public.appointments SET data=data||jsonb_build_object('status','Rescheduled','rescheduledTo',new.id) WHERE id=original.id;
 END IF;
 SELECT sum((value->>'capacity')::int) INTO total_cap FROM jsonb_array_elements(shifts);
 SELECT count(*) INTO used FROM public.appointments WHERE doctor_id=new.doctor_id AND data->>'date'=day::text AND data->>'status' NOT IN ('Cancelled','Rescheduled','No Show');
 IF used>=total_cap THEN RAISE EXCEPTION 'Daily patient limit reached. Choose another date.'; END IF;
 FOR shift IN SELECT value FROM jsonb_array_elements(shifts) ORDER BY value->>'start' LOOP
  cap := (shift->>'capacity')::int;
  SELECT count(*) INTO used FROM public.appointments WHERE doctor_id=new.doctor_id AND data->>'date'=day::text AND data->>'status' NOT IN ('Cancelled','Rescheduled','No Show') AND data->>'time'>=shift->>'start' AND data->>'time'<shift->>'end';
  IF used>=cap THEN CONTINUE; END IF;
  start_min := split_part(shift->>'start',':',1)::int*60+split_part(shift->>'start',':',2)::int;
  end_min := split_part(shift->>'end',':',1)::int*60+split_part(shift->>'end',':',2)::int;
  IF coalesce(av->>'consultMinutes','') ~ '^[0-9]+$' AND (av->>'consultMinutes')::int>0 THEN
   step_min := (av->>'consultMinutes')::int;
   cap := least(cap, greatest(1,(end_min-start_min)/step_min)*per_slot);
   n_slots := ceil(cap::numeric/per_slot)::int;
  ELSE
   n_slots := ceil(cap::numeric/per_slot)::int;
   step_min := greatest(1,(end_min-start_min)/n_slots);
  END IF;
  IF used>=cap THEN CONTINUE; END IF;
  FOR i IN 0..n_slots-1 LOOP
   candidate := lpad(((start_min+i*step_min)/60)::text,2,'0')||':'||lpad(((start_min+i*step_min)%60)::text,2,'0');
   IF NOT (coalesce(av->'blocked','[]'::jsonb) ? (day::text||' '||candidate)) AND (day+candidate::time) AT TIME ZONE 'Africa/Tripoli'>now()
      AND (SELECT count(*) FROM public.appointments WHERE doctor_id=new.doctor_id AND data->>'date'=day::text AND data->>'time'=candidate AND data->>'status' NOT IN ('Cancelled','Rescheduled','No Show'))<per_slot THEN chosen:=candidate; EXIT; END IF;
  END LOOP;
  IF chosen IS NOT NULL THEN EXIT; END IF;
 END LOOP;
 IF chosen IS NULL THEN RAISE EXCEPTION 'No places available on this day. Choose another date.'; END IF;
 SELECT coalesce(max((data->>'queueNumber')::int),0)+1 INTO q FROM public.appointments WHERE doctor_id=new.doctor_id AND data->>'date'=day::text AND data->>'status' NOT IN ('Cancelled','Rescheduled','No Show');
 new.data:=new.data||jsonb_build_object('id',new.id,'doctorId',new.doctor_id,'patientId',new.patient_id,'time',chosen,'queueNumber',q,'status','Confirmed');
 RETURN new;
END $$;

CREATE OR REPLACE FUNCTION public.retime_queue_on_consult_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE step int; per_slot int; in_slot int; today date := (now() AT TIME ZONE 'Africa/Tripoli')::date; d date; shifts jsonb; starts int[]; ends int[]; si int; cur int; appt record; t text;
BEGIN
 IF NOT (coalesce(new.data->>'consultMinutes','') ~ '^[0-9]+$') OR (new.data->>'consultMinutes')::int<1 THEN RETURN new; END IF;
 IF new.data->>'consultMinutes' IS NOT DISTINCT FROM old.data->>'consultMinutes' AND new.data->>'patientsPerSlot' IS NOT DISTINCT FROM old.data->>'patientsPerSlot' THEN RETURN new; END IF;
 step := (new.data->>'consultMinutes')::int;
 per_slot := CASE WHEN coalesce(new.data->>'patientsPerSlot','') ~ '^[0-9]+$' THEN greatest(1,(new.data->>'patientsPerSlot')::int) ELSE 1 END;
 PERFORM set_config('app.retime','on',true);
 FOR d IN SELECT DISTINCT (data->>'date')::date FROM public.appointments WHERE doctor_id=new.id AND (data->>'date')::date>=today AND data->>'status' IN ('Confirmed','Pending','Waiting') LOOP
  shifts := public.schedule_shifts(new.data,d);
  IF jsonb_array_length(shifts)=0 THEN CONTINUE; END IF;
  SELECT array_agg(split_part(value->>'start',':',1)::int*60+split_part(value->>'start',':',2)::int ORDER BY value->>'start'),
         array_agg(split_part(value->>'end',':',1)::int*60+split_part(value->>'end',':',2)::int ORDER BY value->>'start')
    INTO starts, ends FROM jsonb_array_elements(shifts);
  si := 1; cur := starts[1]; in_slot := 0;
  FOR appt IN SELECT id FROM public.appointments WHERE doctor_id=new.id AND data->>'date'=d::text AND data->>'status' IN ('Confirmed','Pending','Waiting') ORDER BY (data->>'queueNumber')::int LOOP
   IF in_slot>=per_slot THEN cur := cur+step; in_slot := 0; END IF;
   WHILE cur+step>ends[si] AND si<array_length(starts,1) LOOP si := si+1; cur := starts[si]; END LOOP;
   t := lpad((cur/60)::text,2,'0')||':'||lpad((cur%60)::text,2,'0');
   UPDATE public.appointments SET data=data||jsonb_build_object('time',t) WHERE id=appt.id;
   in_slot := in_slot+1;
  END LOOP;
 END LOOP;
 PERFORM set_config('app.retime','',true);
 RETURN new;
END $$;
-- Doctor resumes after a break: push today's waiting patients' times later by the break length.
CREATE OR REPLACE FUNCTION public.shift_queue_times(_doctor text, _date text, _minutes int) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; m int;
BEGIN
 IF auth.uid() IS NULL OR (auth.uid()::text<>_doctor AND NOT public.is_admin()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 IF _minutes IS NULL OR _minutes<1 OR _minutes>720 THEN RETURN; END IF;
 PERFORM set_config('app.retime','on',true);
 FOR r IN SELECT id, data->>'time' AS t FROM public.appointments WHERE doctor_id=_doctor AND data->>'date'=_date AND data->>'status' IN ('Confirmed','Pending','Waiting','Checked-In') LOOP
  m := least(23*60+59, split_part(r.t,':',1)::int*60+split_part(r.t,':',2)::int+_minutes);
  UPDATE public.appointments SET data=data||jsonb_build_object('time',lpad((m/60)::text,2,'0')||':'||lpad((m%60)::text,2,'0')) WHERE id=r.id;
 END LOOP;
 PERFORM set_config('app.retime','',true);
END $$;
REVOKE ALL ON FUNCTION public.shift_queue_times(text,text,int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.shift_queue_times(text,text,int) TO authenticated;ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
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
-- ===== Laboratories (lab accounts, lab orders, permanent lab results) =====
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