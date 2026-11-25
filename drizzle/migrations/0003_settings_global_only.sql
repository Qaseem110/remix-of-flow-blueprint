drop policy if exists "settings read" on public.settings;
create policy "settings read" on public.settings for select to anon, authenticated using (id = 'global' or public.is_admin());