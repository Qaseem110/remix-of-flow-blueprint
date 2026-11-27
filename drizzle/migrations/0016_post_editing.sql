CREATE OR REPLACE FUNCTION public.guard_post_edit() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 new.author_id:=old.author_id; new.author_name:=old.author_name; new.author_role:=old.author_role; new.created_at:=old.created_at; new.kind:=old.kind; new.images:=old.images;
 new.title:=btrim(new.title); new.body:=btrim(new.body); new.summary:=btrim(new.summary);
 IF length(new.title)<3 OR length(new.title)>200 THEN RAISE EXCEPTION 'Title is required'; END IF;
 IF length(new.body)>20000 OR length(new.summary)>2000 THEN RAISE EXCEPTION 'Text is too long'; END IF;
 IF new.kind='blog' AND length(new.body)<20 THEN RAISE EXCEPTION 'Write the blog text'; END IF;
 IF new.kind='video' THEN
  IF new.video_url IS NULL OR new.video_url !~* '^https?://[^ ]+\.[^ ]+' THEN RAISE EXCEPTION 'Add a valid video link'; END IF;
  IF length(new.summary)<10 THEN RAISE EXCEPTION 'Video summary is required'; END IF;
 ELSE new.video_url:=NULL; END IF;
 IF new.kind='forum' AND length(new.body)<5 THEN RAISE EXCEPTION 'Describe your discussion'; END IF;
 RETURN new;
END $$;
CREATE TRIGGER guard_post_edit BEFORE UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.guard_post_edit();
GRANT UPDATE ON public.posts TO authenticated;
CREATE POLICY posts_own_update ON public.posts FOR UPDATE TO authenticated USING (author_id=(auth.uid())::text) WITH CHECK (author_id=(auth.uid())::text);