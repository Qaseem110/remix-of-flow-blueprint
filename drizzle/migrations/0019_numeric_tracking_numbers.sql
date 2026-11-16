CREATE SEQUENCE IF NOT EXISTS public.appointment_tracking_seq START 100001;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS tracking_number text DEFAULT nextval('public.appointment_tracking_seq')::text;
ALTER TABLE public.lab_orders ADD COLUMN IF NOT EXISTS tracking_number text DEFAULT nextval('public.appointment_tracking_seq')::text;
UPDATE public.appointments SET tracking_number=nextval('public.appointment_tracking_seq')::text WHERE tracking_number IS NULL;
UPDATE public.lab_orders SET tracking_number=nextval('public.appointment_tracking_seq')::text WHERE tracking_number IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS appointments_tracking_number_unique ON public.appointments(tracking_number);
CREATE UNIQUE INDEX IF NOT EXISTS lab_orders_tracking_number_unique ON public.lab_orders(tracking_number);
ALTER TABLE public.appointments ADD CONSTRAINT appointments_numeric_tracking CHECK (tracking_number ~ '^[0-9]+$');
ALTER TABLE public.lab_orders ADD CONSTRAINT lab_orders_numeric_tracking CHECK (tracking_number ~ '^[0-9]+$');
GRANT USAGE ON SEQUENCE public.appointment_tracking_seq TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.kiosk_check_in_tracking(method text, value text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE resolved text;
BEGIN
 IF method='appointmentId' THEN
  SELECT id INTO resolved FROM public.appointments WHERE tracking_number=btrim(value);
  IF resolved IS NULL THEN RAISE EXCEPTION 'Appointment not found'; END IF;
  RETURN public.kiosk_check_in(method,resolved);
 END IF;
 RETURN public.kiosk_check_in(method,value);
END; $$;
REVOKE ALL ON FUNCTION public.kiosk_check_in_tracking(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kiosk_check_in_tracking(text,text) TO anon, authenticated, service_role;