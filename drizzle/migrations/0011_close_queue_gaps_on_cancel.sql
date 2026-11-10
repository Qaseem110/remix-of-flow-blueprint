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