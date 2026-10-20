-- Sahoolat: extra setup to remove current limits. Run AFTER schema.sql.

-- 1) File uploads stored on the server (private bucket, max 10 MB, PDF/JPG/PNG)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do nothing;
-- Files are saved as  <appointment-id>/<file-name>; only that appointment's patient, doctor or an admin can access them.
create policy "docs read" on storage.objects for select to authenticated using (
  bucket_id = 'documents' and (public.is_admin() or exists (select 1 from public.appointments a
    where a.id = (storage.foldername(name))[1] and auth.uid()::text in (a.patient_id, a.doctor_id))));
create policy "docs upload" on storage.objects for insert to authenticated with check (
  bucket_id = 'documents' and (public.is_admin() or exists (select 1 from public.appointments a
    where a.id = (storage.foldername(name))[1] and auth.uid()::text in (a.patient_id, a.doctor_id))));

-- 2) Doctor private notes in their own table that patients can never read
create table if not exists public.private_notes (id text primary key, doctor_id text not null, notes text not null default '');
grant select, insert, update on public.private_notes to authenticated;
grant all on public.private_notes to service_role;
alter table public.private_notes enable row level security;
create policy "notes read" on public.private_notes for select to authenticated using (doctor_id = auth.uid()::text or public.is_admin());
create policy "notes insert" on public.private_notes for insert to authenticated with check (doctor_id = auth.uid()::text);
create policy "notes update" on public.private_notes for update to authenticated using (doctor_id = auth.uid()::text);
-- Move any private notes out of the patient-visible record automatically
create or replace function public.split_private_notes() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.data->>'privateNotes', '') <> '' then
    insert into public.private_notes (id, doctor_id, notes) values (new.id, new.doctor_id, new.data->>'privateNotes')
    on conflict (id) do update set notes = excluded.notes;
  end if;
  new.data := new.data - 'privateNotes';
  return new;
end $$;
drop trigger if exists split_private_notes on public.consultations;
create trigger split_private_notes before insert or update on public.consultations for each row execute function public.split_private_notes();
update public.consultations set data = data;  -- move notes already saved

-- 3) Queue numbers re-ordered by time on the server whenever a booking changes
create or replace function public.renumber_queue() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return null; end if;
  update public.appointments a set data = jsonb_set(a.data, '{queueNumber}', to_jsonb(q.n))
  from (select id, row_number() over (order by data->>'time') as n from public.appointments
        where doctor_id = new.doctor_id and data->>'date' = new.data->>'date'
          and data->>'status' not in ('Cancelled','Rescheduled')) q
  where a.id = q.id and (a.data->>'queueNumber')::int is distinct from q.n;
  return null;
end $$;
drop trigger if exists renumber_queue on public.appointments;
create trigger renumber_queue after insert or update on public.appointments for each row execute function public.renumber_queue();

-- 4) Block double-booking of the same doctor slot
create unique index if not exists one_booking_per_slot on public.appointments (doctor_id, (data->>'date'), (data->>'time'))
  where data->>'status' not in ('Cancelled','Rescheduled','No Show');

-- 5) Clinic check-in kiosk without signing in (by appointment ID or phone, today only)
create or replace function public.kiosk_check_in(method text, value text) returns text
language plpgsql security definer set search_path = public as $$
declare a record; s jsonb;
begin
  select data into s from public.settings where id = 'global';
  if not coalesce((s->'checkInMethods'->>method)::boolean, false) then raise exception 'This check-in method is disabled'; end if;
  if method = 'appointmentId' then
    select * into a from public.appointments where upper(id) = upper(trim(value));
  else
    select ap.* into a from public.appointments ap join public.profiles p on p.id = ap.patient_id
    where replace(p.data->>'phone',' ','') = replace(value,' ','') and ap.data->>'date' = to_char(now(),'YYYY-MM-DD')
      and ap.data->>'type' = 'clinic' and ap.data->>'status' = 'Confirmed' order by ap.data->>'time' limit 1;
  end if;
  if a is null then raise exception 'No matching appointment found'; end if;
  if a.data->>'type' <> 'clinic' then raise exception 'Online appointments don''t require check-in'; end if;
  if a.data->>'date' <> to_char(now(),'YYYY-MM-DD') then raise exception 'Check-in is only available on the appointment day'; end if;
  if a.data->>'status' <> 'Confirmed' then raise exception 'Cannot check in — status is %', a.data->>'status'; end if;
  update public.appointments set data = data || jsonb_build_object('status','Checked-In','checkedInAt', now()) where id = a.id;
  return a.id;
end $$;
grant execute on function public.kiosk_check_in(text, text) to anon, authenticated;

-- 6) Instant updates on other devices (queue, notifications)
alter publication supabase_realtime add table public.appointments, public.notifications, public.consultations, public.availability;
