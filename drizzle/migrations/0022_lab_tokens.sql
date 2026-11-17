CREATE OR REPLACE FUNCTION public.assign_lab_token() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE nxt integer;
BEGIN
 IF TG_OP='UPDATE' AND new.data->>'date' IS NOT DISTINCT FROM old.data->>'date' AND old.data ? 'token' THEN
  new.data:=new.data||jsonb_build_object('token',old.data->'token'); RETURN new;
 END IF;
 PERFORM 1 FROM public.labs WHERE id=new.lab_id FOR UPDATE;
 SELECT coalesce(max((o.data->>'token')::int),0)+1 INTO nxt FROM public.lab_orders o
  WHERE o.lab_id=new.lab_id AND o.id<>new.id AND o.data->>'date'=new.data->>'date' AND coalesce(o.data->>'token','') ~ '^[0-9]+$';
 new.data:=new.data||jsonb_build_object('token',nxt);
 RETURN new;
END $$;
CREATE TRIGGER assign_lab_token BEFORE INSERT OR UPDATE ON public.lab_orders FOR EACH ROW EXECUTE FUNCTION public.assign_lab_token();
UPDATE public.lab_orders o SET data=o.data||jsonb_build_object('token',r.n) FROM (
 SELECT id, row_number() OVER (PARTITION BY lab_id, data->>'date' ORDER BY data->>'time', created_at) n FROM public.lab_orders WHERE NOT (data ? 'token')) r
 WHERE o.id=r.id;