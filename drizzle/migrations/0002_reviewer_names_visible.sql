create or replace function public.can_view_profile(target text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    target = auth.uid()::text
    or public.is_admin()
    or exists (select 1 from public.profiles p where p.id = target and p.role in ('doctor','lab','pharmacy','admin'))
    or exists (select 1 from public.reviews rv where rv.patient_id = target)
    or exists (select 1 from public.appointments a where (a.patient_id = auth.uid()::text and a.doctor_id = target) or (a.doctor_id = auth.uid()::text and a.patient_id = target) or (a.doctor_id = public.reception_doctor() and a.patient_id = target))
    or exists (select 1 from public.lab_orders o where (o.lab_id = auth.uid()::text and target in (o.patient_id, o.doctor_id)) or (auth.uid()::text in (o.patient_id, o.doctor_id) and target in (o.lab_id, o.patient_id, o.doctor_id)))
    or exists (select 1 from public.receptionists r where (r.id = auth.uid()::text and r.doctor_id = target) or (r.doctor_id = auth.uid()::text and r.id = target))
    or exists (select 1 from public.care_items c where (c.owner_id = auth.uid()::text and c.recipient_id = target) or (c.recipient_id = auth.uid()::text and c.owner_id = target))
    or exists (select 1 from public.volunteer_bookings b join public.volunteer_sessions s on s.id = b.session_id where (s.doctor_id = auth.uid()::text and b.patient_id = target) or (b.patient_id = auth.uid()::text and s.doctor_id = target))
  )
$$;