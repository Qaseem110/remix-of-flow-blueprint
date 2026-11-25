-- lovable-cron-fallback-reviewed: shift-start alerts are time-based with no row change to trigger on; 5-minute cadence keeps the 10-minute notice useful
CREATE TABLE public.posts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 author_id text NOT NULL DEFAULT (auth.uid())::text,
 author_name text NOT NULL DEFAULT '',
 author_role text NOT NULL DEFAULT '',
 kind text NOT NULL CHECK (kind IN ('blog','photo','video','forum')),
 title text NOT NULL DEFAULT '',
 body text NOT NULL DEFAULT '',
 summary text NOT NULL DEFAULT '',
 video_url text,
 images text[] NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX posts_kind_created ON public.posts(kind, created_at DESC);
CREATE INDEX posts_author ON public.posts(author_id);
CREATE TABLE public.post_likes(
 post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
 user_id text NOT NULL DEFAULT (auth.uid())::text,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(post_id,user_id)
);
CREATE TABLE public.post_comments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
 author_id text NOT NULL DEFAULT (auth.uid())::text,
 author_name text NOT NULL DEFAULT '',
 author_role text NOT NULL DEFAULT '',
 body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX post_comments_post ON public.post_comments(post_id, created_at);

GRANT SELECT ON public.posts, public.post_likes, public.post_comments TO anon;
GRANT SELECT, INSERT, DELETE ON public.posts, public.post_likes, public.post_comments TO authenticated;
GRANT ALL ON public.posts, public.post_likes, public.post_comments TO service_role;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.prepare_post() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text; n text;
BEGIN
 SELECT p.role, coalesce(p.data->>'name','') INTO r, n FROM public.profiles p WHERE p.id=(auth.uid())::text;
 IF r IS NULL THEN RAISE EXCEPTION 'Sign in to post'; END IF;
 new.author_id:=(auth.uid())::text; new.author_name:=n; new.author_role:=r; new.created_at:=now();
 new.title:=btrim(new.title); new.body:=btrim(new.body); new.summary:=btrim(new.summary);
 IF new.kind IN ('blog','photo','video') AND r<>'doctor' THEN RAISE EXCEPTION 'Only doctors can publish to their feed'; END IF;
 IF new.kind='forum' AND r NOT IN ('doctor','patient') THEN RAISE EXCEPTION 'Only doctors and patients can join discussions'; END IF;
 IF length(new.title)<3 OR length(new.title)>200 THEN RAISE EXCEPTION 'Title is required'; END IF;
 IF length(new.body)>20000 OR length(new.summary)>2000 THEN RAISE EXCEPTION 'Text is too long'; END IF;
 IF coalesce(array_length(new.images,1),0)>6 THEN RAISE EXCEPTION 'Up to 6 pictures'; END IF;
 IF new.kind='blog' AND length(new.body)<20 THEN RAISE EXCEPTION 'Write the blog text'; END IF;
 IF new.kind='photo' AND coalesce(array_length(new.images,1),0)=0 THEN RAISE EXCEPTION 'Upload at least one picture'; END IF;
 IF new.kind='video' THEN
  IF new.video_url IS NULL OR new.video_url !~* '^https?://[^ ]+\.[^ ]+' THEN RAISE EXCEPTION 'Add a valid video link'; END IF;
  IF length(new.summary)<10 THEN RAISE EXCEPTION 'Video summary is required'; END IF;
 ELSE new.video_url:=NULL; END IF;
 IF new.kind='forum' AND length(new.body)<5 THEN RAISE EXCEPTION 'Describe your discussion'; END IF;
 RETURN new;
END $$;
CREATE TRIGGER prepare_post BEFORE INSERT ON public.posts FOR EACH ROW EXECUTE FUNCTION public.prepare_post();

CREATE OR REPLACE FUNCTION public.prepare_post_comment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text; n text;
BEGIN
 SELECT p.role, coalesce(p.data->>'name','') INTO r, n FROM public.profiles p WHERE p.id=(auth.uid())::text;
 IF r IS NULL THEN RAISE EXCEPTION 'Sign in to comment'; END IF;
 new.author_id:=(auth.uid())::text; new.author_name:=n; new.author_role:=r; new.created_at:=now(); new.body:=btrim(new.body);
 RETURN new;
END $$;
CREATE TRIGGER prepare_post_comment BEFORE INSERT ON public.post_comments FOR EACH ROW EXECUTE FUNCTION public.prepare_post_comment();

