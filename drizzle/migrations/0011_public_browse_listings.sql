GRANT SELECT ON public.volunteer_sessions TO anon;
DROP POLICY IF EXISTS "Visitors see volunteer sessions" ON public.volunteer_sessions;
CREATE POLICY "Visitors see volunteer sessions" ON public.volunteer_sessions FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "profiles public providers" ON public.profiles;
CREATE POLICY "profiles public providers" ON public.profiles FOR SELECT TO anon USING (role IN ('lab','pharmacy'));