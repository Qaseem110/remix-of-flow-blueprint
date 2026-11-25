import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/common";
import { PostComposer } from "@/components/feed/PostComposer";
import { FeedTabs } from "@/components/feed/FeedTabs";
import { useReputation } from "@/lib/feed";
import { useSession } from "@/lib/store";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/doctor/feed")({
  head: () => meta("My feed", "Write blogs, share pictures and video links with patients."),
  component: DoctorFeed,
});

function DoctorFeed() {
  const user = useSession();
  const rep = useReputation().data?.get(user?.id ?? "");
  if (!user) return null;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="My feed" subtitle={`Reputation ${rep?.score ?? 0} · ${rep?.likes ?? 0} likes · ${rep?.comments ?? 0} comments`} />
      <PostComposer kinds={["blog", "photo", "video"]} />
      <p className="text-sm text-muted-foreground">Join patient conversations in <Link to="/discussions" className="text-primary underline">Discussions</Link>.</p>
      <FeedTabs authorId={user.id} />
    </div>
  );
}
