CREATE OR REPLACE FUNCTION public.block_early_consultation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE starts timestamp;
BEGIN
  IF NEW.data->>'status' IN ('In Consultation','Ready to Join')
     AND COALESCE(OLD.data->>'status','') NOT IN ('In Consultation','Ready to Join')
     AND NEW.data->>'date' ~ '^\d{4}-\d{2}-\d{2}$' AND NEW.data->>'time' ~ '^\d{2}:\d{2}' THEN
    starts := ((NEW.data->>'date') || ' ' || substr(NEW.data->>'time',1,5))::timestamp;
    IF starts > (now() AT TIME ZONE 'Asia/Karachi') THEN
      RAISE EXCEPTION 'This appointment starts at %; it can only be attended at its time', substr(NEW.data->>'time',1,5);
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER block_early_consultation BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.block_early_consultation();