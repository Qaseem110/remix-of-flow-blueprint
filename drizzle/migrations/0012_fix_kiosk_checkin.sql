INSERT INTO public.settings (id, data) VALUES ('global', '{"doctorVerification":true,"checkInMethods":{"appointmentId":true,"phone":true},"joinWindowMinutes":10,"allowedFileTypes":["pdf","jpg","jpeg","png"],"turnApproachingAhead":1}'::jsonb) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.kiosk_check_in(method text, value text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare a record; s jsonb; today text := to_char(now() at time zone 'Asia/Karachi','YYYY-MM-DD');
begin
  select data into s from public.settings where id = 'global';
  if not coalesce((s->'checkInMethods'->>method)::boolean, true) then raise exception 'This check-in method is disabled'; end if;
  if method = 'appointmentId' then
    select * into a from public.appointments where upper(id) = upper(trim(value));
  else
    select ap.* into a from public.appointments ap join public.profiles p on p.id = ap.patient_id
    where replace(p.data->>'phone',' ','') = replace(value,' ','') and ap.data->>'date' = today
      and ap.data->>'type' = 'clinic' and ap.data->>'status' = 'Confirmed' order by ap.data->>'time' limit 1;
  end if;
  if a is null then raise exception 'No matching appointment found'; end if;
  if a.data->>'type' <> 'clinic' then raise exception 'Online appointments don''t require check-in'; end if;
  if a.data->>'date' <> today then raise exception 'Check-in is only available on the appointment day'; end if;
  if a.data->>'status' <> 'Confirmed' then raise exception 'Cannot check in — status is %', a.data->>'status'; end if;
  update public.appointments set data = data || jsonb_build_object('status','Checked-In','checkedInAt', now()) where id = a.id;
  return a.id;
end $$;