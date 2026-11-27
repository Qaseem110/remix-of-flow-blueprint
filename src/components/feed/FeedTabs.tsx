import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePosts, type PostKind } from "@/lib/feed";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Heart, MessageCircle, PlayCircle, FileText, Image as ImageIcon, MessagesSquare } from "lucide-react";
import { KIND_LABEL, useImageUrls, type Post } from "@/lib/feed";
import { PostList } from "./PostCard";

const KIND_ICON = { blog: FileText, photo: ImageIcon, video: PlayCircle, forum: MessagesSquare } as const;
function CompactCard({ post }: { post: Post }) {
  const urls = useImageUrls(post.images.slice(0, 1));
  const Icon = KIND_ICON[post.kind];
  const text = post.kind === "video" ? post.summary : post.body;
  return (
    <Link to="/feed/$postId" params={{ postId: post.id }} className="group flex flex-col overflow-hidden rounded-[18px] border bg-card shadow-soft transition hover:-translate-y-1 hover:border-primary">
      <div className="relative h-32 overflow-hidden bg-linear-to-br from-secondary to-muted">
        {urls[0] ? <img src={urls[0]} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" /> : <Icon className="absolute inset-0 m-auto h-10 w-10 text-primary/40" />}
        <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-card/95 px-2.5 py-1 text-[11px] font-bold text-secondary-foreground"><Icon className="h-3 w-3 text-primary" />{KIND_LABEL[post.kind]}</span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 font-semibold text-secondary-foreground group-hover:text-primary">{post.title}</h3>
        {text && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{text}</p>}
        <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-xs text-muted-foreground">
          <span className="min-w-0 truncate font-semibold text-foreground">{post.author_name || "Member"}</span>
          <span className="flex shrink-0 items-center gap-3"><span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" />{post.likes}</span><span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />{post.comments}</span></span>
        </div>
      </div>
    </Link>
  );
}
function CompactPosts({ kinds }: { kinds: PostKind[] }) {
  const q = usePosts({ kinds });
  if (q.isLoading) return <p className="py-8 text-center text-muted-foreground">Loading…</p>;
  const posts = (q.data ?? []).slice(0, 6);
  if (!posts.length) return <p className="rounded-[18px] border border-dashed py-10 text-center text-sm text-muted-foreground">Nothing posted yet.</p>;
  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{posts.map((p) => <CompactCard key={p.id} post={p} />)}</div>
      <div className="mt-6 text-center"><Link to="/discussions" className="inline-flex items-center gap-1 rounded-full border px-5 py-2 text-sm font-bold text-primary hover:border-primary">View all posts <ArrowRight className="h-4 w-4" /></Link></div>
    </div>
  );
}

const TABS: { value: string; label: string; kinds: PostKind[] }[] = [
  { value: "all", label: "All", kinds: ["blog", "photo", "video", "forum"] },
  { value: "blog", label: "Blogs", kinds: ["blog"] },
  { value: "photo", label: "Photos", kinds: ["photo"] },
  { value: "video", label: "Videos", kinds: ["video"] },
  { value: "forum", label: "Discussions", kinds: ["forum"] },
];
function TabPosts({ kinds }: { kinds: PostKind[] }) {
  const q = usePosts({ kinds });
  return <PostList posts={q.data} loading={q.isLoading} empty="Nothing posted yet." />;
}
export function FeedTabs({ authorId, compact = false }: { authorId?: string; compact?: boolean }) {
  return (
    <Tabs defaultValue="all">
      <TabsList className={compact ? "mb-2 inline-flex h-auto w-fit max-w-full flex-wrap rounded-full p-1" : "flex h-auto flex-wrap"}>{TABS.filter((t) => !authorId || t.value !== "forum").map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}</TabsList>
      {TABS.map((t) => <TabsContent key={t.value} value={t.value}>{authorId ? <AuthorPosts authorId={authorId} kinds={t.kinds.filter((k) => k !== "forum")} /> : compact ? <CompactPosts kinds={t.kinds} /> : <TabPosts kinds={t.kinds} />}</TabsContent>)}
    </Tabs>
  );
}
function AuthorPosts({ authorId, kinds }: { authorId: string; kinds: PostKind[] }) {
  const q = usePosts({ kinds, authorId });
  return <PostList posts={q.data} loading={q.isLoading} empty="No posts yet." />;
}
