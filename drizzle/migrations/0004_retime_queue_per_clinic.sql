CREATE OR REPLACE FUNCTION public.retime_queue_on_consult_change()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE step int; per_slot int; in_slot int; today date := (now() AT TIME ZONE 'Africa/Tripoli')::date; grp record; sched jsonb; shifts jsonb; starts int[]; ends int[]; si int; cur int; appt record; t text;
BEGIN
 IF NOT (coalesce(new.data->>'consultMinutes','') ~ '^[0-9]+$') OR (new.data->>'consultMinutes')::int<1 THEN RETURN new; END IF;
 IF new.data->>'consultMinutes' IS NOT DISTINCT FROM old.data->>'consultMinutes' AND new.data->>'patientsPerSlot' IS NOT DISTINCT FROM old.data->>'patientsPerSlot' THEN RETURN new; END IF;
 step := (new.data->>'consultMinutes')::int;
 per_slot := CASE WHEN coalesce(new.data->>'patientsPerSlot','') ~ '^[0-9]+$' THEN greatest(1,(new.data->>'patientsPerSlot')::int) ELSE 1 END;
 PERFORM set_config('app.retime','on',true);
 FOR grp IN SELECT DISTINCT (data->>'date')::date d, coalesce(data->>'clinicId','') c FROM public.appointments
   WHERE doctor_id=new.id AND (data->>'date')::date>=today AND data->>'status' IN ('Confirmed','Pending','Waiting') LOOP
  -- Each clinic keeps its own hours and queue.
  sched := CASE WHEN grp.c='' THEN new.data ELSE new.data->'clinics'->grp.c END;
  IF sched IS NULL THEN CONTINUE; END IF;
  shifts := public.schedule_shifts(sched,grp.d);
  IF jsonb_array_length(shifts)=0 THEN CONTINUE; END IF;
  SELECT array_agg(split_part(value->>'start',':',1)::int*60+split_part(value->>'start',':',2)::int ORDER BY value->>'start'),
         array_agg(split_part(value->>'end',':',1)::int*60+split_part(value->>'end',':',2)::int ORDER BY value->>'start')
    INTO starts, ends FROM jsonb_array_elements(shifts);
  si := 1; cur := starts[1]; in_slot := 0;
  FOR appt IN SELECT id FROM public.appointments WHERE doctor_id=new.id AND data->>'date'=grp.d::text AND coalesce(data->>'clinicId','')=grp.c
     AND data->>'status' IN ('Confirmed','Pending','Waiting') ORDER BY (data->>'queueNumber')::int LOOP
   IF in_slot>=per_slot THEN cur := cur+step; in_slot := 0; END IF;
   WHILE cur+step>ends[si] AND si<array_length(starts,1) LOOP si := si+1; cur := starts[si]; END LOOP;
   t := lpad((cur/60)::text,2,'0')||':'||lpad((cur%60)::text,2,'0');
   UPDATE public.appointments SET data=data||jsonb_build_object('time',t) WHERE id=appt.id;
   in_slot := in_slot+1;
  END LOOP;
 END LOOP;
 PERFORM set_config('app.retime','',true);
 RETURN new;
END $function$;