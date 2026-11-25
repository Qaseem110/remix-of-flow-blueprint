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
-- Uploaded Care corrections
CREATE OR REPLACE FUNCTION public.allocate_volunteer_token() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s jsonb; used integer; nxt integer;
BEGIN
 SELECT data INTO s FROM public.volunteer_sessions WHERE id=new.session_id FOR UPDATE;
 IF s IS NULL THEN RAISE EXCEPTION 'Volunteer session not found'; END IF;
 IF TG_OP='UPDATE' THEN
  IF auth.uid() IS NOT NULL AND auth.uid()::text=old.patient_id AND auth.uid()::text<>public.volunteer_session_doctor(old.session_id) AND new.data->>'status' NOT IN ('Booked','Cancelled') THEN RAISE EXCEPTION 'Only the doctor can update the visit'; END IF;
  IF auth.uid()::text=old.patient_id AND new.data->>'status'='Booked' AND old.data->>'status'<>'Booked' THEN RAISE EXCEPTION 'Only the doctor can reopen a visit'; END IF;
  new.data:=new.data||jsonb_build_object('token',old.data->'token'); new.patient_id:=old.patient_id; new.session_id:=old.session_id;
 ELSE
  IF coalesce(s->>'status','Open')<>'Open' THEN RAISE EXCEPTION 'This free checkup session is not open'; END IF;
  IF ((s->>'date')::date + (s->>'end')::time) AT TIME ZONE 'Africa/Tripoli' <= now() THEN RAISE EXCEPTION 'This session has ended'; END IF;
  IF EXISTS (SELECT 1 FROM public.volunteer_bookings b WHERE b.session_id=new.session_id AND b.patient_id=new.patient_id AND b.data->>'status'<>'Cancelled') THEN RAISE EXCEPTION 'You already booked this session'; END IF;
  SELECT count(*) INTO used FROM public.volunteer_bookings b WHERE b.session_id=new.session_id AND b.data->>'status'<>'Cancelled';
  IF used>=coalesce((s->>'capacity')::int,0) THEN RAISE EXCEPTION 'All free spots in this session are taken'; END IF;
  SELECT coalesce(max((b.data->>'token')::int),0)+1 INTO nxt FROM public.volunteer_bookings b WHERE b.session_id=new.session_id;
  new.data:=new.data||jsonb_build_object('token',nxt,'status','Booked');
 END IF;
 RETURN new;
END $$;

