CREATE OR REPLACE FUNCTION public.kiosk_queue_lookup(method text, value text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
declare a record; today text := to_char(now() at time zone 'Asia/Karachi','YYYY-MM-DD'); r jsonb;
begin
  if method = 'appointmentId' then
    select * into a from public.appointments where tracking_number = trim(value) or upper(id) = upper(trim(value)) limit 1;
  else
    select ap.* into a from public.appointments ap join public.profiles p on p.id = ap.patient_id
    where replace(p.data->>'phone',' ','') = replace(value,' ','') and ap.data->>'date' >= today
      and ap.data->>'status' not in ('Cancelled','No-Show','Completed')
    order by ap.data->>'date', ap.data->>'time' limit 1;
  end if;
  if a is null then raise exception 'No matching appointment found'; end if;
  r := public.kiosk_queue_status(a.id);
  return r || jsonb_build_object('date', a.data->>'date', 'time', a.data->>'time');
end $$;
REVOKE ALL ON FUNCTION public.kiosk_queue_lookup(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.kiosk_queue_lookup(text, text) TO anon, authenticated, service_role;