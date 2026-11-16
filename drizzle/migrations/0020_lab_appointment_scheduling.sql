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