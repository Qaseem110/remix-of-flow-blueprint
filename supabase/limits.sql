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
-- ===== Lab report discussion (patient <-> doctor) =====
CREATE TABLE IF NOT EXISTS public.lab_messages (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES public.lab_orders(id) ON DELETE CASCADE,
  author_id text NOT NULL DEFAULT auth.uid()::text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.lab_messages TO authenticated;
GRANT ALL ON public.lab_messages TO service_role;
ALTER TABLE public.lab_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lab messages read" ON public.lab_messages FOR SELECT TO authenticated USING (
  public.is_admin() OR EXISTS (SELECT 1 FROM public.lab_orders o WHERE o.id = order_id AND (o.patient_id = auth.uid()::text OR o.doctor_id = auth.uid()::text)));
CREATE POLICY "lab messages insert" ON public.lab_messages FOR INSERT TO authenticated WITH CHECK (
  author_id = auth.uid()::text AND EXISTS (SELECT 1 FROM public.lab_orders o WHERE o.id = order_id AND (o.patient_id = auth.uid()::text OR o.doctor_id = auth.uid()::text)));
-- Numeric tracking numbers (immutable IDs preserve report links).
CREATE SEQUENCE IF NOT EXISTS public.appointment_tracking_seq START 100001;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS tracking_number text DEFAULT nextval('public.appointment_tracking_seq')::text;
ALTER TABLE public.lab_orders ADD COLUMN IF NOT EXISTS tracking_number text DEFAULT nextval('public.appointment_tracking_seq')::text;
UPDATE public.appointments SET tracking_number=nextval('public.appointment_tracking_seq')::text WHERE tracking_number IS NULL;
UPDATE public.lab_orders SET tracking_number=nextval('public.appointment_tracking_seq')::text WHERE tracking_number IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS appointments_tracking_number_unique ON public.appointments(tracking_number);
CREATE UNIQUE INDEX IF NOT EXISTS lab_orders_tracking_number_unique ON public.lab_orders(tracking_number);
ALTER TABLE public.appointments ADD CONSTRAINT appointments_numeric_tracking CHECK (tracking_number ~ '^[0-9]+$');
ALTER TABLE public.lab_orders ADD CONSTRAINT lab_orders_numeric_tracking CHECK (tracking_number ~ '^[0-9]+$');
GRANT USAGE ON SEQUENCE public.appointment_tracking_seq TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.kiosk_check_in_tracking(method text, value text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE resolved text;
BEGIN
 IF method='appointmentId' THEN
  SELECT id INTO resolved FROM public.appointments WHERE tracking_number=btrim(value);
  IF resolved IS NULL THEN RAISE EXCEPTION 'Appointment not found'; END IF;
  RETURN public.kiosk_check_in(method,resolved);
 END IF;
 RETURN public.kiosk_check_in(method,value);
END; $$;
REVOKE ALL ON FUNCTION public.kiosk_check_in_tracking(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kiosk_check_in_tracking(text,text) TO anon, authenticated, service_role;
-- Laboratory date/time availability and capacity enforcement
CREATE OR REPLACE FUNCTION public.validate_lab_schedule() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE s jsonb; shifts jsonb; sh jsonb; prev_end text; minutes integer;
BEGIN
 s:=new.data->'schedule';
 IF s IS NULL OR s='null'::jsonb THEN RETURN new; END IF;
 IF jsonb_typeof(s->'weeklyShifts') IS DISTINCT FROM 'object' OR jsonb_typeof(s->'dateOverrides') IS DISTINCT FROM 'object' OR coalesce(s->>'slotMinutes','') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Invalid lab availability'; END IF;
 minutes:=(s->>'slotMinutes')::integer;
 IF minutes<5 OR minutes>240 THEN RAISE EXCEPTION 'Test appointment duration must be between 5 and 240 minutes'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_object_keys(s->'weeklyShifts') k WHERE k !~ '^[0-6]$') OR EXISTS (SELECT 1 FROM jsonb_object_keys(s->'dateOverrides') k WHERE k !~ '^\d{4}-\d{2}-\d{2}$') THEN RAISE EXCEPTION 'Invalid schedule day'; END IF;
 FOR shifts IN SELECT value FROM jsonb_each(s->'weeklyShifts') UNION ALL SELECT value FROM jsonb_each(s->'dateOverrides') LOOP
  IF jsonb_typeof(shifts)<>'array' THEN RAISE EXCEPTION 'Invalid lab shifts'; END IF;
  prev_end:=NULL;
  FOR sh IN SELECT value FROM jsonb_array_elements(shifts) ORDER BY value->>'start' LOOP
   IF coalesce(sh->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR coalesce(sh->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR sh->>'end'<=sh->>'start' OR coalesce(sh->>'capacity','') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Invalid lab shift'; END IF;
   IF (sh->>'capacity')::int<1 OR (sh->>'capacity')::int>extract(epoch from ((sh->>'end')::time-(sh->>'start')::time))/60 THEN RAISE EXCEPTION 'Invalid shift capacity'; END IF;
   IF prev_end>sh->>'start' THEN RAISE EXCEPTION 'Lab shifts cannot overlap'; END IF;
   prev_end:=sh->>'end';
  END LOOP;
 END LOOP;
 RETURN new;
END $$;
CREATE TRIGGER validate_lab_schedule BEFORE INSERT OR UPDATE ON public.labs FOR EACH ROW EXECUTE FUNCTION public.validate_lab_schedule();

CREATE OR REPLACE FUNCTION public.allocate_lab_slot() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s jsonb; shifts jsonb; sh jsonb; day date; chosen time; minutes integer; occupied integer; start_time time; end_time time; matched boolean:=false;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF new.data->>'date' IS NOT DISTINCT FROM old.data->>'date' AND new.data->>'time' IS NOT DISTINCT FROM old.data->>'time' THEN RETURN new; END IF;
  IF auth.uid() IS NOT NULL AND auth.uid()::text<>old.lab_id AND NOT public.is_admin() THEN RAISE EXCEPTION 'Only the laboratory can change the appointment time'; END IF;
  IF old.data->>'status'<>'Requested' THEN RAISE EXCEPTION 'Only pending test appointments can be scheduled'; END IF;
 ELSE
  IF new.data->>'status' IS DISTINCT FROM 'Requested' THEN RAISE EXCEPTION 'New test appointments must be pending'; END IF;
 END IF;
 SELECT data->'schedule' INTO s FROM public.labs WHERE id=new.lab_id FOR UPDATE;
 IF s IS NULL OR s='null'::jsonb THEN RAISE EXCEPTION 'This laboratory has not set its availability yet'; END IF;
 IF coalesce(new.data->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' OR coalesce(new.data->>'time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'Choose an available lab appointment date and time'; END IF;
 day:=(new.data->>'date')::date; chosen:=(new.data->>'time')::time; minutes:=(s->>'slotMinutes')::integer;
 IF (day+chosen) AT TIME ZONE 'Africa/Tripoli'<=now() THEN RAISE EXCEPTION 'Choose a future appointment time'; END IF;
 shifts:=coalesce(s->'dateOverrides'->day::text,s->'weeklyShifts'->extract(dow from day)::int::text,'[]'::jsonb);
 FOR sh IN SELECT value FROM jsonb_array_elements(shifts) LOOP
  start_time:=(sh->>'start')::time; end_time:=(sh->>'end')::time;
  IF chosen>=start_time AND chosen+make_interval(mins=>minutes)<=end_time AND mod((extract(epoch from (chosen-start_time))/60)::int,minutes)=0 THEN
   SELECT count(*) INTO occupied FROM public.lab_orders o WHERE o.lab_id=new.lab_id AND o.id<>new.id AND o.data->>'date'=day::text AND coalesce(o.data->>'status','') NOT IN ('Cancelled','Expired') AND o.data->>'time' IS NOT NULL AND (o.data->>'time')::time<chosen+make_interval(mins=>minutes) AND (o.data->>'time')::time+make_interval(mins=>coalesce((o.data->>'slotMinutes')::int,minutes))>chosen;
   IF occupied>=(sh->>'capacity')::int THEN RAISE EXCEPTION 'This lab appointment time is full. Choose another time.'; END IF;
   matched:=true; EXIT;
  END IF;
 END LOOP;
 IF NOT matched THEN RAISE EXCEPTION 'The laboratory is unavailable at this time'; END IF;
 new.data:=new.data||jsonb_build_object('slotMinutes',minutes);
 RETURN new;
END $$;
CREATE TRIGGER allocate_lab_slot BEFORE INSERT OR UPDATE ON public.lab_orders FOR EACH ROW EXECUTE FUNCTION public.allocate_lab_slot();
CREATE OR REPLACE FUNCTION public.lab_slot_usage(target_lab text, target_date text) RETURNS TABLE(booked_time text, duration integer, bookings integer) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT data->>'time', coalesce((data->>'slotMinutes')::int,30), count(*)::int FROM public.lab_orders WHERE auth.uid() IS NOT NULL AND lab_id=target_lab AND data->>'date'=target_date AND data->>'time' IS NOT NULL AND coalesce(data->>'status','') NOT IN ('Cancelled','Expired') GROUP BY data->>'time', coalesce((data->>'slotMinutes')::int,30);
$$;
REVOKE ALL ON FUNCTION public.lab_slot_usage(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lab_slot_usage(text,text) TO authenticated, service_role;

-- Lab daily tokens
CREATE OR REPLACE FUNCTION public.assign_lab_token() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE nxt integer;
BEGIN
 IF TG_OP='UPDATE' AND new.data->>'date' IS NOT DISTINCT FROM old.data->>'date' AND old.data ? 'token' THEN
  new.data:=new.data||jsonb_build_object('token',old.data->'token'); RETURN new;
 END IF;
 PERFORM 1 FROM public.labs WHERE id=new.lab_id FOR UPDATE;
 SELECT coalesce(max((o.data->>'token')::int),0)+1 INTO nxt FROM public.lab_orders o
  WHERE o.lab_id=new.lab_id AND o.id<>new.id AND o.data->>'date'=new.data->>'date' AND coalesce(o.data->>'token','') ~ '^[0-9]+$';
 new.data:=new.data||jsonb_build_object('token',nxt);
 RETURN new;
END $$;
CREATE TRIGGER assign_lab_token BEFORE INSERT OR UPDATE ON public.lab_orders FOR EACH ROW EXECUTE FUNCTION public.assign_lab_token();
UPDATE public.lab_orders o SET data=o.data||jsonb_build_object('token',r.n) FROM (
 SELECT id, row_number() OVER (PARTITION BY lab_id, data->>'date' ORDER BY data->>'time', created_at) n FROM public.lab_orders WHERE NOT (data ? 'token')) r
 WHERE o.id=r.id;
-- Volunteer free checkups
CREATE TABLE public.volunteer_sessions (
 id text PRIMARY KEY, doctor_id text NOT NULL, data jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.volunteer_bookings (
 id text PRIMARY KEY, session_id text NOT NULL REFERENCES public.volunteer_sessions(id) ON DELETE CASCADE, patient_id text NOT NULL, data jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.volunteer_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.volunteer_bookings TO authenticated;
GRANT ALL ON public.volunteer_sessions, public.volunteer_bookings TO service_role;
ALTER TABLE public.volunteer_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.volunteer_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users see volunteer sessions" ON public.volunteer_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Doctors add own sessions" ON public.volunteer_sessions FOR INSERT TO authenticated WITH CHECK (doctor_id=auth.uid()::text AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id::text=auth.uid()::text AND p.role='doctor'));
CREATE POLICY "Doctors edit own sessions" ON public.volunteer_sessions FOR UPDATE TO authenticated USING (doctor_id=auth.uid()::text OR public.is_admin()) WITH CHECK (doctor_id=auth.uid()::text OR public.is_admin());
CREATE POLICY "Doctors remove own empty sessions" ON public.volunteer_sessions FOR DELETE TO authenticated USING (doctor_id=auth.uid()::text AND NOT EXISTS (SELECT 1 FROM public.volunteer_bookings b WHERE b.session_id=id));
CREATE OR REPLACE FUNCTION public.volunteer_session_doctor(sid text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT doctor_id FROM public.volunteer_sessions WHERE id=sid $$;
CREATE POLICY "Patient or volunteer doctor sees booking" ON public.volunteer_bookings FOR SELECT TO authenticated USING (patient_id=auth.uid()::text OR public.volunteer_session_doctor(session_id)=auth.uid()::text OR public.is_admin());
CREATE POLICY "Patients book for themselves" ON public.volunteer_bookings FOR INSERT TO authenticated WITH CHECK (patient_id=auth.uid()::text);
CREATE POLICY "Patient or doctor updates booking" ON public.volunteer_bookings FOR UPDATE TO authenticated USING (patient_id=auth.uid()::text OR public.volunteer_session_doctor(session_id)=auth.uid()::text) WITH CHECK (patient_id=auth.uid()::text OR public.volunteer_session_doctor(session_id)=auth.uid()::text);
CREATE OR REPLACE FUNCTION public.allocate_volunteer_token() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s jsonb; used integer; nxt integer;
BEGIN
 SELECT data INTO s FROM public.volunteer_sessions WHERE id=new.session_id FOR UPDATE;
 IF s IS NULL THEN RAISE EXCEPTION 'Volunteer session not found'; END IF;
 IF TG_OP='UPDATE' THEN
  IF auth.uid() IS NOT NULL AND auth.uid()::text=old.patient_id AND auth.uid()::text<>public.volunteer_session_doctor(old.session_id) AND new.data->>'status' NOT IN ('Booked','Cancelled') THEN RAISE EXCEPTION 'Only the doctor can update the visit'; END IF;
  new.data:=new.data||jsonb_build_object('token',old.data->'token'); new.patient_id:=old.patient_id; new.session_id:=old.session_id;
 ELSE
  IF coalesce(s->>'status','Open')<>'Open' THEN RAISE EXCEPTION 'This free checkup session is not open'; END IF;
  IF ((s->>'date')::date + (s->>'end')::time) AT TIME ZONE 'Africa/Tripoli' <= now() THEN RAISE EXCEPTION 'This session has ended'; END IF;
  IF EXISTS (SELECT 1 FROM public.volunteer_bookings b WHERE b.session_id=new.session_id AND b.patient_id=new.patient_id AND b.data->>'status'<>'Cancelled' AND coalesce(b.data->>'memberName','')=coalesce(new.data->>'memberName','')) THEN RAISE EXCEPTION 'You already booked this session'; END IF;
  SELECT count(*) INTO used FROM public.volunteer_bookings b WHERE b.session_id=new.session_id AND b.data->>'status'<>'Cancelled';
  IF used>=coalesce((s->>'capacity')::int,0) THEN RAISE EXCEPTION 'All free spots in this session are taken'; END IF;
  SELECT coalesce(max((b.data->>'token')::int),0)+1 INTO nxt FROM public.volunteer_bookings b WHERE b.session_id=new.session_id;
  new.data:=new.data||jsonb_build_object('token',nxt,'status','Booked');
 END IF;
 RETURN new;
END $$;
CREATE TRIGGER allocate_volunteer_token BEFORE INSERT OR UPDATE ON public.volunteer_bookings FOR EACH ROW EXECUTE FUNCTION public.allocate_volunteer_token();
CREATE OR REPLACE FUNCTION public.count_volunteer_bookings() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.volunteer_sessions v SET data=v.data||jsonb_build_object('booked',(SELECT count(*) FROM public.volunteer_bookings b WHERE b.session_id=v.id AND b.data->>'status'<>'Cancelled'))
  WHERE v.id=new.session_id;
 RETURN new;
END $$;
CREATE TRIGGER count_volunteer_bookings AFTER INSERT OR UPDATE ON public.volunteer_bookings FOR EACH ROW EXECUTE FUNCTION public.count_volunteer_bookings();CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE TABLE public.doctor_alert_settings (doctor_id text PRIMARY KEY REFERENCES public.doctors(id), enabled boolean NOT NULL DEFAULT false, daily_time text NOT NULL DEFAULT '08:00' CHECK(daily_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'), phone text NOT NULL DEFAULT '', discussion_alerts boolean NOT NULL DEFAULT true, last_summary_date date);
GRANT SELECT, INSERT, UPDATE ON public.doctor_alert_settings TO authenticated;
GRANT ALL ON public.doctor_alert_settings TO service_role;
ALTER TABLE public.doctor_alert_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "doctor alert own read" ON public.doctor_alert_settings FOR SELECT TO authenticated USING (doctor_id=auth.uid()::text);
CREATE POLICY "doctor alert own insert" ON public.doctor_alert_settings FOR INSERT TO authenticated WITH CHECK (doctor_id=auth.uid()::text);
CREATE POLICY "doctor alert own update" ON public.doctor_alert_settings FOR UPDATE TO authenticated USING (doctor_id=auth.uid()::text) WITH CHECK (doctor_id=auth.uid()::text);
CREATE OR REPLACE FUNCTION public.reception_attendance(target_id text, arrived boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.appointments;
BEGIN
 SELECT * INTO a FROM public.appointments WHERE id=target_id FOR UPDATE;
 IF a.id IS NULL OR a.doctor_id IS DISTINCT FROM public.reception_doctor() OR NOT public.reception_can('checkIn') THEN RAISE EXCEPTION 'Arrival permission required for this doctor'; END IF;
 IF a.data->>'date'<>((now() AT TIME ZONE 'Africa/Tripoli')::date)::text OR a.data->>'type'<>'clinic' OR a.data->>'status' NOT IN ('Pending','Confirmed','Waiting','Checked-In') THEN RAISE EXCEPTION 'Only today''s pending clinic patients can be marked'; END IF;
 UPDATE public.appointments SET data=data||CASE WHEN arrived THEN jsonb_build_object('status','Waiting','checkedInAt',now()) ELSE jsonb_build_object('status','No Show') END WHERE id=target_id;
END $$;
REVOKE ALL ON FUNCTION public.reception_attendance(text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reception_attendance(text,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.cancel_doctor_day(target_date text, reason text) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.appointments; n integer:=0; msg text; nid text;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.doctors WHERE id=auth.uid()::text) THEN RAISE EXCEPTION 'Only doctors can cancel their day'; END IF;
 IF length(btrim(reason))<3 OR length(reason)>1000 THEN RAISE EXCEPTION 'Enter a cancellation reason (3–1000 characters)'; END IF;
 IF target_date::date<(now() AT TIME ZONE 'Africa/Tripoli')::date THEN RAISE EXCEPTION 'Choose today or a future date'; END IF;
 PERFORM 1 FROM public.availability WHERE id=auth.uid()::text FOR UPDATE;
 FOR a IN SELECT * FROM public.appointments WHERE doctor_id=auth.uid()::text AND data->>'date'=target_date AND data->>'status' IN ('Pending','Confirmed','Waiting','Checked-In','Ready to Join') ORDER BY id FOR UPDATE LOOP
  UPDATE public.appointments SET data=data||jsonb_build_object('status','Cancelled','cancelledBy','doctor','cancelReason',btrim(reason)) WHERE id=a.id;
  msg:='Your appointment '||coalesce(a.tracking_number,a.id)||' on '||target_date||' was cancelled. Reason: '||btrim(reason);
  IF a.data ? 'walkIn' THEN INSERT INTO public.message_outbox(phone,body,appointment_id) VALUES(a.data->'walkIn'->>'phone',msg,a.id);
  ELSE nid:=gen_random_uuid()::text; INSERT INTO public.notifications(id,user_id,data) VALUES(nid,a.patient_id,jsonb_build_object('id',nid,'userId',a.patient_id,'title','Appointment cancelled','body',msg,'at',now(),'read',false,'link','/patient/appointments/'||a.id)); END IF;
  n:=n+1;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.cancel_doctor_day(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_doctor_day(text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.queue_doctor_summary(target_doctor text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cfg public.doctor_alert_settings; day date:=(now() AT TIME ZONE 'Africa/Tripoli')::date; total integer; completed integer; waiting integer; discussions integer;
BEGIN
 SELECT * INTO cfg FROM public.doctor_alert_settings WHERE doctor_id=target_doctor FOR UPDATE;
 IF cfg.doctor_id IS NULL OR NOT cfg.enabled OR cfg.phone='' OR cfg.last_summary_date=day THEN RETURN; END IF;
 SELECT count(*) FILTER(WHERE data->>'status' NOT IN ('Cancelled','Rescheduled','Expired')),count(*) FILTER(WHERE data->>'status'='Completed'),count(*) FILTER(WHERE data->>'status' IN ('Pending','Confirmed','Waiting','Checked-In','Ready to Join')) INTO total,completed,waiting FROM public.appointments WHERE doctor_id=target_doctor AND data->>'date'=day::text;
 SELECT count(*) INTO discussions FROM public.lab_orders o WHERE o.doctor_id=target_doctor AND (SELECT max(created_at) FROM public.lab_messages WHERE order_id=o.id AND author_id=o.patient_id)>coalesce((SELECT max(created_at) FROM public.lab_messages WHERE order_id=o.id AND author_id=o.doctor_id),'-infinity'::timestamptz);
 INSERT INTO public.message_outbox(phone,body) VALUES(cfg.phone,'Sahoolat — '||day||': Today''s appointments: '||total||'. Completed: '||completed||'. Waiting: '||waiting||'. Patient discussions awaiting your reply: '||discussions||'.');
 UPDATE public.doctor_alert_settings SET last_summary_date=day WHERE doctor_id=target_doctor;
END $$;
REVOKE ALL ON FUNCTION public.queue_doctor_summary(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_doctor_summary(text) TO service_role;
CREATE OR REPLACE FUNCTION public.schedule_doctor_summary() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE job_name text:='doctor-stats-'||new.doctor_id; h integer; m integer;
BEGIN
 IF TG_OP='UPDATE' AND new.enabled=old.enabled AND new.daily_time=old.daily_time AND new.phone=old.phone THEN RETURN new; END IF;
 BEGIN PERFORM cron.unschedule(job_name); EXCEPTION WHEN OTHERS THEN NULL; END;
 IF new.enabled THEN
  IF new.phone !~ '^\+?[1-9][0-9]{9,14}$' THEN RAISE EXCEPTION 'Enter WhatsApp number with country code'; END IF;
  h:=mod(split_part(new.daily_time,':',1)::int+22,24); m:=split_part(new.daily_time,':',2)::int;
  PERFORM cron.schedule(job_name,m||' '||h||' * * *',format('SELECT public.queue_doctor_summary(%L)',new.doctor_id));
 END IF;
 RETURN new;
END $$;
CREATE TRIGGER schedule_doctor_summary AFTER INSERT OR UPDATE ON public.doctor_alert_settings FOR EACH ROW EXECUTE FUNCTION public.schedule_doctor_summary();
CREATE OR REPLACE FUNCTION public.queue_doctor_discussion_alert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.lab_orders; cfg public.doctor_alert_settings;
BEGIN
 SELECT * INTO o FROM public.lab_orders WHERE id=new.order_id;
 IF new.author_id<>o.patient_id THEN RETURN new; END IF;
 SELECT * INTO cfg FROM public.doctor_alert_settings WHERE doctor_id=o.doctor_id;
 IF cfg.discussion_alerts AND cfg.phone ~ '^\+?[1-9][0-9]{9,14}$' THEN INSERT INTO public.message_outbox(phone,body,appointment_id) VALUES(cfg.phone,'Sahoolat — A patient sent a new message about '||(o.data->>'tests')||'. Open Discussions to reply.',o.appointment_id); END IF;
 RETURN new;
END $$;
CREATE TRIGGER queue_doctor_discussion_alert AFTER INSERT ON public.lab_messages FOR EACH ROW EXECUTE FUNCTION public.queue_doctor_discussion_alert();

-- Require complete pricing and details for laboratory test catalogues.
CREATE OR REPLACE FUNCTION public.validate_lab_test_details() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE item jsonb;
BEGIN
 IF TG_OP = 'UPDATE' AND NEW.data->'testCatalogue' IS NOT DISTINCT FROM OLD.data->'testCatalogue' THEN RETURN NEW; END IF;
 IF NOT (NEW.data ? 'testCatalogue') THEN RETURN NEW; END IF;
 IF jsonb_typeof(NEW.data->'testCatalogue') <> 'array' THEN RAISE EXCEPTION 'Test catalogue must be a list'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(NEW.data->'testCatalogue') LOOP
  IF jsonb_typeof(item) <> 'object' OR coalesce(btrim(item->>'name'),'') = '' OR coalesce(btrim(item->>'details'),'') = '' OR coalesce(btrim(item->>'turnaround'),'') = '' THEN RAISE EXCEPTION 'Test name, details and report turnaround time are required'; END IF;
  IF jsonb_typeof(item->'price') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'A positive test price is required'; END IF;
  IF (item->>'price')::numeric <= 0 THEN RAISE EXCEPTION 'A positive test price is required'; END IF;
 END LOOP;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.data->'testCatalogue') t GROUP BY lower(btrim(t->>'name')) HAVING count(*) > 1) THEN RAISE EXCEPTION 'Duplicate test names are not allowed'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_lab_test_details BEFORE INSERT OR UPDATE ON public.labs FOR EACH ROW EXECUTE FUNCTION public.validate_lab_test_details();


CREATE TABLE public.user_roles(user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,role text NOT NULL CHECK(role IN ('patient','doctor','admin','lab','pharmacy','receptionist'))); GRANT SELECT ON public.user_roles TO authenticated; GRANT ALL ON public.user_roles TO service_role; ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY; CREATE POLICY roles_own ON public.user_roles FOR SELECT TO authenticated USING(user_id=auth.uid()); INSERT INTO public.user_roles SELECT p.id::uuid,p.role FROM public.profiles p JOIN auth.users u ON u.id::text=p.id;
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin') $$;
CREATE OR REPLACE FUNCTION public.sync_profile_role() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF EXISTS(SELECT 1 FROM auth.users WHERE id::text=new.id) THEN INSERT INTO public.user_roles VALUES(new.id::uuid,new.role) ON CONFLICT(user_id) DO UPDATE SET role=excluded.role; END IF; RETURN new; END $$; CREATE TRIGGER sync_profile_role AFTER INSERT OR UPDATE OF role ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.sync_profile_role();
CREATE TABLE public.care_items(id text PRIMARY KEY,owner_id text NOT NULL,recipient_id text,kind text NOT NULL,data jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now()); GRANT SELECT,INSERT,UPDATE ON public.care_items TO authenticated; GRANT ALL ON public.care_items TO service_role; ALTER TABLE public.care_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY care_read ON public.care_items FOR SELECT TO authenticated USING(owner_id=auth.uid()::text OR recipient_id=auth.uid()::text OR public.is_admin() OR (kind IN ('branch','package','home_collection') AND data->>'published'='true'));
CREATE POLICY care_insert ON public.care_items FOR INSERT TO authenticated WITH CHECK(owner_id=auth.uid()::text);
CREATE POLICY care_update ON public.care_items FOR UPDATE TO authenticated USING(owner_id=auth.uid()::text OR recipient_id=auth.uid()::text OR public.is_admin()) WITH CHECK(owner_id=auth.uid()::text OR recipient_id=auth.uid()::text OR public.is_admin());
CREATE OR REPLACE FUNCTION public.guard_care_item() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN IF TG_OP='UPDATE' THEN IF new.owner_id<>old.owner_id OR new.kind<>old.kind OR new.recipient_id IS DISTINCT FROM old.recipient_id THEN RAISE EXCEPTION 'Ownership cannot change'; END IF; IF new.kind='credential' AND NOT public.is_admin() AND new.data->>'status' IS DISTINCT FROM old.data->>'status' THEN RAISE EXCEPTION 'Admin review required'; END IF; IF new.kind='reservation' AND auth.uid()::text<>old.recipient_id AND NOT public.is_admin() AND new.data->>'status' IS DISTINCT FROM old.data->>'status' AND new.data->>'status'<>'Cancelled' THEN RAISE EXCEPTION 'Pharmacy confirmation required'; END IF; ELSE IF new.kind='credential' AND coalesce(new.data->>'status','Pending')<>'Pending' THEN RAISE EXCEPTION 'Admin review required'; END IF; END IF; RETURN new; END $$; CREATE TRIGGER guard_care_item BEFORE INSERT OR UPDATE ON public.care_items FOR EACH ROW EXECUTE FUNCTION public.guard_care_item();
CREATE TABLE public.medical_safety(patient_id text NOT NULL,member_id text NOT NULL DEFAULT '',data jsonb NOT NULL DEFAULT '{}',PRIMARY KEY(patient_id,member_id)); GRANT SELECT,INSERT,UPDATE ON public.medical_safety TO authenticated; GRANT ALL ON public.medical_safety TO service_role; ALTER TABLE public.medical_safety ENABLE ROW LEVEL SECURITY; CREATE POLICY safety_read ON public.medical_safety FOR SELECT TO authenticated USING(patient_id=auth.uid()::text OR public.has_report_access(patient_id)); CREATE POLICY safety_write ON public.medical_safety FOR ALL TO authenticated USING(patient_id=auth.uid()::text) WITH CHECK(patient_id=auth.uid()::text);
CREATE TABLE public.activity_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id text,subject_id text,resource text NOT NULL,action text NOT NULL,record_id text,created_at timestamptz NOT NULL DEFAULT now()); GRANT SELECT ON public.activity_log TO authenticated; GRANT ALL ON public.activity_log TO service_role; ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY; CREATE POLICY activity_read ON public.activity_log FOR SELECT TO authenticated USING(actor_id=auth.uid()::text OR subject_id=auth.uid()::text OR public.is_admin());
CREATE OR REPLACE FUNCTION public.audit_app_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE r jsonb:=to_jsonb(new); BEGIN INSERT INTO public.activity_log(actor_id,subject_id,resource,action,record_id) VALUES(auth.uid()::text,coalesce(r->>'patient_id',r->>'owner_id',r->>'doctor_id',r->>'id'),TG_TABLE_NAME,TG_OP,r->>'id'); RETURN new; END $$; CREATE TRIGGER audit_appointments AFTER INSERT OR UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.audit_app_change(); CREATE TRIGGER audit_consultations AFTER INSERT OR UPDATE ON public.consultations FOR EACH ROW EXECUTE FUNCTION public.audit_app_change(); CREATE TRIGGER audit_lab_orders AFTER INSERT OR UPDATE ON public.lab_orders FOR EACH ROW EXECUTE FUNCTION public.audit_app_change(); CREATE TRIGGER audit_care_items AFTER INSERT OR UPDATE ON public.care_items FOR EACH ROW EXECUTE FUNCTION public.audit_app_change();

CREATE POLICY safety_doctor_sharing ON public.medical_safety AS RESTRICTIVE FOR SELECT TO authenticated USING(patient_id=auth.uid()::text OR coalesce((data->>'sharing')::boolean,true));
CREATE OR REPLACE FUNCTION public.record_document_access(document_id text,access_action text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE pid text; BEGIN IF auth.uid() IS NULL OR access_action NOT IN ('Preview','Download') THEN RAISE EXCEPTION 'Not allowed'; END IF; SELECT patient_id INTO pid FROM (SELECT patient_id,data FROM public.appointments UNION ALL SELECT patient_id,data FROM public.consultations UNION ALL SELECT patient_id,data FROM public.lab_orders) r WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(r.data->'documents','[]')) d WHERE d->>'id'=document_id) LIMIT 1; IF pid IS NULL OR NOT(pid=auth.uid()::text OR public.has_report_access(pid) OR public.is_admin()) THEN RAISE EXCEPTION 'Document access denied'; END IF; INSERT INTO public.activity_log(actor_id,subject_id,resource,action,record_id) VALUES(auth.uid()::text,pid,'documents',access_action,document_id); END $$; GRANT EXECUTE ON FUNCTION public.record_document_access(text,text) TO authenticated; REVOKE EXECUTE ON FUNCTION public.record_document_access(text,text) FROM anon;
CREATE OR REPLACE FUNCTION public.admin_second_factor_ready() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT NOT EXISTS(SELECT 1 FROM auth.mfa_factors WHERE user_id=auth.uid() AND status='verified') OR auth.jwt()->>'aal'='aal2' $$;
CREATE POLICY admin_care_second_factor ON public.care_items AS RESTRICTIVE FOR UPDATE TO authenticated USING(NOT public.is_admin() OR public.admin_second_factor_ready());
CREATE POLICY admin_recording_second_factor ON public.call_recordings AS RESTRICTIVE FOR SELECT TO authenticated USING(NOT public.is_admin() OR public.admin_second_factor_ready());
CREATE OR REPLACE FUNCTION public.guard_lab_progress() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN IF auth.uid() IS NOT NULL AND auth.uid()::text<>old.lab_id AND NOT public.is_admin() THEN IF new.data->'sampleStage' IS DISTINCT FROM old.data->'sampleStage' OR new.data->'reviewedBy' IS DISTINCT FROM old.data->'reviewedBy' OR new.data->'criticalNote' IS DISTINCT FROM old.data->'criticalNote' THEN RAISE EXCEPTION 'Only the lab can update processing'; END IF; IF new.data->'criticalAcknowledgedAt' IS DISTINCT FROM old.data->'criticalAcknowledgedAt' AND auth.uid()::text<>old.doctor_id THEN RAISE EXCEPTION 'Only prescribing doctor can acknowledge'; END IF; END IF; RETURN new; END $$; CREATE TRIGGER guard_lab_progress BEFORE UPDATE ON public.lab_orders FOR EACH ROW EXECUTE FUNCTION public.guard_lab_progress();

CREATE OR REPLACE FUNCTION public.guard_care_item() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ DECLARE caller_role text; BEGIN SELECT role INTO caller_role FROM public.user_roles WHERE user_id=auth.uid(); IF auth.uid() IS NULL THEN RETURN new; END IF; IF new.kind NOT IN ('favorite','waitlist','template','referral','branch','complaint','credential','reservation','home_collection','package','consent') THEN RAISE EXCEPTION 'Invalid care service'; END IF; IF coalesce(btrim(new.data->>'title'),'')='' THEN RAISE EXCEPTION 'Name or title required'; END IF; IF TG_OP='UPDATE' THEN IF new.owner_id<>old.owner_id OR new.kind<>old.kind OR new.recipient_id IS DISTINCT FROM old.recipient_id THEN RAISE EXCEPTION 'Ownership cannot change'; END IF; IF new.kind='credential' AND NOT public.is_admin() AND new.data->>'status' IS DISTINCT FROM old.data->>'status' AND new.data->>'status'<>'Archived' THEN RAISE EXCEPTION 'Admin review required'; END IF; IF new.kind='reservation' AND auth.uid()::text<>old.recipient_id AND NOT public.is_admin() AND new.data->>'status' IS DISTINCT FROM old.data->>'status' AND new.data->>'status' NOT IN ('Cancelled','Archived') THEN RAISE EXCEPTION 'Pharmacy confirmation required'; END IF; ELSE IF new.kind='credential' AND coalesce(new.data->>'status','Pending')<>'Pending' THEN RAISE EXCEPTION 'Admin review required'; END IF; IF new.kind IN ('template','referral','branch') AND caller_role<>'doctor' THEN RAISE EXCEPTION 'Doctor account required'; END IF; IF new.kind IN ('package','home_collection') AND caller_role<>'lab' THEN RAISE EXCEPTION 'Lab account required'; END IF; IF new.kind IN ('favorite','waitlist','reservation') AND caller_role<>'patient' THEN RAISE EXCEPTION 'Patient account required'; END IF; IF new.kind='waitlist' AND NOT EXISTS(SELECT 1 FROM public.doctors WHERE id=new.recipient_id) THEN RAISE EXCEPTION 'Choose a doctor'; END IF; IF new.kind='reservation' AND NOT EXISTS(SELECT 1 FROM public.pharmacies WHERE id=new.recipient_id) THEN RAISE EXCEPTION 'Choose a pharmacy'; END IF; END IF; RETURN new; END $$;
CREATE OR REPLACE FUNCTION public.notify_waitlist_opening() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE r record; nid text; BEGIN IF new.data->>'status' NOT IN ('Cancelled','Rescheduled','No Show') OR old.data->>'status' IN ('Cancelled','Rescheduled','No Show') THEN RETURN new; END IF; FOR r IN SELECT * FROM public.care_items WHERE kind='waitlist' AND recipient_id=new.doctor_id AND data->>'date'=new.data->>'date' AND data->>'status'='Waiting' LOOP UPDATE public.care_items SET data=data||jsonb_build_object('status','Offered') WHERE id=r.id; nid:=gen_random_uuid()::text; INSERT INTO public.notifications(id,user_id,data) VALUES(nid,r.owner_id,jsonb_build_object('id',nid,'userId',r.owner_id,'title','Appointment place available','body','A place may now be available on '||(new.data->>'date')||'. Book to confirm; your waitlist does not reserve a place.','at',now(),'read',false,'link','/patient/book/'||new.doctor_id)); END LOOP; RETURN new; END $$; CREATE TRIGGER notify_waitlist_opening AFTER UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.notify_waitlist_opening();
CREATE OR REPLACE FUNCTION public.guard_medicine_stock() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN IF new.data ? 'quantity' AND (new.data->>'quantity' !~ '^[0-9]+$') THEN RAISE EXCEPTION 'Quantity must be a non-negative integer'; END IF; IF new.data ? 'expiry' AND coalesce(new.data->>'expiry','')<>'' AND new.data->>'expiry' !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Invalid expiry date'; END IF; RETURN new; END $$; CREATE TRIGGER guard_medicine_stock BEFORE INSERT OR UPDATE ON public.medicines FOR EACH ROW EXECUTE FUNCTION public.guard_medicine_stock();

CREATE OR REPLACE FUNCTION public.alert_care_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE who text;nid text;BEGIN IF TG_OP='UPDATE' AND new.data IS NOT DISTINCT FROM old.data THEN RETURN new;END IF;IF new.kind NOT IN ('referral','reservation','complaint') THEN RETURN new;END IF;who:=CASE WHEN auth.uid()::text=new.owner_id THEN new.recipient_id ELSE new.owner_id END;IF who IS NULL THEN RETURN new;END IF;nid:=gen_random_uuid()::text;INSERT INTO public.notifications(id,user_id,data) VALUES(nid,who,jsonb_build_object('id',nid,'userId',who,'title',initcap(new.kind)||' update','body',coalesce(new.data->>'title',new.kind)||' — '||coalesce(new.data->>'status','New'),'at',now(),'read',false,'link','/'));RETURN new;END $$;CREATE TRIGGER alert_care_change AFTER INSERT OR UPDATE ON public.care_items FOR EACH ROW EXECUTE FUNCTION public.alert_care_change();
CREATE OR REPLACE FUNCTION public.alert_lab_priority() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE nid text;BEGIN IF new.data->>'criticalNote' IS DISTINCT FROM old.data->>'criticalNote' AND coalesce(new.data->>'criticalNote','')<>'' THEN nid:=gen_random_uuid()::text;INSERT INTO public.notifications(id,user_id,data) VALUES(nid,new.doctor_id,jsonb_build_object('id',nid,'userId',new.doctor_id,'title','Priority lab review required','body',(new.data->>'tests')||': '||(new.data->>'criticalNote'),'at',now(),'read',false,'link','/doctor/labs'));END IF;RETURN new;END $$;CREATE TRIGGER alert_lab_priority AFTER UPDATE ON public.lab_orders FOR EACH ROW EXECUTE FUNCTION public.alert_lab_priority();
CREATE POLICY recording_consent_required ON public.call_recordings AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(EXISTS(SELECT 1 FROM public.care_items WHERE owner_id=auth.uid()::text AND kind='consent' AND data->>'appointmentId'=appointment_id AND data->>'status'='Granted'));
CREATE POLICY admin_file_second_factor ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING(NOT public.is_admin() OR public.admin_second_factor_ready());
COMMENT ON COLUMN public.profiles.role IS 'Legacy display mirror; authorization source is public.user_roles.';

CREATE OR REPLACE FUNCTION public.guard_prescription_reservation() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ DECLARE m jsonb; BEGIN IF new.kind<>'reservation' OR auth.uid() IS NULL THEN RETURN new; END IF; IF TG_OP='INSERT' THEN SELECT data INTO m FROM public.medicines WHERE id=new.data->>'medicineId' AND pharmacy_id=new.recipient_id; IF m IS NULL THEN RAISE EXCEPTION 'Choose a listed medicine'; END IF; IF coalesce((m->>'prescriptionRequired')::boolean,false) THEN IF NOT EXISTS(SELECT 1 FROM public.consultations WHERE id=new.data->>'appointmentId' AND patient_id=auth.uid()::text AND jsonb_array_length(coalesce(data->'prescription','[]'))>0) THEN RAISE EXCEPTION 'Your doctor prescription is required'; END IF; END IF; new.data:=new.data||jsonb_build_object('prescriptionRequired',coalesce((m->>'prescriptionRequired')::boolean,false)); ELSE IF new.data->>'medicineId' IS DISTINCT FROM old.data->>'medicineId' OR new.data->>'appointmentId' IS DISTINCT FROM old.data->>'appointmentId' OR new.data->'prescriptionRequired' IS DISTINCT FROM old.data->'prescriptionRequired' THEN RAISE EXCEPTION 'Reservation prescription details cannot change'; END IF; END IF; RETURN new; END $$; CREATE TRIGGER guard_prescription_reservation BEFORE INSERT OR UPDATE ON public.care_items FOR EACH ROW EXECUTE FUNCTION public.guard_prescription_reservation();

ALTER TABLE public.call_recordings ADD COLUMN expires_at timestamptz; UPDATE public.call_recordings SET expires_at=created_at+interval '1 month' WHERE expires_at IS NULL; ALTER TABLE public.call_recordings ALTER COLUMN expires_at SET NOT NULL; CREATE OR REPLACE FUNCTION public.set_recording_expiry() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN new.created_at:=now(); new.expires_at:=new.created_at+interval '1 month'; RETURN new; END $$; CREATE TRIGGER set_recording_expiry BEFORE INSERT ON public.call_recordings FOR EACH ROW EXECUTE FUNCTION public.set_recording_expiry(); CREATE INDEX call_recordings_expiry ON public.call_recordings(expires_at); CREATE POLICY recording_not_expired ON public.call_recordings AS RESTRICTIVE FOR SELECT TO authenticated USING(expires_at>now()); CREATE POLICY recording_file_not_expired ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING(bucket_id<>'recordings' OR EXISTS(SELECT 1 FROM public.call_recordings r WHERE r.path=name AND r.expires_at>now()));
-- Tightened read rules (profiles, appointments, notifications) + anonymous queue positions
create or replace function public.can_view_profile(target text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    target = auth.uid()::text
    or public.is_admin()
    or exists (select 1 from public.profiles p where p.id = target and p.role in ('doctor','lab','pharmacy','admin'))
    or exists (select 1 from public.appointments a where (a.patient_id = auth.uid()::text and a.doctor_id = target) or (a.doctor_id = auth.uid()::text and a.patient_id = target) or (a.doctor_id = public.reception_doctor() and a.patient_id = target))
    or exists (select 1 from public.lab_orders o where (o.lab_id = auth.uid()::text and target in (o.patient_id, o.doctor_id)) or (auth.uid()::text in (o.patient_id, o.doctor_id) and target in (o.lab_id, o.patient_id, o.doctor_id)))
    or exists (select 1 from public.receptionists r where (r.id = auth.uid()::text and r.doctor_id = target) or (r.doctor_id = auth.uid()::text and r.id = target))
    or exists (select 1 from public.care_items c where (c.owner_id = auth.uid()::text and c.recipient_id = target) or (c.recipient_id = auth.uid()::text and c.owner_id = target))
    or exists (select 1 from public.volunteer_bookings b join public.volunteer_sessions s on s.id = b.session_id where (s.doctor_id = auth.uid()::text and b.patient_id = target) or (b.patient_id = auth.uid()::text and s.doctor_id = target))
  )
$$;
revoke execute on function public.can_view_profile(text) from public, anon;
grant execute on function public.can_view_profile(text) to authenticated;

drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated using (public.can_view_profile(id));

drop policy if exists "notifications insert" on public.notifications;
create policy "notifications insert" on public.notifications for insert to authenticated
  with check (user_id = auth.uid()::text or public.is_admin() or public.can_view_profile(user_id));

drop policy if exists "appointments read" on public.appointments;
create policy "appointments read" on public.appointments for select to authenticated using (
  patient_id = auth.uid()::text or doctor_id = auth.uid()::text or public.is_admin() or doctor_id = public.reception_doctor()
  or exists (select 1 from public.lab_orders o where o.appointment_id = appointments.id and o.lab_id = auth.uid()::text));

-- Queue view for patients: anonymous positions only, for days they are booked with a doctor.
create or replace function public.queue_peers() returns table(id text, doctor_id text, data jsonb)
language sql stable security definer set search_path = public as $$
  select 'q-' || md5(a.id), a.doctor_id, jsonb_build_object('doctorId', a.doctor_id, 'clinicId', a.data->'clinicId', 'date', a.data->'date',
    'time', a.data->'time', 'type', a.data->'type', 'status', a.data->'status', 'queueNumber', a.data->'queueNumber', 'queueOrder', a.data->'queueOrder')
  from public.appointments a
  where a.patient_id <> auth.uid()::text and exists (select 1 from public.appointments m where m.patient_id = auth.uid()::text
    and m.doctor_id = a.doctor_id and m.data->>'date' = a.data->>'date')
$$;
revoke execute on function public.queue_peers() from public, anon;
grant execute on function public.queue_peers() to authenticated;create or replace function public.can_view_profile(target text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    target = auth.uid()::text
    or public.is_admin()
    or exists (select 1 from public.profiles p where p.id = target and p.role in ('doctor','lab','pharmacy','admin'))
    or exists (select 1 from public.reviews rv where rv.patient_id = target)
    or exists (select 1 from public.appointments a where (a.patient_id = auth.uid()::text and a.doctor_id = target) or (a.doctor_id = auth.uid()::text and a.patient_id = target) or (a.doctor_id = public.reception_doctor() and a.patient_id = target))
    or exists (select 1 from public.lab_orders o where (o.lab_id = auth.uid()::text and target in (o.patient_id, o.doctor_id)) or (auth.uid()::text in (o.patient_id, o.doctor_id) and target in (o.lab_id, o.patient_id, o.doctor_id)))
    or exists (select 1 from public.receptionists r where (r.id = auth.uid()::text and r.doctor_id = target) or (r.doctor_id = auth.uid()::text and r.id = target))
    or exists (select 1 from public.care_items c where (c.owner_id = auth.uid()::text and c.recipient_id = target) or (c.recipient_id = auth.uid()::text and c.owner_id = target))
    or exists (select 1 from public.volunteer_bookings b join public.volunteer_sessions s on s.id = b.session_id where (s.doctor_id = auth.uid()::text and b.patient_id = target) or (b.patient_id = auth.uid()::text and s.doctor_id = target))
  )
$$;drop policy if exists "settings read" on public.settings;
create policy "settings read" on public.settings for select to anon, authenticated using (id = 'global' or public.is_admin());