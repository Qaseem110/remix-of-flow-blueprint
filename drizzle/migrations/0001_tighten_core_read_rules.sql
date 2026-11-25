create or replace function public.can_view_profile(target text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    target = auth.uid()::text
    or public.is_admin()
    or exists (select 1 from public.profiles p where p.id = target and p.role in ('doctor','lab','pharmacy','admin'))
    or exists (select 1 from public.appointments a where (a.patient_id = auth.uid()::text and a.doctor_id = target) or (a.doctor_id = auth.uid()::text and a.patient_id = target) or (a.doctor_id = public.reception_doctor() and a.patient_id = target))
    or exists (select 1 from public.lab_orders o where (o.lab_id = auth.uid()::text and target in (o.patient_id, o.doctor_id)) or (auth.uid()::text in (o.patient_id, o.doctor_id) and target in (o.lab_id, o.patient_id, o.doctor_id)))
    or exists (select 1 from public.receptionists r where (r.id = auth.uid()::text and r.doctor_id = target) or (r.doctor_id = auth.uid()::text and r.id = target))
    or exists (select 1 from public.care_items c where (c.owner_id = auth.uid()::text and c.recipient_id = target) or (c.recipient_id = auth.uid()::text and c.owner_id = target))
    or exists (select 1 from public.volunteer_bookings b join public.volunteer_sessions s on s.id = b.session_id where (s.doctor_id = auth.uid()::text and b.patient_id = target) or (b.patient_id = auth.uid()::text and s.doctor_id = target))
  )
$$;
revoke execute on function public.can_view_profile(text) from public, anon;
grant execute on function public.can_view_profile(text) to authenticated;

drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated using (public.can_view_profile(id));

drop policy if exists "notifications insert" on public.notifications;
create policy "notifications insert" on public.notifications for insert to authenticated
  with check (user_id = auth.uid()::text or public.is_admin() or public.can_view_profile(user_id));

drop policy if exists "appointments read" on public.appointments;
create policy "appointments read" on public.appointments for select to authenticated using (
  patient_id = auth.uid()::text or doctor_id = auth.uid()::text or public.is_admin() or doctor_id = public.reception_doctor()
  or exists (select 1 from public.lab_orders o where o.appointment_id = appointments.id and o.lab_id = auth.uid()::text));

-- Queue view for patients: anonymous positions only, for days they are booked with a doctor.
create or replace function public.queue_peers() returns table(id text, doctor_id text, data jsonb)
language sql stable security definer set search_path = public as $$
  select 'q-' || md5(a.id), a.doctor_id, jsonb_build_object('doctorId', a.doctor_id, 'clinicId', a.data->'clinicId', 'date', a.data->'date',
    'time', a.data->'time', 'type', a.data->'type', 'status', a.data->'status', 'queueNumber', a.data->'queueNumber', 'queueOrder', a.data->'queueOrder')
  from public.appointments a
  where a.patient_id <> auth.uid()::text and exists (select 1 from public.appointments m where m.patient_id = auth.uid()::text
    and m.doctor_id = a.doctor_id and m.data->>'date' = a.data->>'date')
$$;
revoke execute on function public.queue_peers() from public, anon;
grant execute on function public.queue_peers() to authenticated;