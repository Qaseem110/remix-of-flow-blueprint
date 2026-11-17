CREATE OR REPLACE FUNCTION public.allocate_daily_booking() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE av jsonb; shifts jsonb; shift jsonb; day date; cap int; total_cap int; start_min int; end_min int; step_min int; candidate text; used int; q int; chosen text; original public.appointments%ROWTYPE; per_slot int; n_slots int; clinic text := coalesce(new.data->>'clinicId','');
BEGIN
 IF TG_OP='UPDATE' THEN
  IF coalesce(new.data->>'clinicId','')<>coalesce(old.data->>'clinicId','') THEN RAISE EXCEPTION 'Reschedule instead of changing clinic'; END IF;
  IF coalesce(current_setting('app.retime', true),'')='on' AND new.doctor_id=old.doctor_id AND new.patient_id=old.patient_id AND new.data->>'date'=old.data->>'date' THEN RETURN new; END IF;
  IF new.doctor_id IS DISTINCT FROM old.doctor_id OR new.patient_id IS DISTINCT FROM old.patient_id OR new.data->>'date' IS DISTINCT FROM old.data->>'date' OR new.data->>'time' IS DISTINCT FROM old.data->>'time' OR new.data->>'queueNumber' IS DISTINCT FROM old.data->>'queueNumber' THEN RAISE EXCEPTION 'Appointment date, time and queue are system assigned; reschedule instead'; END IF;
  RETURN new;
 END IF;
 SELECT data INTO av FROM public.availability WHERE id=new.doctor_id FOR UPDATE;
 IF clinic<>'' THEN
  IF NOT EXISTS(SELECT 1 FROM public.care_items WHERE id=clinic AND owner_id=new.doctor_id AND kind='branch' AND data->>'status'<>'Archived') OR new.data->>'type'<>'clinic' THEN RAISE EXCEPTION 'Invalid clinic'; END IF;
  av:=av->'clinics'->clinic;
  new.data:=new.data|| (SELECT jsonb_build_object('clinicName',data->>'title','clinicAddress',data->>'details') FROM public.care_items WHERE id=clinic);
 END IF;
 IF av IS NULL THEN RAISE EXCEPTION 'Doctor has no working hours'; END IF;
 per_slot := CASE WHEN coalesce(av->>'patientsPerSlot','') ~ '^[0-9]+$' THEN greatest(1,(av->>'patientsPerSlot')::int) ELSE 1 END;
 day := (new.data->>'date')::date;
 shifts := public.schedule_shifts(av,day);
 IF jsonb_array_length(shifts)=0 OR coalesce(av->'blockedDays','[]'::jsonb) ? day::text THEN RAISE EXCEPTION 'Doctor is unavailable on this day'; END IF;
 IF coalesce(new.data->>'rescheduledFrom','')<>'' THEN
  SELECT * INTO original FROM public.appointments WHERE id=new.data->>'rescheduledFrom' FOR UPDATE;
  IF original.id IS NULL OR original.patient_id<>new.patient_id OR original.doctor_id<>new.doctor_id OR coalesce(original.data->>'clinicId','')<>clinic OR original.data->>'status' NOT IN ('Confirmed','Pending','Waiting') OR (auth.uid() IS NOT NULL AND auth.uid()::text NOT IN (original.patient_id,original.doctor_id) AND NOT public.is_admin()) THEN RAISE EXCEPTION 'Cannot reschedule this appointment'; END IF;
  UPDATE public.appointments SET data=data||jsonb_build_object('status','Rescheduled','rescheduledTo',new.id) WHERE id=original.id;
 END IF;
 SELECT sum((value->>'capacity')::int) INTO total_cap FROM jsonb_array_elements(shifts);
 SELECT count(*) INTO used FROM public.appointments WHERE doctor_id=new.doctor_id AND coalesce(data->>'clinicId','')=clinic AND data->>'date'=day::text AND data->>'status' NOT IN ('Cancelled','Rescheduled','No Show');
 IF used>=total_cap THEN RAISE EXCEPTION 'Daily patient limit reached. Choose another date.'; END IF;
 FOR shift IN SELECT value FROM jsonb_array_elements(shifts) ORDER BY value->>'start' LOOP
  cap := (shift->>'capacity')::int;
  SELECT count(*) INTO used FROM public.appointments WHERE doctor_id=new.doctor_id AND coalesce(data->>'clinicId','')=clinic AND data->>'date'=day::text AND data->>'status' NOT IN ('Cancelled','Rescheduled','No Show') AND data->>'time'>=shift->>'start' AND data->>'time'<shift->>'end';
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
      AND (SELECT count(*) FROM public.appointments WHERE doctor_id=new.doctor_id AND coalesce(data->>'clinicId','')=clinic AND data->>'date'=day::text AND data->>'time'=candidate AND data->>'status' NOT IN ('Cancelled','Rescheduled','No Show'))<per_slot THEN chosen:=candidate; EXIT; END IF;
  END LOOP;
  IF chosen IS NOT NULL THEN EXIT; END IF;
 END LOOP;
 IF chosen IS NULL THEN RAISE EXCEPTION 'No places available on this day. Choose another date.'; END IF;
 SELECT coalesce(max((data->>'queueNumber')::int),0)+1 INTO q FROM public.appointments WHERE doctor_id=new.doctor_id AND coalesce(data->>'clinicId','')=clinic AND data->>'date'=day::text AND data->>'status' NOT IN ('Cancelled','Rescheduled','No Show');
 new.data:=new.data||jsonb_build_object('id',new.id,'doctorId',new.doctor_id,'patientId',new.patient_id,'time',chosen,'queueNumber',q,'status','Confirmed');
 RETURN new;
