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