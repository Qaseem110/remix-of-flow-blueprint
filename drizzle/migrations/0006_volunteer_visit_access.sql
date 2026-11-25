CREATE OR REPLACE FUNCTION public.set_clinic_booking_location() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE branch jsonb;
BEGIN
 IF coalesce(new.data->>'clinicId','')<>'' THEN
 SELECT data INTO branch FROM public.care_items WHERE id=new.data->>'clinicId' AND owner_id=new.doctor_id AND kind='branch';
 new.data:=new.data||jsonb_build_object('clinicAddress',coalesce(branch->>'address',branch->>'details'),'clinicLat',branch->'lat','clinicLng',branch->'lng');
 END IF;
 RETURN new;
END $$;
CREATE TRIGGER set_clinic_booking_location BEFORE INSERT ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.set_clinic_booking_location();
CREATE OR REPLACE FUNCTION public.unlock_patient_reports(patient text, pin text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE h text;
BEGIN
 IF auth.uid() IS NULL THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.appointments a WHERE a.patient_id=patient AND a.doctor_id=auth.uid()::text) AND NOT EXISTS(SELECT 1 FROM public.volunteer_bookings b WHERE b.patient_id=patient AND public.volunteer_session_doctor(b.session_id)=auth.uid()::text) THEN RETURN false; END IF;
 SELECT pin_hash INTO h FROM public.report_pins WHERE patient_id=patient;
 IF h IS NULL OR h<>crypt(pin,h) THEN RETURN false; END IF;
 INSERT INTO public.report_access(doctor_id,patient_id,expires_at) VALUES(auth.uid()::text,patient,now()+interval '12 hours') ON CONFLICT(doctor_id,patient_id) DO UPDATE SET expires_at=excluded.expires_at;
 RETURN true;
END $$;
CREATE POLICY volunteer_patient_history ON public.patients FOR SELECT TO authenticated USING(public.has_report_access(id) AND EXISTS(SELECT 1 FROM public.volunteer_bookings b WHERE b.patient_id=patients.id AND public.volunteer_session_doctor(b.session_id)=auth.uid()::text));
CREATE POLICY volunteer_lab_order ON public.lab_orders FOR INSERT TO authenticated WITH CHECK(doctor_id=auth.uid()::text AND EXISTS(SELECT 1 FROM public.volunteer_bookings b WHERE b.id=lab_orders.appointment_id AND b.patient_id=lab_orders.patient_id AND public.volunteer_session_doctor(b.session_id)=auth.uid()::text));