CREATE OR REPLACE FUNCTION public.guard_care_item() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ DECLARE caller_role text; BEGIN SELECT role INTO caller_role FROM public.user_roles WHERE user_id=auth.uid(); IF auth.uid() IS NULL THEN RETURN new; END IF; IF new.kind NOT IN ('favorite','waitlist','template','referral','branch','complaint','credential','reservation','home_collection','package','consent') THEN RAISE EXCEPTION 'Invalid care service'; END IF; IF coalesce(btrim(new.data->>'title'),'')='' THEN RAISE EXCEPTION 'Name or title required'; END IF; IF TG_OP='UPDATE' THEN IF new.owner_id<>old.owner_id OR new.kind<>old.kind OR new.recipient_id IS DISTINCT FROM old.recipient_id THEN RAISE EXCEPTION 'Ownership cannot change'; END IF; IF new.kind='credential' AND NOT public.is_admin() AND new.data->>'status' IS DISTINCT FROM old.data->>'status' AND new.data->>'status'<>'Archived' THEN RAISE EXCEPTION 'Admin review required'; END IF; IF new.kind='reservation' AND auth.uid()::text<>old.recipient_id AND NOT public.is_admin() AND new.data->>'status' IS DISTINCT FROM old.data->>'status' AND new.data->>'status' NOT IN ('Cancelled','Archived') THEN RAISE EXCEPTION 'Pharmacy confirmation required'; END IF; ELSE IF new.kind='credential' AND coalesce(new.data->>'status','Pending')<>'Pending' THEN RAISE EXCEPTION 'Admin review required'; END IF; IF new.kind IN ('template','referral','branch') AND caller_role<>'doctor' THEN RAISE EXCEPTION 'Doctor account required'; END IF; IF new.kind IN ('package','home_collection') AND caller_role<>'lab' THEN RAISE EXCEPTION 'Lab account required'; END IF; IF new.kind IN ('waitlist','reservation') AND caller_role<>'patient' THEN RAISE EXCEPTION 'Patient account required'; END IF; IF new.kind='waitlist' AND NOT EXISTS(SELECT 1 FROM public.doctors WHERE id=new.recipient_id) THEN RAISE EXCEPTION 'Choose a doctor'; END IF; IF new.kind='reservation' AND NOT EXISTS(SELECT 1 FROM public.pharmacies WHERE id=new.recipient_id) THEN RAISE EXCEPTION 'Choose a pharmacy'; END IF; END IF; RETURN new; END $$;
CREATE OR REPLACE FUNCTION public.guard_reservation_quantity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m jsonb;
BEGIN
 IF new.kind='reservation' THEN
  SELECT data INTO m FROM public.medicines WHERE id=new.data->>'medicineId' AND pharmacy_id=new.recipient_id FOR UPDATE;
  IF coalesce(new.data->>'quantity','') !~ '^[1-9][0-9]*$' THEN RAISE EXCEPTION 'Enter a positive whole quantity'; END IF;
  IF TG_OP='INSERT' THEN
   IF m IS NULL OR coalesce((m->>'inStock')::boolean,false)=false OR (m ? 'expiry' AND m->>'expiry'<((now() AT TIME ZONE 'Africa/Tripoli')::date)::text) THEN RAISE EXCEPTION 'Medicine is unavailable'; END IF;
   IF m ? 'quantity' AND (new.data->>'quantity')::integer>(m->>'quantity')::integer THEN RAISE EXCEPTION 'Requested quantity exceeds available stock'; END IF;
   IF EXISTS(SELECT 1 FROM public.care_items c WHERE c.kind='reservation' AND c.owner_id=new.owner_id AND c.recipient_id=new.recipient_id AND c.data->>'medicineId'=new.data->>'medicineId' AND coalesce(c.data->>'memberId','')=coalesce(new.data->>'memberId','') AND coalesce(c.data->>'status','Requested') NOT IN ('Cancelled','Archived','Unavailable','Collected')) THEN RAISE EXCEPTION 'This medicine is already reserved'; END IF;
  ELSE
   IF new.data->'quantity' IS DISTINCT FROM old.data->'quantity' OR new.data->'memberId' IS DISTINCT FROM old.data->'memberId' THEN RAISE EXCEPTION 'Reservation quantity and patient cannot change'; END IF;
  END IF;
 END IF;
 RETURN new;
END $$;
CREATE TRIGGER guard_reservation_quantity BEFORE INSERT OR UPDATE ON public.care_items FOR EACH ROW EXECUTE FUNCTION public.guard_reservation_quantity();
CREATE OR REPLACE FUNCTION public.alert_low_stock() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE nid text;
BEGIN
 IF new.data ? 'lowStock' AND coalesce(new.data->>'lowStock','') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Low-stock threshold must be a non-negative integer'; END IF;
 IF new.data ? 'quantity' AND (new.data->>'quantity')::integer<=coalesce((new.data->>'lowStock')::integer,5) THEN
  IF TG_OP='INSERT' OR NOT(old.data ? 'quantity') OR (old.data->>'quantity')::integer>coalesce((old.data->>'lowStock')::integer,5) OR new.data->>'lowStock' IS DISTINCT FROM old.data->>'lowStock' THEN
   nid:=gen_random_uuid()::text;
   INSERT INTO public.notifications(id,user_id,data) VALUES(nid,new.pharmacy_id,jsonb_build_object('id',nid,'userId',new.pharmacy_id,'title','Medicine running low','body',(new.data->>'name')||': '||(new.data->>'quantity')||' left — out of stock soon.','at',now(),'read',false,'link','/pharmacy'));
  END IF;
 END IF;
 RETURN new;
