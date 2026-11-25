import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/app/common";
import { saveLabDetails, useSession, useStore, type Lab } from "@/lib/store";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/lab/details")({
  head: () => meta("Lab details", "Your laboratory's contact details, test prices and report turnaround times."),
  component: LabDetails,
});

function LabDetails() {
  const user = useSession();
  const lab = useStore((s) => s.labs.find((x) => x.userId === user?.id));
  if (!user || !lab) return null;
  return <LabDetailsForm key={user.id} lab={lab} userId={user.id} />;
}

function LabDetailsForm({ lab, userId }: { lab: Lab; userId: string }) {
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setBusy(true);
    try {
      await saveLabDetails(userId, { labName: f.labName, phone: f.phone, address: f.address, city: f.city, hours: f.hours || undefined, });
      toast.success("Saved");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Lab details" />
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label htmlFor="lab-name">Laboratory name</Label><Input id="lab-name" name="labName" defaultValue={lab.labName} required /></div>
        <div><Label htmlFor="lab-phone">Phone / WhatsApp</Label><Input id="lab-phone" name="phone" defaultValue={lab.phone} required /></div>
        <div><Label htmlFor="lab-city">City</Label><Input id="lab-city" name="city" defaultValue={lab.city} required /></div>
        <div className="sm:col-span-2"><Label htmlFor="lab-address">Address</Label><Input id="lab-address" name="address" defaultValue={lab.address} required /></div>
        <div className="sm:col-span-2"><Label htmlFor="lab-hours">Timings</Label><Input id="lab-hours" name="hours" defaultValue={lab.hours} placeholder="e.g. 8 AM – 10 PM, all days" /></div>
        <p className="text-sm text-muted-foreground sm:col-span-2">Tests, packages and prices are managed in Services → Home sample collection.</p>
        <Button type="submit" disabled={busy} className="sm:col-span-2">{busy ? "Saving…" : "Save"}</Button>
      </form>
    </div>
  );
}