END $$;
CREATE OR REPLACE FUNCTION public.close_queue_gap() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prev_q int; prev_t text; r record;
BEGIN
 IF new.data->>'status' NOT IN ('Cancelled','Rescheduled','No Show') OR old.data->>'status' IN ('Cancelled','Rescheduled','No Show','Completed') THEN RETURN NULL; END IF;
 prev_q := (old.data->>'queueNumber')::int; prev_t := old.data->>'time';
 IF prev_q IS NULL THEN RETURN NULL; END IF;
 PERFORM 1 FROM public.availability WHERE id=new.doctor_id FOR UPDATE;
 PERFORM set_config('app.retime','on',true);
 FOR r IN SELECT id, (data->>'queueNumber')::int AS q, data->>'time' AS t FROM public.appointments
   WHERE doctor_id=new.doctor_id AND coalesce(data->>'clinicId','')=coalesce(new.data->>'clinicId','') AND data->>'date'=new.data->>'date' AND id<>new.id
     AND data->>'status' IN ('Confirmed','Pending','Waiting','Checked-In') AND (data->>'queueNumber')::int>prev_q
   ORDER BY (data->>'queueNumber')::int LOOP
  UPDATE public.appointments SET data=data||jsonb_build_object('queueNumber',prev_q,'time',prev_t) WHERE id=r.id;
  prev_q := r.q; prev_t := r.t;
 END LOOP;
 PERFORM set_config('app.retime','',true);
 RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION public.renumber_on_return() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE nums int[]; times text[]; step int; last_t text; m int; i int := 0; r record;
BEGIN
 IF old.data->>'status'<>'No Show' OR new.data->>'status' NOT IN ('Waiting','Confirmed','Checked-In') THEN RETURN NULL; END IF;
 PERFORM 1 FROM public.availability WHERE id=new.doctor_id FOR UPDATE;
 SELECT coalesce(NULLIF((CASE WHEN coalesce(new.data->>'clinicId','')='' THEN data ELSE data->'clinics'->(new.data->>'clinicId') END)->>'consultMinutes','')::int,15) INTO step FROM public.availability WHERE id=new.doctor_id;
 step := coalesce(step,15);
 SELECT array_agg((data->>'queueNumber')::int ORDER BY (data->>'queueNumber')::int), array_agg(data->>'time' ORDER BY data->>'time')
   INTO nums, times FROM public.appointments
   WHERE doctor_id=new.doctor_id AND coalesce(data->>'clinicId','')=coalesce(new.data->>'clinicId','') AND data->>'date'=new.data->>'date' AND id<>new.id AND data->>'status' IN ('Confirmed','Pending','Waiting','Checked-In');
 last_t := coalesce(times[array_length(times,1)], new.data->>'time');
 m := split_part(last_t,':',1)::int*60+split_part(last_t,':',2)::int + CASE WHEN times IS NULL THEN 0 ELSE step END;
 nums := coalesce(nums,'{}') || (SELECT max((data->>'queueNumber')::int)+1 FROM public.appointments WHERE doctor_id=new.doctor_id AND coalesce(data->>'clinicId','')=coalesce(new.data->>'clinicId','') AND data->>'date'=new.data->>'date');
 times := coalesce(times,'{}') || (lpad((m/60)::text,2,'0')||':'||lpad((m%60)::text,2,'0'));
 PERFORM set_config('app.retime','on',true);
 FOR r IN SELECT id FROM public.appointments
   WHERE doctor_id=new.doctor_id AND coalesce(data->>'clinicId','')=coalesce(new.data->>'clinicId','') AND data->>'date'=new.data->>'date' AND data->>'status' IN ('Confirmed','Pending','Waiting','Checked-In')
   ORDER BY coalesce(NULLIF(data->>'queueOrder','')::numeric,(data->>'queueNumber')::numeric) LOOP
  i := i+1;
  UPDATE public.appointments SET data=(data-'queueOrder')||jsonb_build_object('queueNumber',nums[i],'time',times[i]) WHERE id=r.id;
 END LOOP;
 PERFORM set_config('app.retime','',true);
 RETURN NULL;
END $$;