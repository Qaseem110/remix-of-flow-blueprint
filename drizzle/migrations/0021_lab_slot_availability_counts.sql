CREATE OR REPLACE FUNCTION public.lab_slot_usage(target_lab text, target_date text) RETURNS TABLE(booked_time text, duration integer, bookings integer) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT data->>'time', coalesce((data->>'slotMinutes')::int,30), count(*)::int FROM public.lab_orders WHERE auth.uid() IS NOT NULL AND lab_id=target_lab AND data->>'date'=target_date AND data->>'time' IS NOT NULL AND coalesce(data->>'status','') NOT IN ('Cancelled','Expired') GROUP BY data->>'time', coalesce((data->>'slotMinutes')::int,30);
$$;
REVOKE ALL ON FUNCTION public.lab_slot_usage(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lab_slot_usage(text,text) TO authenticated, service_role;