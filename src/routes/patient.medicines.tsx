import { createFileRoute } from "@tanstack/react-router";
import { PremiumHero } from "@/components/app/common";
import { MedicineFinder } from "@/components/app/MedicineFinder";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/patient/medicines")({
  head: () => meta("Find medicine", "Search medical stores that have the medicine you need."),
  component: () => (
    <div className="mx-auto max-w-5xl">
      <PremiumHero eyebrow="HealthSahoolat pharmacy" title="Find medicine" subtitle="See which medical stores have it, then call, WhatsApp or visit them." />
      <MedicineFinder />
    </div>
  ),
});
