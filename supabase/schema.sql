-- Sahoolat schema for self-hosted Supabase. Run once in the SQL Editor.
-- Each table keeps the app object in `data` (jsonb) plus key columns used by security rules.

create table if not exists public.profiles (id text primary key, role text not null default 'patient' check (role in ('patient','doctor','admin','pharmacy')), data jsonb not null default '{}');
create table if not exists public.doctors (id text primary key references public.profiles(id) on delete cascade, data jsonb not null default '{}');
create table if not exists public.patients (id text primary key references public.profiles(id) on delete cascade, data jsonb not null default '{}');
create table if not exists public.availability (id text primary key references public.profiles(id) on delete cascade, data jsonb not null default '{}');
create table if not exists public.appointments (id text primary key, doctor_id text not null, patient_id text not null, data jsonb not null default '{}');
create table if not exists public.consultations (id text primary key, doctor_id text not null, patient_id text not null, data jsonb not null default '{}');
create table if not exists public.notifications (id text primary key, user_id text not null, data jsonb not null default '{}');
create table if not exists public.reviews (id text primary key, doctor_id text not null, patient_id text not null, data jsonb not null default '{}');
create table if not exists public.settings (id text primary key, data jsonb not null default '{}');

grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.doctors, public.availability, public.reviews, public.settings to anon;
grant select, insert, update, delete on public.profiles, public.doctors, public.patients, public.availability, public.appointments, public.consultations, public.notifications, public.reviews, public.settings to authenticated;
grant all on public.profiles, public.doctors, public.patients, public.availability, public.appointments, public.consultations, public.notifications, public.reviews, public.settings to service_role;

insert into public.settings (id, data) values ('global', '{"doctorVerification":true,"checkInMethods":{"appointmentId":true,"phone":true},"joinWindowMinutes":10,"allowedFileTypes":["pdf","jpg","jpeg","png"],"turnApproachingAhead":1}')
on conflict (id) do nothing;

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid()::text and role = 'admin');
$$;

-- Create profile rows from signup metadata (role limited to patient/doctor).
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}');
  r text := case when m->>'role' = 'doctor' then 'doctor' else 'patient' end;
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
  else
    insert into public.patients (id, data) values (uid, coalesce(m->'profile', '{}') || jsonb_build_object('userId', uid));
  end if;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Non-admins cannot change their own role / active flag, or a doctor's verification.
create or replace function public.guard_profile() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.role := old.role;
    new.data := jsonb_set(jsonb_set(new.data, '{role}', to_jsonb(old.role)), '{active}', coalesce(old.data->'active', 'true'));
  end if;
  return new;
end $$;
drop trigger if exists guard_profile on public.profiles;
create trigger guard_profile before update on public.profiles for each row execute function public.guard_profile();

create or replace function public.guard_doctor() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.data := jsonb_set(new.data, '{verification}', coalesce(old.data->'verification', '"Pending Verification"'));
  end if;
  return new;
end $$;
drop trigger if exists guard_doctor on public.doctors;
create trigger guard_doctor before update on public.doctors for each row execute function public.guard_doctor();

alter table public.profiles enable row level security;
alter table public.doctors enable row level security;
alter table public.patients enable row level security;
alter table public.availability enable row level security;
alter table public.appointments enable row level security;
alter table public.consultations enable row level security;
alter table public.notifications enable row level security;
alter table public.reviews enable row level security;
alter table public.settings enable row level security;

create policy "profiles public doctors" on public.profiles for select to anon using (role = 'doctor');
create policy "profiles read" on public.profiles for select to authenticated using (true);
create policy "profiles update" on public.profiles for update to authenticated using (id = auth.uid()::text or public.is_admin());

create policy "doctors read" on public.doctors for select to anon, authenticated using (true);
create policy "doctors update" on public.doctors for update to authenticated using (id = auth.uid()::text or public.is_admin());

create policy "patients read" on public.patients for select to authenticated using (
  id = auth.uid()::text or public.is_admin()
  or exists (select 1 from public.appointments a where a.patient_id = patients.id and a.doctor_id = auth.uid()::text));
create policy "patients update" on public.patients for update to authenticated using (id = auth.uid()::text or public.is_admin());

create policy "availability read" on public.availability for select to anon, authenticated using (true);
create policy "availability write" on public.availability for insert to authenticated with check (id = auth.uid()::text or public.is_admin());
create policy "availability update" on public.availability for update to authenticated using (id = auth.uid()::text or public.is_admin());

-- Signed-in users can read appointments so booked slots and queue positions are correct.
create policy "appointments read" on public.appointments for select to authenticated using (true);
create policy "appointments insert" on public.appointments for insert to authenticated with check (patient_id = auth.uid()::text or public.is_admin());
create policy "appointments update" on public.appointments for update to authenticated using (
  patient_id = auth.uid()::text or doctor_id = auth.uid()::text or public.is_admin());

create policy "consultations read" on public.consultations for select to authenticated using (
  patient_id = auth.uid()::text or doctor_id = auth.uid()::text or public.is_admin());
create policy "consultations insert" on public.consultations for insert to authenticated with check (
  patient_id = auth.uid()::text or doctor_id = auth.uid()::text or public.is_admin());
create policy "consultations update" on public.consultations for update to authenticated using (doctor_id = auth.uid()::text or public.is_admin());

create policy "notifications read" on public.notifications for select to authenticated using (user_id = auth.uid()::text);
create policy "notifications insert" on public.notifications for insert to authenticated with check (true);
create policy "notifications update" on public.notifications for update to authenticated using (user_id = auth.uid()::text);

create policy "reviews read" on public.reviews for select to anon, authenticated using (true);
create policy "reviews insert" on public.reviews for insert to authenticated with check (patient_id = auth.uid()::text);

create policy "settings read" on public.settings for select to anon, authenticated using (true);
create policy "settings update" on public.settings for update to authenticated using (public.is_admin());

-- Make an admin: sign up normally, then run (replace the email):
-- update public.profiles set role = 'admin', data = jsonb_set(data, '{role}', '"admin"') where data->>'email' = 'you@example.com';
CREATE OR REPLACE FUNCTION public.renumber_queue() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
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
