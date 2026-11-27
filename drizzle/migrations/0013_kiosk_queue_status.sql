CREATE OR REPLACE FUNCTION public.kiosk_queue_status(appt_id text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
declare a record; cur int; ahead int; dname text;
begin
  select * into a from public.appointments where id = appt_id;
  if a is null then return null; end if;
  select coalesce(max((x.data->>'queueNumber')::int) filter (where x.data->>'status' in ('In Consultation','Ready to Join')),
                  max((x.data->>'queueNumber')::int) filter (where x.data->>'status' = 'Completed'), 0)
    into cur from public.appointments x
   where x.doctor_id = a.doctor_id and x.data->>'date' = a.data->>'date' and coalesce(x.data->>'clinicId','') = coalesce(a.data->>'clinicId','');
  select count(*) into ahead from public.appointments x
   where x.doctor_id = a.doctor_id and x.data->>'date' = a.data->>'date' and coalesce(x.data->>'clinicId','') = coalesce(a.data->>'clinicId','')
     and x.id <> a.id and x.data->>'status' in ('Confirmed','Checked-In','Ready to Join','In Consultation')
     and (x.data->>'queueNumber')::int < (a.data->>'queueNumber')::int;
  select data->>'name' into dname from public.profiles where id = a.doctor_id;
  return jsonb_build_object('myNumber', (a.data->>'queueNumber')::int, 'currentNumber', cur, 'ahead', ahead, 'status', a.data->>'status', 'doctorName', dname);
end $$;
REVOKE ALL ON FUNCTION public.kiosk_queue_status(text) FROM public;
GRANT EXECUTE ON FUNCTION public.kiosk_queue_status(text) TO anon, authenticated, service_role;