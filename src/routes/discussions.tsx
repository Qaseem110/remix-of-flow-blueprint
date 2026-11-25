import { createFileRoute, Link } from "@tanstack/react-router";
import { Stethoscope } from "lucide-react";
import { PostComposer } from "@/components/feed/PostComposer";
import { PostList } from "@/components/feed/PostCard";
import { useFeedViewer, usePosts } from "@/lib/feed";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/discussions")({
  head: () => meta("Discussions", "Open health discussions between doctors and patients. Read freely, sign in to post, like or comment."),
  component: Discussions,
});

function Discussions() {
  const viewer = useFeedViewer();
  const q = usePosts({ kinds: ["forum"] });
  const canPost = viewer && (viewer.role === "doctor" || viewer.role === "patient");
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <Link to="/" className="flex items-center gap-2 font-display text-xl font-semibold"><Stethoscope className="size-6 text-primary" />Sahoolat</Link>
      <div><h1 className="font-display text-3xl font-semibold">Discussions</h1><p className="text-muted-foreground">Ask questions and share experiences with doctors and patients.</p></div>
      {canPost ? <PostComposer kinds={["forum"]} /> : !viewer && <p className="rounded-xl border bg-secondary/40 p-3 text-sm"><Link to="/login" className="font-medium text-primary underline">Sign in</Link> to start a discussion, like or comment.</p>}
      <PostList posts={q.data} loading={q.isLoading} empty="No discussions yet." />
    </div>
  );
}
