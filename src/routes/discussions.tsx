import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/app/BrandLogo";
import { MessagesSquare, Stethoscope } from "lucide-react";
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
    <div className="min-h-screen bg-linear-to-b from-secondary/60 to-background">
      <header className="bg-hero text-primary-foreground">
        <div className="mx-auto max-w-5xl px-4 pb-14 pt-5 sm:px-6">
          <Link to="/" aria-label="HealthSahoolat home" className="inline-block rounded-xl bg-card px-3 py-2"><BrandLogo className="h-7" /></Link>
          <div className="mt-8 flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary-foreground/15"><MessagesSquare className="h-6 w-6" /></span><p className="text-xs font-bold uppercase tracking-[0.2em] opacity-80">Community</p></div>
          <h1 className="mt-3 font-display text-4xl font-bold sm:text-5xl">Discussions</h1>
          <p className="mt-2 max-w-xl opacity-85">Ask questions and share experiences with verified doctors and fellow patients.</p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold"><span className="flex items-center gap-1 rounded-full bg-primary-foreground/15 px-3 py-1.5"><Stethoscope className="h-3.5 w-3.5" />Doctors answer</span><span className="rounded-full bg-primary-foreground/15 px-3 py-1.5">{q.data?.length ?? 0} discussions</span></div>
        </div>
      </header>
      <div className="mx-auto -mt-8 grid max-w-5xl gap-6 px-4 pb-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0 space-y-5">
          {canPost ? <div className="rounded-[22px] border bg-card p-1 shadow-soft"><PostComposer kinds={["forum"]} /></div> : !viewer && <div className="rounded-[22px] border bg-card p-5 shadow-soft text-sm"><Link to="/login" className="font-semibold text-primary underline">Sign in</Link> to start a discussion, like or comment.</div>}
          <PostList posts={q.data} loading={q.isLoading} empty="No discussions yet." />
        </div>
        <aside className="hidden space-y-4 lg:block">
          <div className="sticky top-4 rounded-[22px] border bg-card p-5 shadow-soft">
            <p className="font-bold text-secondary-foreground">Community guidelines</p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground"><li>Be respectful and kind.</li><li>Don't share private medical records.</li><li>Advice here is not a diagnosis — book a doctor for care.</li></ul>
            <Link to="/patient/doctors" className="mt-4 block rounded-full bg-primary px-4 py-2 text-center text-sm font-bold text-primary-foreground">Find a doctor</Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
