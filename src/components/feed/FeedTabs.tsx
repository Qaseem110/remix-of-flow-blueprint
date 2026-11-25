import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePosts, type PostKind } from "@/lib/feed";
import { PostList } from "./PostCard";

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
export function FeedTabs({ authorId }: { authorId?: string }) {
  return (
    <Tabs defaultValue="all">
      <TabsList className="flex h-auto flex-wrap">{TABS.filter((t) => !authorId || t.value !== "forum").map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}</TabsList>
      {TABS.map((t) => <TabsContent key={t.value} value={t.value}>{authorId ? <AuthorPosts authorId={authorId} kinds={t.kinds.filter((k) => k !== "forum")} /> : <TabPosts kinds={t.kinds} />}</TabsContent>)}
    </Tabs>
  );
}
function AuthorPosts({ authorId, kinds }: { authorId: string; kinds: PostKind[] }) {
  const q = usePosts({ kinds, authorId });
  return <PostList posts={q.data} loading={q.isLoading} empty="No posts yet." />;
}
