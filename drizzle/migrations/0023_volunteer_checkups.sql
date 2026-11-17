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
CREATE TRIGGER count_volunteer_bookings AFTER INSERT OR UPDATE ON public.volunteer_bookings FOR EACH ROW EXECUTE FUNCTION public.count_volunteer_bookings();