CREATE POLICY posts_public_read ON public.posts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY posts_own_insert ON public.posts FOR INSERT TO authenticated WITH CHECK (author_id=(auth.uid())::text);
CREATE POLICY posts_own_delete ON public.posts FOR DELETE TO authenticated USING (author_id=(auth.uid())::text OR public.is_admin());
CREATE POLICY likes_public_read ON public.post_likes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY likes_own_insert ON public.post_likes FOR INSERT TO authenticated WITH CHECK (user_id=(auth.uid())::text);
CREATE POLICY likes_own_delete ON public.post_likes FOR DELETE TO authenticated USING (user_id=(auth.uid())::text);
CREATE POLICY comments_public_read ON public.post_comments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY comments_own_insert ON public.post_comments FOR INSERT TO authenticated WITH CHECK (author_id=(auth.uid())::text);
CREATE POLICY comments_own_delete ON public.post_comments FOR DELETE TO authenticated USING (author_id=(auth.uid())::text OR public.is_admin());

CREATE OR REPLACE FUNCTION public.doctor_reputation() RETURNS TABLE(doctor_id text, score bigint, posts bigint, likes bigint, comments bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p.author_id, count(DISTINCT p.id)*3 + count(DISTINCT (l.post_id,l.user_id)) + count(DISTINCT c.id)*2,
  count(DISTINCT p.id), count(DISTINCT (l.post_id,l.user_id)), count(DISTINCT c.id)
 FROM public.posts p
 LEFT JOIN public.post_likes l ON l.post_id=p.id AND l.user_id<>p.author_id
 LEFT JOIN public.post_comments c ON c.post_id=p.id AND c.author_id<>p.author_id
 WHERE p.author_role='doctor' AND p.kind<>'forum' GROUP BY p.author_id
$$;
GRANT EXECUTE ON FUNCTION public.doctor_reputation() TO anon, authenticated;

CREATE POLICY feed_public_read ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id='feed');
CREATE POLICY feed_own_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='feed' AND (storage.foldername(name))[1]=(auth.uid())::text);
CREATE POLICY feed_own_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id='feed' AND (storage.foldername(name))[1]=(auth.uid())::text);

DO $do$
DECLARE f record;
BEGIN
 FOR f IN SELECT p.oid FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prosrc LIKE '%Africa/Tripoli%' LOOP
  EXECUTE replace(pg_get_functiondef(f.oid),'Africa/Tripoli','Asia/Karachi');
 END LOOP;
END $do$;
ALTER TABLE public.medicine_searches ALTER COLUMN search_day SET DEFAULT ((now() AT TIME ZONE 'Asia/Karachi')::date);
DROP POLICY search_own_insert ON public.medicine_searches;
CREATE POLICY search_own_insert ON public.medicine_searches FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND length(term) BETWEEN 2 AND 80 AND search_day=((now() AT TIME ZONE 'Asia/Karachi')::date));

CREATE OR REPLACE FUNCTION public.queue_doctor_start_alerts() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE local_now timestamp := now() AT TIME ZONE 'Asia/Karachi'; today date := (now() AT TIME ZONE 'Asia/Karachi')::date; a record; av jsonb; sh jsonb; st timestamp; n int := 0; nid text;
BEGIN
 FOR a IN SELECT ap.id, ap.doctor_id, ap.patient_id, ap.data FROM public.appointments ap
   WHERE ap.data->>'date'=today::text AND ap.data->>'status' IN ('Confirmed','Pending','Waiting','Checked-In','Ready to Join') AND ap.patient_id NOT LIKE 'walkin-%' LOOP
  SELECT data INTO av FROM public.availability WHERE id=a.doctor_id;
  IF av IS NULL THEN CONTINUE; END IF;
  IF coalesce(a.data->>'clinicId','')<>'' THEN av:=av->'clinics'->(a.data->>'clinicId'); END IF;
  IF av IS NULL THEN CONTINUE; END IF;
  FOR sh IN SELECT * FROM jsonb_array_elements(public.schedule_shifts(av,today)) LOOP
   IF a.data->>'time'>=sh->>'start' AND a.data->>'time'<sh->>'end' THEN
    st := today + (sh->>'start')::time;
    IF st > local_now AND st <= local_now + interval '10 minutes' THEN
     nid := 'NS-'||a.id||'-'||today::text||'-'||replace(sh->>'start',':','');
     INSERT INTO public.notifications(id,user_id,data) VALUES (nid,a.patient_id,jsonb_build_object('id',nid,'userId',a.patient_id,'title','Doctor starting soon','body','Your doctor starts seeing patients at '||to_char((sh->>'start')::time,'HH12:MI AM')||'. Your queue number is #'||coalesce(a.data->>'queueNumber','-')||'.','link','/patient/appointments/'||a.id,'read',false,'at',now()))
     ON CONFLICT (id) DO NOTHING;
     IF FOUND THEN n:=n+1; END IF;
    END IF;
   END IF;
  END LOOP;
 END LOOP;
 RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.queue_doctor_start_alerts() FROM PUBLIC, anon, authenticated;
SELECT cron.schedule('doctor-start-alerts','*/5 * * * *','SELECT public.queue_doctor_start_alerts()');