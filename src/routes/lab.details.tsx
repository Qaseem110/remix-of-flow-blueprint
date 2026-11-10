import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/app/common";
import { updateLab, useSession, useStore } from "@/lib/store";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/lab/details")({
  head: () => meta("Lab details", "Your laboratory's contact details and tests."),
  component: LabDetails,
});

function LabDetails() {
  const user = useSession()!;
  const l = useStore((s) => s.labs.find((x) => x.userId === user.id));
  if (!l) return null;
  const save = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    updateLab(user.id, { labName: f.labName, phone: f.phone, address: f.address, city: f.city, hours: f.hours || undefined, tests: f.tests || undefined });
    toast.success("Saved");
  };
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Lab details" subtitle="Patients see these when searching for a laboratory." />
      <form onSubmit={save} className="grid gap-3 rounded-2xl border bg-card p-6 shadow-soft sm:grid-cols-2">
        <div className="sm:col-span-2"><Label>Laboratory name</Label><Input name="labName" defaultValue={l.labName} required /></div>
        <div><Label>Phone / WhatsApp</Label><Input name="phone" defaultValue={l.phone} required /></div>
        <div><Label>City</Label><Input name="city" defaultValue={l.city} required /></div>
        <div className="sm:col-span-2"><Label>Address</Label><Input name="address" defaultValue={l.address} required /></div>
        <div className="sm:col-span-2"><Label>Timings</Label><Input name="hours" defaultValue={l.hours} placeholder="e.g. 8 AM – 10 PM, all days" /></div>
        <div className="sm:col-span-2"><Label>Tests offered</Label><Textarea name="tests" defaultValue={l.tests} placeholder="CBC, LFT, RFT, Lipid profile, X-Ray, Ultrasound…" /></div>
        <Button type="submit" className="sm:col-span-2">Save</Button>
      </form>
    </div>
  );
}
