CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE TABLE public.doctor_alert_settings (doctor_id text PRIMARY KEY REFERENCES public.doctors(id), enabled boolean NOT NULL DEFAULT false, daily_time text NOT NULL DEFAULT '08:00' CHECK(daily_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'), phone text NOT NULL DEFAULT '', discussion_alerts boolean NOT NULL DEFAULT true, last_summary_date date);
GRANT SELECT, INSERT, UPDATE ON public.doctor_alert_settings TO authenticated;
GRANT ALL ON public.doctor_alert_settings TO service_role;
ALTER TABLE public.doctor_alert_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "doctor alert own read" ON public.doctor_alert_settings FOR SELECT TO authenticated USING (doctor_id=auth.uid()::text);
CREATE POLICY "doctor alert own insert" ON public.doctor_alert_settings FOR INSERT TO authenticated WITH CHECK (doctor_id=auth.uid()::text);
CREATE POLICY "doctor alert own update" ON public.doctor_alert_settings FOR UPDATE TO authenticated USING (doctor_id=auth.uid()::text) WITH CHECK (doctor_id=auth.uid()::text);
CREATE OR REPLACE FUNCTION public.reception_attendance(target_id text, arrived boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.appointments;
BEGIN
 SELECT * INTO a FROM public.appointments WHERE id=target_id FOR UPDATE;
 IF a.id IS NULL OR a.doctor_id IS DISTINCT FROM public.reception_doctor() OR NOT public.reception_can('checkIn') THEN RAISE EXCEPTION 'Arrival permission required for this doctor'; END IF;
 IF a.data->>'date'<>((now() AT TIME ZONE 'Africa/Tripoli')::date)::text OR a.data->>'type'<>'clinic' OR a.data->>'status' NOT IN ('Pending','Confirmed','Waiting','Checked-In') THEN RAISE EXCEPTION 'Only today''s pending clinic patients can be marked'; END IF;
 UPDATE public.appointments SET data=data||CASE WHEN arrived THEN jsonb_build_object('status','Waiting','checkedInAt',now()) ELSE jsonb_build_object('status','No Show') END WHERE id=target_id;
END $$;
REVOKE ALL ON FUNCTION public.reception_attendance(text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reception_attendance(text,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.cancel_doctor_day(target_date text, reason text) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.appointments; n integer:=0; msg text; nid text;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.doctors WHERE id=auth.uid()::text) THEN RAISE EXCEPTION 'Only doctors can cancel their day'; END IF;
 IF length(btrim(reason))<3 OR length(reason)>1000 THEN RAISE EXCEPTION 'Enter a cancellation reason (3–1000 characters)'; END IF;
 IF target_date::date<(now() AT TIME ZONE 'Africa/Tripoli')::date THEN RAISE EXCEPTION 'Choose today or a future date'; END IF;
 PERFORM 1 FROM public.availability WHERE id=auth.uid()::text FOR UPDATE;
 FOR a IN SELECT * FROM public.appointments WHERE doctor_id=auth.uid()::text AND data->>'date'=target_date AND data->>'status' IN ('Pending','Confirmed','Waiting','Checked-In','Ready to Join') ORDER BY id FOR UPDATE LOOP
  UPDATE public.appointments SET data=data||jsonb_build_object('status','Cancelled','cancelledBy','doctor','cancelReason',btrim(reason)) WHERE id=a.id;
  msg:='Your appointment '||coalesce(a.tracking_number,a.id)||' on '||target_date||' was cancelled. Reason: '||btrim(reason);
  IF a.data ? 'walkIn' THEN INSERT INTO public.message_outbox(phone,body,appointment_id) VALUES(a.data->'walkIn'->>'phone',msg,a.id);
  ELSE nid:=gen_random_uuid()::text; INSERT INTO public.notifications(id,user_id,data) VALUES(nid,a.patient_id,jsonb_build_object('id',nid,'userId',a.patient_id,'title','Appointment cancelled','body',msg,'at',now(),'read',false,'link','/patient/appointments/'||a.id)); END IF;
  n:=n+1;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.cancel_doctor_day(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_doctor_day(text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.queue_doctor_summary(target_doctor text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cfg public.doctor_alert_settings; day date:=(now() AT TIME ZONE 'Africa/Tripoli')::date; total integer; completed integer; waiting integer; discussions integer;
BEGIN
 SELECT * INTO cfg FROM public.doctor_alert_settings WHERE doctor_id=target_doctor FOR UPDATE;
 IF cfg.doctor_id IS NULL OR NOT cfg.enabled OR cfg.phone='' OR cfg.last_summary_date=day THEN RETURN; END IF;
 SELECT count(*) FILTER(WHERE data->>'status' NOT IN ('Cancelled','Rescheduled','Expired')),count(*) FILTER(WHERE data->>'status'='Completed'),count(*) FILTER(WHERE data->>'status' IN ('Pending','Confirmed','Waiting','Checked-In','Ready to Join')) INTO total,completed,waiting FROM public.appointments WHERE doctor_id=target_doctor AND data->>'date'=day::text;
 SELECT count(*) INTO discussions FROM public.lab_orders o WHERE o.doctor_id=target_doctor AND (SELECT max(created_at) FROM public.lab_messages WHERE order_id=o.id AND author_id=o.patient_id)>coalesce((SELECT max(created_at) FROM public.lab_messages WHERE order_id=o.id AND author_id=o.doctor_id),'-infinity'::timestamptz);
 INSERT INTO public.message_outbox(phone,body) VALUES(cfg.phone,'Sahoolat — '||day||': Today''s appointments: '||total||'. Completed: '||completed||'. Waiting: '||waiting||'. Patient discussions awaiting your reply: '||discussions||'.');
 UPDATE public.doctor_alert_settings SET last_summary_date=day WHERE doctor_id=target_doctor;
END $$;
REVOKE ALL ON FUNCTION public.queue_doctor_summary(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_doctor_summary(text) TO service_role;
CREATE OR REPLACE FUNCTION public.schedule_doctor_summary() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE job_name text:='doctor-stats-'||new.doctor_id; h integer; m integer;
BEGIN
 IF TG_OP='UPDATE' AND new.enabled=old.enabled AND new.daily_time=old.daily_time AND new.phone=old.phone THEN RETURN new; END IF;
 BEGIN PERFORM cron.unschedule(job_name); EXCEPTION WHEN OTHERS THEN NULL; END;
 IF new.enabled THEN
  IF new.phone !~ '^\+?[1-9][0-9]{9,14}$' THEN RAISE EXCEPTION 'Enter WhatsApp number with country code'; END IF;
  h:=mod(split_part(new.daily_time,':',1)::int+22,24); m:=split_part(new.daily_time,':',2)::int;
  PERFORM cron.schedule(job_name,m||' '||h||' * * *',format('SELECT public.queue_doctor_summary(%L)',new.doctor_id));
 END IF;
 RETURN new;
END $$;
CREATE TRIGGER schedule_doctor_summary AFTER INSERT OR UPDATE ON public.doctor_alert_settings FOR EACH ROW EXECUTE FUNCTION public.schedule_doctor_summary();
CREATE OR REPLACE FUNCTION public.queue_doctor_discussion_alert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.lab_orders; cfg public.doctor_alert_settings;
BEGIN
 SELECT * INTO o FROM public.lab_orders WHERE id=new.order_id;
 IF new.author_id<>o.patient_id THEN RETURN new; END IF;
 SELECT * INTO cfg FROM public.doctor_alert_settings WHERE doctor_id=o.doctor_id;
 IF cfg.discussion_alerts AND cfg.phone ~ '^\+?[1-9][0-9]{9,14}$' THEN INSERT INTO public.message_outbox(phone,body,appointment_id) VALUES(cfg.phone,'Sahoolat — A patient sent a new message about '||(o.data->>'tests')||'. Open Discussions to reply.',o.appointment_id); END IF;
 RETURN new;
END $$;
CREATE TRIGGER queue_doctor_discussion_alert AFTER INSERT ON public.lab_messages FOR EACH ROW EXECUTE FUNCTION public.queue_doctor_discussion_alert();