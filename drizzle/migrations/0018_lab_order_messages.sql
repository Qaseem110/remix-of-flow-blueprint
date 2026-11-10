CREATE TABLE IF NOT EXISTS public.lab_messages (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES public.lab_orders(id) ON DELETE CASCADE,
  author_id text NOT NULL DEFAULT auth.uid()::text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.lab_messages TO authenticated;
GRANT ALL ON public.lab_messages TO service_role;
ALTER TABLE public.lab_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lab messages read" ON public.lab_messages FOR SELECT TO authenticated USING (
  public.is_admin() OR EXISTS (SELECT 1 FROM public.lab_orders o WHERE o.id = order_id AND (o.patient_id = auth.uid()::text OR o.doctor_id = auth.uid()::text)));
CREATE POLICY "lab messages insert" ON public.lab_messages FOR INSERT TO authenticated WITH CHECK (
  author_id = auth.uid()::text AND EXISTS (SELECT 1 FROM public.lab_orders o WHERE o.id = order_id AND (o.patient_id = auth.uid()::text OR o.doctor_id = auth.uid()::text)));