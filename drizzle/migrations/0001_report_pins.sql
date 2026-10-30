CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE TABLE public.report_pins (patient_id text PRIMARY KEY, pin_hash text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.report_pins TO service_role;
ALTER TABLE public.report_pins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_report_pin(pin text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if pin !~ '^\d{4,6}$' then raise exception 'PIN must be 4-6 digits'; end if;
  insert into public.report_pins (patient_id, pin_hash) values (auth.uid()::text, crypt(pin, gen_salt('bf')))
  on conflict (patient_id) do update set pin_hash = excluded.pin_hash, updated_at = now();
end $$;

CREATE OR REPLACE FUNCTION public.has_report_pin(patient text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (select 1 from public.report_pins where patient_id = patient);
$$;

CREATE OR REPLACE FUNCTION public.verify_report_pin(patient text, pin text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
declare h text;
begin
  if auth.uid() is null then return false; end if;
  select pin_hash into h from public.report_pins where patient_id = patient;
  if h is null then return false; end if;
  return h = crypt(pin, h);
end $$;

REVOKE ALL ON FUNCTION public.set_report_pin(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.has_report_pin(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.verify_report_pin(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_report_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_report_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_report_pin(text, text) TO authenticated;