import { BrandLogo } from "@/components/app/BrandLogo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Stethoscope, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PostCard } from "@/components/feed/PostCard";
import { addComment, deleteComment, useComments, useFeedViewer, usePost } from "@/lib/feed";

export const Route = createFileRoute("/feed/$postId")({
  head: () => ({ meta: [
    { title: "Post — Sahoolat" }, { name: "description", content: "Read, like and discuss health posts from doctors and patients on Sahoolat." },
    { property: "og:title", content: "Post — Sahoolat" }, { property: "og:description", content: "Read, like and discuss health posts from doctors and patients on Sahoolat." },
    { property: "og:type", content: "article" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: PostPage,
});

function PostPage() {
  const { postId } = Route.useParams();
  const post = usePost(postId);
  const comments = useComments(postId);
  const viewer = useFeedViewer();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["comments", postId] }), qc.invalidateQueries({ queryKey: ["post", postId] }), qc.invalidateQueries({ queryKey: ["posts"] })]);
  const send = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await addComment(postId, text); setText(""); await refresh(); } catch (er) { toast.error((er as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <Link to="/" aria-label="HealthSahoolat home"><BrandLogo className="h-8" /></Link>
        <Button variant="ghost" size="sm" asChild><Link to="/discussions"><ArrowLeft />Discussions</Link></Button>
      </div>
      {post.isLoading ? <p className="text-muted-foreground">Loading…</p> : !post.data ? <p className="text-muted-foreground">This post is unavailable.</p> : <>
        <PostCard post={post.data} full />
        <section className="space-y-3">
          <h2 className="font-semibold">Comments ({comments.data?.length ?? 0})</h2>
          {viewer ? <form onSubmit={send} className="space-y-2"><Textarea aria-label="Write a comment" placeholder="Write a comment" value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} /><Button type="submit" size="sm" disabled={busy || !text.trim()}>Comment</Button></form>
            : <p className="rounded-xl border bg-secondary/40 p-3 text-sm"><Link to="/login" className="font-medium text-primary underline">Sign in</Link> to like and comment.</p>}
          <ul className="space-y-3">{comments.data?.map((c) => <li key={c.id} className="rounded-xl border bg-card p-3 text-sm">
            <div className="flex items-center justify-between gap-2"><p className="font-semibold">{c.author_name || "Member"} <span className="text-xs font-normal capitalize text-muted-foreground">· {c.author_role}</span></p>
              {viewer && (viewer.id === c.author_id || viewer.role === "admin") && <Button variant="ghost" size="icon" aria-label="Delete comment" onClick={async () => { try { await deleteComment(c.id); await refresh(); } catch (er) { toast.error((er as Error).message); } }}><Trash2 /></Button>}</div>
            <p className="mt-1 whitespace-pre-wrap">{c.body}</p></li>)}</ul>
        </section>
      </>}
    </div>
  );
}
