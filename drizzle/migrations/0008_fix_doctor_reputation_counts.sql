CREATE OR REPLACE FUNCTION public.doctor_reputation() RETURNS TABLE(doctor_id text, score bigint, posts bigint, likes bigint, comments bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH p AS (SELECT id, author_id FROM public.posts WHERE author_role='doctor' AND kind<>'forum'),
 s AS (SELECT p.author_id,
   count(*) AS posts,
   coalesce(sum((SELECT count(*) FROM public.post_likes l WHERE l.post_id=p.id AND l.user_id<>p.author_id)),0)::bigint AS likes,
   coalesce(sum((SELECT count(*) FROM public.post_comments c WHERE c.post_id=p.id AND c.author_id<>p.author_id)),0)::bigint AS comments
  FROM p GROUP BY p.author_id)
 SELECT author_id, posts*3+likes+comments*2, posts, likes, comments FROM s
$$;