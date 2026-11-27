ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS like_count integer NOT NULL DEFAULT 0;
UPDATE public.posts p SET like_count = (SELECT count(*) FROM public.post_likes l WHERE l.post_id = p.id);

CREATE OR REPLACE FUNCTION public.sync_post_like_count() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN UPDATE public.posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
  ELSE UPDATE public.posts SET like_count = greatest(like_count - 1, 0) WHERE id = OLD.post_id; END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS post_like_count ON public.post_likes;
CREATE TRIGGER post_like_count AFTER INSERT OR DELETE ON public.post_likes FOR EACH ROW EXECUTE FUNCTION public.sync_post_like_count();

CREATE OR REPLACE FUNCTION public.post_author_active(author text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = author)
$$;
GRANT EXECUTE ON FUNCTION public.post_author_active(text) TO anon, authenticated;

DROP POLICY IF EXISTS posts_public_read ON public.posts;
CREATE POLICY posts_public_read ON public.posts FOR SELECT TO anon, authenticated USING (public.post_author_active(author_id));

DROP POLICY IF EXISTS comments_public_read ON public.post_comments;
CREATE POLICY comments_public_read ON public.post_comments FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id));

DROP POLICY IF EXISTS likes_public_read ON public.post_likes;
CREATE POLICY likes_own_read ON public.post_likes FOR SELECT TO authenticated USING (user_id = (auth.uid())::text);

DROP POLICY IF EXISTS feed_public_read ON storage.objects;
CREATE POLICY feed_published_read ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'feed' AND ((storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (SELECT 1 FROM public.posts p WHERE storage.objects.name = ANY (p.images))));