END $$;
CREATE TRIGGER alert_low_stock AFTER INSERT OR UPDATE ON public.medicines FOR EACH ROW EXECUTE FUNCTION public.alert_low_stock();
CREATE TABLE public.medicine_searches(user_id uuid NOT NULL,term text NOT NULL,search_day date NOT NULL DEFAULT ((now() AT TIME ZONE 'Africa/Tripoli')::date),PRIMARY KEY(user_id,term,search_day));
GRANT SELECT,INSERT ON public.medicine_searches TO authenticated;
GRANT ALL ON public.medicine_searches TO service_role;
ALTER TABLE public.medicine_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY search_own_read ON public.medicine_searches FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY search_own_insert ON public.medicine_searches FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND length(term) BETWEEN 2 AND 80 AND search_day=((now() AT TIME ZONE 'Africa/Tripoli')::date));
CREATE FUNCTION public.record_medicine_search(term text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 IF length(btrim(term)) BETWEEN 2 AND 80 THEN INSERT INTO public.medicine_searches(user_id,term) VALUES(auth.uid(),lower(btrim(term))) ON CONFLICT DO NOTHING; END IF;
END $$;
CREATE FUNCTION public.popular_medicine_searches() RETURNS TABLE(term text,searches bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT s.term,count(*) FROM public.medicine_searches s WHERE auth.uid() IS NOT NULL AND s.search_day>=(now() AT TIME ZONE 'Africa/Tripoli')::date-30 GROUP BY s.term ORDER BY count(*) DESC,s.term LIMIT 8
$$;
REVOKE ALL ON FUNCTION public.record_medicine_search(text),public.popular_medicine_searches() FROM public,anon;
GRANT EXECUTE ON FUNCTION public.record_medicine_search(text),public.popular_medicine_searches() TO authenticated;
CREATE POLICY volunteer_docs_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='documents' AND EXISTS(SELECT 1 FROM public.volunteer_bookings b WHERE b.id=(storage.foldername(name))[1] AND (b.patient_id=auth.uid()::text OR public.volunteer_session_doctor(b.session_id)=auth.uid()::text OR public.is_admin())));
CREATE POLICY volunteer_docs_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='documents' AND EXISTS(SELECT 1 FROM public.volunteer_bookings b WHERE b.id=(storage.foldername(name))[1] AND public.volunteer_session_doctor(b.session_id)=auth.uid()::text));
CREATE POLICY volunteer_docs_update ON storage.objects FOR UPDATE TO authenticated USING(bucket_id='documents' AND EXISTS(SELECT 1 FROM public.volunteer_bookings b WHERE b.id=(storage.foldername(name))[1] AND public.volunteer_session_doctor(b.session_id)=auth.uid()::text)) WITH CHECK(bucket_id='documents' AND EXISTS(SELECT 1 FROM public.volunteer_bookings b WHERE b.id=(storage.foldername(name))[1] AND public.volunteer_session_doctor(b.session_id)=auth.uid()::text));

CREATE OR REPLACE FUNCTION public.set_clinic_booking_location() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE branch jsonb;
BEGIN
 IF coalesce(new.data->>'clinicId','')<>'' THEN
 SELECT data INTO branch FROM public.care_items WHERE id=new.data->>'clinicId' AND owner_id=new.doctor_id AND kind='branch';
 new.data:=new.data||jsonb_build_object('clinicAddress',coalesce(branch->>'address',branch->>'details'),'clinicLat',branch->'lat','clinicLng',branch->'lng');
 END IF;
 RETURN new;
END $$;
CREATE TRIGGER set_clinic_booking_location BEFORE INSERT ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.set_clinic_booking_location();
CREATE OR REPLACE FUNCTION public.unlock_patient_reports(patient text, pin text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE h text;
BEGIN
 IF auth.uid() IS NULL THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.appointments a WHERE a.patient_id=patient AND a.doctor_id=auth.uid()::text) AND NOT EXISTS(SELECT 1 FROM public.volunteer_bookings b WHERE b.patient_id=patient AND public.volunteer_session_doctor(b.session_id)=auth.uid()::text) THEN RETURN false; END IF;
 SELECT pin_hash INTO h FROM public.report_pins WHERE patient_id=patient;
 IF h IS NULL OR h<>crypt(pin,h) THEN RETURN false; END IF;
 INSERT INTO public.report_access(doctor_id,patient_id,expires_at) VALUES(auth.uid()::text,patient,now()+interval '12 hours') ON CONFLICT(doctor_id,patient_id) DO UPDATE SET expires_at=excluded.expires_at;
 RETURN true;
END $$;
CREATE POLICY volunteer_patient_history ON public.patients FOR SELECT TO authenticated USING(public.has_report_access(id) AND EXISTS(SELECT 1 FROM public.volunteer_bookings b WHERE b.patient_id=patients.id AND public.volunteer_session_doctor(b.session_id)=auth.uid()::text));
CREATE POLICY volunteer_lab_order ON public.lab_orders FOR INSERT TO authenticated WITH CHECK(doctor_id=auth.uid()::text AND EXISTS(SELECT 1 FROM public.volunteer_bookings b WHERE b.id=lab_orders.appointment_id AND b.patient_id=lab_orders.patient_id AND public.volunteer_session_doctor(b.session_id)=auth.uid()::text));