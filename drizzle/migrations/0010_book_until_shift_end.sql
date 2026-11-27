DO $do$
DECLARE src text; out text;
BEGIN
  src := pg_get_functiondef('public.allocate_daily_booking'::regproc);
  out := replace(src, 'IF chosen IS NOT NULL THEN EXIT; END IF;', $r$IF chosen IS NULL AND day=(now() AT TIME ZONE 'Asia/Karachi')::date THEN
   candidate := to_char(date_trunc('minute', now() AT TIME ZONE 'Asia/Karachi') + interval '1 minute', 'HH24:MI');
   IF candidate>shift->>'start' AND candidate<shift->>'end' AND NOT (coalesce(av->'blocked','[]'::jsonb) ? (day::text||' '||candidate)) THEN chosen:=candidate; END IF;
  END IF;
  IF chosen IS NOT NULL THEN EXIT; END IF;$r$);
  IF out = src THEN RAISE EXCEPTION 'allocate_daily_booking pattern not found'; END IF;
  EXECUTE out;
END $do$;