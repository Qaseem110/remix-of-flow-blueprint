CREATE OR REPLACE FUNCTION public.allocate_volunteer_token() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s jsonb; used integer; nxt integer;
BEGIN
 SELECT data INTO s FROM public.volunteer_sessions WHERE id=new.session_id FOR UPDATE;
 IF s IS NULL THEN RAISE EXCEPTION 'Volunteer session not found'; END IF;
 IF TG_OP='UPDATE' THEN
  IF auth.uid() IS NOT NULL AND auth.uid()::text=old.patient_id AND auth.uid()::text<>public.volunteer_session_doctor(old.session_id) AND new.data->>'status' NOT IN ('Booked','Cancelled') THEN RAISE EXCEPTION 'Only the doctor can update the visit'; END IF;
  IF auth.uid()::text=old.patient_id AND new.data->>'status'='Booked' AND old.data->>'status'<>'Booked' THEN RAISE EXCEPTION 'Only the doctor can reopen a visit'; END IF;
  new.data:=new.data||jsonb_build_object('token',old.data->'token'); new.patient_id:=old.patient_id; new.session_id:=old.session_id;
 ELSE
  IF coalesce(s->>'status','Open')<>'Open' THEN RAISE EXCEPTION 'This free checkup session is not open'; END IF;
  IF ((s->>'date')::date + (s->>'end')::time) AT TIME ZONE 'Africa/Tripoli' <= now() THEN RAISE EXCEPTION 'This session has ended'; END IF;
  IF EXISTS (SELECT 1 FROM public.volunteer_bookings b WHERE b.session_id=new.session_id AND b.patient_id=new.patient_id AND b.data->>'status'<>'Cancelled') THEN RAISE EXCEPTION 'You already booked this session'; END IF;
  SELECT count(*) INTO used FROM public.volunteer_bookings b WHERE b.session_id=new.session_id AND b.data->>'status'<>'Cancelled';
  IF used>=coalesce((s->>'capacity')::int,0) THEN RAISE EXCEPTION 'All free spots in this session are taken'; END IF;
  SELECT coalesce(max((b.data->>'token')::int),0)+1 INTO nxt FROM public.volunteer_bookings b WHERE b.session_id=new.session_id;
  new.data:=new.data||jsonb_build_object('token',nxt,'status','Booked');
 END IF;
 RETURN new;
END $$;
CREATE OR REPLACE FUNCTION public.guard_care_item() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ DECLARE caller_role text; BEGIN SELECT role INTO caller_role FROM public.user_roles WHERE user_id=auth.uid(); IF auth.uid() IS NULL THEN RETURN new; END IF; IF new.kind NOT IN ('favorite','waitlist','template','referral','branch','complaint','credential','reservation','home_collection','package','consent') THEN RAISE EXCEPTION 'Invalid care service'; END IF; IF coalesce(btrim(new.data->>'title'),'')='' THEN RAISE EXCEPTION 'Name or title required'; END IF; IF TG_OP='UPDATE' THEN IF new.owner_id<>old.owner_id OR new.kind<>old.kind OR new.recipient_id IS DISTINCT FROM old.recipient_id THEN RAISE EXCEPTION 'Ownership cannot change'; END IF; IF new.kind='credential' AND NOT public.is_admin() AND new.data->>'status' IS DISTINCT FROM old.data->>'status' AND new.data->>'status'<>'Archived' THEN RAISE EXCEPTION 'Admin review required'; END IF; IF new.kind='reservation' AND auth.uid()::text<>old.recipient_id AND NOT public.is_admin() AND new.data->>'status' IS DISTINCT FROM old.data->>'status' AND new.data->>'status' NOT IN ('Cancelled','Archived') THEN RAISE EXCEPTION 'Pharmacy confirmation required'; END IF; ELSE IF new.kind='credential' AND coalesce(new.data->>'status','Pending')<>'Pending' THEN RAISE EXCEPTION 'Admin review required'; END IF; IF new.kind IN ('template','referral','branch') AND caller_role<>'doctor' THEN RAISE EXCEPTION 'Doctor account required'; END IF; IF new.kind IN ('package','home_collection') AND caller_role<>'lab' THEN RAISE EXCEPTION 'Lab account required'; END IF; IF new.kind IN ('waitlist','reservation') AND caller_role<>'patient' THEN RAISE EXCEPTION 'Patient account required'; END IF; IF new.kind='waitlist' AND NOT EXISTS(SELECT 1 FROM public.doctors WHERE id=new.recipient_id) THEN RAISE EXCEPTION 'Choose a doctor'; END IF; IF new.kind='reservation' AND NOT EXISTS(SELECT 1 FROM public.pharmacies WHERE id=new.recipient_id) THEN RAISE EXCEPTION 'Choose a pharmacy'; END IF; END IF; RETURN new; END $$;
CREATE OR REPLACE FUNCTION public.guard_reservation_quantity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m jsonb;
BEGIN
 IF new.kind='reservation' THEN
  SELECT data INTO m FROM public.medicines WHERE id=new.data->>'medicineId' AND pharmacy_id=new.recipient_id FOR UPDATE;
  IF coalesce(new.data->>'quantity','') !~ '^[1-9][0-9]*$' THEN RAISE EXCEPTION 'Enter a positive whole quantity'; END IF;
  IF TG_OP='INSERT' THEN
   IF m IS NULL OR coalesce((m->>'inStock')::boolean,false)=false OR (m ? 'expiry' AND m->>'expiry'<((now() AT TIME ZONE 'Africa/Tripoli')::date)::text) THEN RAISE EXCEPTION 'Medicine is unavailable'; END IF;
   IF m ? 'quantity' AND (new.data->>'quantity')::integer>(m->>'quantity')::integer THEN RAISE EXCEPTION 'Requested quantity exceeds available stock'; END IF;
   IF EXISTS(SELECT 1 FROM public.care_items c WHERE c.kind='reservation' AND c.owner_id=new.owner_id AND c.recipient_id=new.recipient_id AND c.data->>'medicineId'=new.data->>'medicineId' AND coalesce(c.data->>'memberId','')=coalesce(new.data->>'memberId','') AND coalesce(c.data->>'status','Requested') NOT IN ('Cancelled','Archived','Unavailable','Collected')) THEN RAISE EXCEPTION 'This medicine is already reserved'; END IF;
  ELSE
   IF new.data->'quantity' IS DISTINCT FROM old.data->'quantity' OR new.data->'memberId' IS DISTINCT FROM old.data->'memberId' THEN RAISE EXCEPTION 'Reservation quantity and patient cannot change'; END IF;
  END IF;
 END IF;
 RETURN new;
