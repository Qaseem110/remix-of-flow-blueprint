CREATE OR REPLACE FUNCTION public.lab_tests_need_rx(target_lab text, tests text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.labs l, jsonb_array_elements(coalesce(l.data->'testCatalogue','[]'::jsonb)) t
  WHERE l.id=target_lab AND coalesce((t->>'prescriptionRequired')::boolean,false)
   AND lower(trim(t->>'name')) IN (SELECT lower(trim(x)) FROM regexp_split_to_table(coalesce(tests,''), '[,\n]') x)
 );
$$;
REVOKE ALL ON FUNCTION public.lab_tests_need_rx(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lab_tests_need_rx(text,text) TO authenticated, service_role;
CREATE POLICY "lab orders self booking" ON public.lab_orders FOR INSERT TO authenticated WITH CHECK (
 patient_id = auth.uid()::text AND doctor_id = '' AND appointment_id = ''
 AND NOT public.lab_tests_need_rx(lab_id, data->>'tests'));