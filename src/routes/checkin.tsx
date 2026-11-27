import { BrandLogo } from "@/components/app/BrandLogo";
import { QueueTracker } from "@/components/app/QueueTracker";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/checkin")({
  head: () => ({ meta: [{ title: "Clinic check-in — Sahoolat" }, { name: "description", content: "Check in at the clinic with your appointment ID or phone number." }, { property: "og:title", content: "Clinic check-in — Sahoolat" }, { property: "og:description", content: "Arrived at the clinic? Check in here." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: CheckIn,
});

function CheckIn() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-hero p-6">
      <div className="w-full max-w-md rounded-3xl bg-card p-8 shadow-soft">
        <Link to="/" className="flex items-center gap-3 text-lg font-semibold"><BrandLogo className="h-8" /><span className="hidden border-l pl-3 text-muted-foreground sm:inline">Clinic check-in</span></Link>
        <div className="mt-6"><QueueTracker /></div>
      </div>
    </div>
  );
}
