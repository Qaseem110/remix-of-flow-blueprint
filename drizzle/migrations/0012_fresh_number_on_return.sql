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