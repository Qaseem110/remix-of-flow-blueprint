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
GRANT EXECUTE ON FUNCTION public.shift_queue_times(text,text,int) TO authenticated;