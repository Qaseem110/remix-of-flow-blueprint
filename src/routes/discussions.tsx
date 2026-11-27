import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FileText, Image as ImageIcon, LayoutGrid, MessagesSquare, PlayCircle, Search, SlidersHorizontal, Stethoscope, X } from "lucide-react";
import { BrandLogo } from "@/components/app/BrandLogo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PostComposer } from "@/components/feed/PostComposer";
import { PostList } from "@/components/feed/PostCard";
import { useFeedViewer, usePosts, type PostKind } from "@/lib/feed";
import { meta } from "@/lib/meta";

type Kind = "all" | PostKind;
type Author = "all" | "doctor" | "patient";
type Sort = "new" | "liked" | "discussed";
type Search = { kind?: Kind; q?: string; author?: Author; sort?: Sort };
const KINDS: { v: Kind; label: string; icon: typeof FileText }[] = [
  { v: "all", label: "All", icon: LayoutGrid },
  { v: "blog", label: "Blogs", icon: FileText },
  { v: "forum", label: "Discussions", icon: MessagesSquare },
  { v: "photo", label: "Photos", icon: ImageIcon },
  { v: "video", label: "Videos", icon: PlayCircle },
];
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | undefined => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : undefined);

export const Route = createFileRoute("/discussions")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const o: Search = {};
    const kind = oneOf(s["kind"], ["all", "blog", "forum", "photo", "video"] as const); if (kind) o.kind = kind;
    const author = oneOf(s["author"], ["all", "doctor", "patient"] as const); if (author) o.author = author;
    const sort = oneOf(s["sort"], ["new", "liked", "discussed"] as const); if (sort) o.sort = sort;
    if (typeof s["q"] === "string" && s["q"].trim()) o.q = s["q"].slice(0, 200);
    return o;
  },
  head: () => meta("Community — blogs, discussions, photos & videos", "Search health blogs, discussions, photos and videos from doctors and patients. Read freely, sign in to post, like or comment."),
  component: Community,
});

function Community() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const kind = search.kind ?? "all", author = search.author ?? "all", sort = search.sort ?? "new", q = search.q ?? "";
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  const set = (patch: Partial<Search>) => void navigate({ to: ".", search: (prev) => ({ ...prev, ...patch }), replace: true });
  const viewer = useFeedViewer();
  const res = usePosts(kind === "all" ? { q } : { kinds: [kind], q });
  const posts = useMemo(() => {
    const list = (res.data ?? []).filter((p) => author === "all" || (author === "doctor" ? p.author_role === "doctor" : p.author_role !== "doctor"));
    if (sort === "liked") return [...list].sort((a, b) => b.likes - a.likes);
    if (sort === "discussed") return [...list].sort((a, b) => b.comments - a.comments);
    return list;
  }, [res.data, author, sort]);
  const canPost = viewer && (viewer.role === "doctor" || viewer.role === "patient");
  const composerKinds: PostKind[] = viewer?.role === "doctor" ? (kind === "all" ? ["forum", "blog", "photo", "video"] : [kind]) : ["forum"];
  const showComposer = canPost && (viewer.role === "doctor" || kind === "all" || kind === "forum");
  const active = (q ? 1 : 0) + (author !== "all" ? 1 : 0) + (sort !== "new" ? 1 : 0);
  return (
    <div className="min-h-screen bg-linear-to-b from-secondary/60 to-background">
      <header className="bg-hero text-primary-foreground">
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-5 sm:px-6">
          <Link to="/" aria-label="HealthSahoolat home" className="inline-block rounded-xl bg-card px-3 py-2"><BrandLogo className="h-7" /></Link>
          <p className="mt-8 text-xs font-bold uppercase tracking-[0.2em] opacity-80">HealthSahoolat community</p>
          <h1 className="mt-2 font-display text-3xl font-bold sm:text-5xl">{q ? <>Results for “{q}”</> : "Learn, ask & share"}</h1>
          <p className="mt-2 max-w-xl opacity-85">Blogs, discussions, photos and videos from verified doctors and fellow patients.</p>
          <form onSubmit={(e) => { e.preventDefault(); set({ q: text.trim() || undefined }); }} className="mt-6 grid max-w-2xl grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-2xl bg-card p-2 shadow-soft">
            <div className="relative min-w-0"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search the community" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search a problem, topic or doctor's post…" className="h-11 border-0 pl-9 text-foreground shadow-none" /></div>
            <Button type="submit" className="h-11">Search</Button>
          </form>
        </div>
      </header>
      <div className="mx-auto -mt-8 max-w-6xl space-y-5 px-4 pb-12 sm:px-6">
        <div className="rounded-[22px] border bg-card p-3 shadow-soft">
          <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Content type">
            {KINDS.map((k) => <button key={k.v} type="button" role="tab" aria-selected={kind === k.v} onClick={() => set({ kind: k.v === "all" ? undefined : k.v })} className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${kind === k.v ? "bg-sidebar text-primary-foreground shadow-soft" : "text-foreground/75 hover:bg-secondary"}`}><k.icon className="h-4 w-4" />{k.label}</button>)}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3 text-sm">
            <span className="flex items-center gap-1 font-semibold text-muted-foreground"><SlidersHorizontal className="h-4 w-4" />Filter</span>
            <select aria-label="Posted by" value={author} onChange={(e) => set({ author: e.target.value === "all" ? undefined : (e.target.value as Author) })} className="h-9 rounded-full border bg-background px-3"><option value="all">Anyone</option><option value="doctor">Doctors only</option><option value="patient">Patients only</option></select>
            <select aria-label="Sort" value={sort} onChange={(e) => set({ sort: e.target.value === "new" ? undefined : (e.target.value as Sort) })} className="h-9 rounded-full border bg-background px-3"><option value="new">Newest</option><option value="liked">Most liked</option><option value="discussed">Most comments</option></select>
            <span className="ml-auto text-muted-foreground">{posts.length} posts</span>
            {active > 0 && <Button size="sm" variant="ghost" onClick={() => { setText(""); set({ q: undefined, author: undefined, sort: undefined }); }}><X className="h-4 w-4" />Clear</Button>}
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="min-w-0 space-y-5">
            {showComposer ? <div className="rounded-[22px] border bg-card p-1 shadow-soft"><PostComposer key={kind} kinds={composerKinds} /></div> : !viewer && <div className="rounded-[22px] border bg-card p-5 text-sm shadow-soft"><Link to="/login" className="font-semibold text-primary underline">Sign in</Link> to post, like or comment.</div>}
            <PostList posts={posts} loading={res.isLoading} empty={q ? `Nothing found for “${q}”. Try other words.` : "No posts yet."} />
          </div>
          <aside className="hidden space-y-4 lg:block">
            <div className="sticky top-4 rounded-[22px] border bg-card p-5 shadow-soft">
              <p className="flex items-center gap-2 font-bold text-secondary-foreground"><Stethoscope className="h-4 w-4 text-primary" />Community guidelines</p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground"><li>Be respectful and kind.</li><li>Don't share private medical records.</li><li>Advice here is not a diagnosis — book a doctor for care.</li></ul>
              <Link to="/patient/doctors" className="mt-4 block rounded-full bg-primary px-4 py-2 text-center text-sm font-bold text-primary-foreground">Find a doctor</Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