END $$;
CREATE TRIGGER guard_reservation_quantity BEFORE INSERT OR UPDATE ON public.care_items FOR EACH ROW EXECUTE FUNCTION public.guard_reservation_quantity();
CREATE OR REPLACE FUNCTION public.alert_low_stock() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE nid text;
BEGIN
 IF new.data ? 'lowStock' AND coalesce(new.data->>'lowStock','') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Low-stock threshold must be a non-negative integer'; END IF;
 IF new.data ? 'quantity' AND (new.data->>'quantity')::integer<=coalesce((new.data->>'lowStock')::integer,5) THEN
  IF TG_OP='INSERT' OR NOT(old.data ? 'quantity') OR (old.data->>'quantity')::integer>coalesce((old.data->>'lowStock')::integer,5) OR new.data->>'lowStock' IS DISTINCT FROM old.data->>'lowStock' THEN
   nid:=gen_random_uuid()::text;
   INSERT INTO public.notifications(id,user_id,data) VALUES(nid,new.pharmacy_id,jsonb_build_object('id',nid,'userId',new.pharmacy_id,'title','Medicine running low','body',(new.data->>'name')||': '||(new.data->>'quantity')||' left — out of stock soon.','at',now(),'read',false,'link','/pharmacy'));
  END IF;
 END IF;
 RETURN new;
END $$;
CREATE TRIGGER alert_low_stock AFTER INSERT OR UPDATE ON public.medicines FOR EACH ROW EXECUTE FUNCTION public.alert_low_stock();
CREATE TABLE public.medicine_searches(user_id uuid NOT NULL,term text NOT NULL,search_day date NOT NULL DEFAULT ((now() AT TIME ZONE 'Africa/Tripoli')::date),PRIMARY KEY(user_id,term,search_day));
GRANT SELECT,INSERT ON public.medicine_searches TO authenticated;
GRANT ALL ON public.medicine_searches TO service_role;
ALTER TABLE public.medicine_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY search_own_read ON public.medicine_searches FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY search_own_insert ON public.medicine_searches FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND length(term) BETWEEN 2 AND 80 AND search_day=((now() AT TIME ZONE 'Africa/Tripoli')::date));
CREATE FUNCTION public.record_medicine_search(term text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 IF length(btrim(term)) BETWEEN 2 AND 80 THEN INSERT INTO public.medicine_searches(user_id,term) VALUES(auth.uid(),lower(btrim(term))) ON CONFLICT DO NOTHING; END IF;
END $$;
CREATE FUNCTION public.popular_medicine_searches() RETURNS TABLE(term text,searches bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT s.term,count(*) FROM public.medicine_searches s WHERE auth.uid() IS NOT NULL AND s.search_day>=(now() AT TIME ZONE 'Africa/Tripoli')::date-30 GROUP BY s.term ORDER BY count(*) DESC,s.term LIMIT 8
$$;
REVOKE ALL ON FUNCTION public.record_medicine_search(text),public.popular_medicine_searches() FROM public,anon;
GRANT EXECUTE ON FUNCTION public.record_medicine_search(text),public.popular_medicine_searches() TO authenticated;
CREATE POLICY volunteer_docs_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='documents' AND EXISTS(SELECT 1 FROM public.volunteer_bookings b WHERE b.id=(storage.foldername(name))[1] AND (b.patient_id=auth.uid()::text OR public.volunteer_session_doctor(b.session_id)=auth.uid()::text OR public.is_admin())));
CREATE POLICY volunteer_docs_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='documents' AND EXISTS(SELECT 1 FROM public.volunteer_bookings b WHERE b.id=(storage.foldername(name))[1] AND public.volunteer_session_doctor(b.session_id)=auth.uid()::text));
CREATE POLICY volunteer_docs_update ON storage.objects FOR UPDATE TO authenticated USING(bucket_id='documents' AND EXISTS(SELECT 1 FROM public.volunteer_bookings b WHERE b.id=(storage.foldername(name))[1] AND public.volunteer_session_doctor(b.session_id)=auth.uid()::text)) WITH CHECK(bucket_id='documents' AND EXISTS(SELECT 1 FROM public.volunteer_bookings b WHERE b.id=(storage.foldername(name))[1] AND public.volunteer_session_doctor(b.session_id)=auth.uid()::text));