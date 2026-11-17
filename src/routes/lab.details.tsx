import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, FlaskConical, Trash2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/app/common";
import { saveLabDetails, useSession, useStore, type Lab } from "@/lib/store";
import { labTestCatalogue, validateLabTests, type LabTest } from "@/lib/lab-tests";
import { CURRENCY, fmtPrice } from "@/lib/utils";
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

const emptyDraft = () => ({ name: "", price: "", details: "", turnaround: "", sample: "", preparation: "" });
function LabDetailsForm({ lab, userId }: { lab: Lab; userId: string }) {
  const [tests, setTests] = useState(() => labTestCatalogue(lab));
  const [draft, setDraft] = useState(emptyDraft);
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const reset = () => { setDraft(emptyDraft()); setEditing(null); };
  const addTest = () => {
    const test: LabTest = { ...draft, name: draft.name.trim(), price: draft.price.trim() ? Number(draft.price) : NaN, details: draft.details.trim(), turnaround: draft.turnaround.trim() };
    const next = editing === null ? [...tests, test] : tests.map((t, i) => i === editing ? test : t);
    try {
      // Legacy entries may remain incomplete until edited, but each new or edited test must be complete.
      validateLabTests([test]);
      if (tests.some((t, i) => i !== editing && t.name.toLowerCase() === test.name.toLowerCase())) throw new Error("This test is already listed");
      setTests(next); reset();
    } catch (e) { toast.error((e as Error).message); }
  };
  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (Object.values(draft).some((v) => v.trim())) { toast.error("Add or update the test before saving"); return; }
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setBusy(true);
    try {
      await saveLabDetails(userId, { labName: f.labName, phone: f.phone, address: f.address, city: f.city, hours: f.hours || undefined, tests: tests.map((t) => t.name).join(", "), testCatalogue: tests });
      toast.success("Saved");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const field = (key: keyof typeof draft, value: string) => setDraft((d) => ({ ...d, [key]: value }));
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Lab details" />
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label htmlFor="lab-name">Laboratory name</Label><Input id="lab-name" name="labName" defaultValue={lab.labName} required /></div>
        <div><Label htmlFor="lab-phone">Phone / WhatsApp</Label><Input id="lab-phone" name="phone" defaultValue={lab.phone} required /></div>
        <div><Label htmlFor="lab-city">City</Label><Input id="lab-city" name="city" defaultValue={lab.city} required /></div>
        <div className="sm:col-span-2"><Label htmlFor="lab-address">Address</Label><Input id="lab-address" name="address" defaultValue={lab.address} required /></div>
        <div className="sm:col-span-2"><Label htmlFor="lab-hours">Timings</Label><Input id="lab-hours" name="hours" defaultValue={lab.hours} placeholder="e.g. 8 AM – 10 PM, all days" /></div>
        <section className="space-y-3 border-t pt-5 sm:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-semibold"><FlaskConical className="size-5 text-primary" />Tests offered</h2>
            <span className="text-sm text-muted-foreground">{tests.length} tests</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="test-name">Test name *</Label><Input id="test-name" value={draft.name} onChange={(e) => field("name", e.target.value)} placeholder="Complete Blood Count (CBC)" aria-required="true" /></div>
            <div><Label htmlFor="test-price">Price ({CURRENCY}) *</Label><Input id="test-price" type="number" min="0.01" step="0.01" value={draft.price} onChange={(e) => field("price", e.target.value)} placeholder="e.g. 1500" aria-required="true" /></div>
            <div className="sm:col-span-2"><Label htmlFor="test-details">Test details *</Label><Textarea id="test-details" value={draft.details} onChange={(e) => field("details", e.target.value)} placeholder="What the test measures or includes" aria-required="true" /></div>
            <div><Label htmlFor="test-turnaround">Report ready in *</Label><Input id="test-turnaround" value={draft.turnaround} onChange={(e) => field("turnaround", e.target.value)} placeholder="e.g. 24 hours" aria-required="true" /></div>
            <div><Label htmlFor="test-sample">Sample type (optional)</Label><Input id="test-sample" value={draft.sample} onChange={(e) => field("sample", e.target.value)} placeholder="e.g. Blood" /></div>
            <div className="sm:col-span-2"><Label htmlFor="test-preparation">Preparation (optional)</Label><Input id="test-preparation" value={draft.preparation} onChange={(e) => field("preparation", e.target.value)} placeholder="e.g. Fast for 8 hours" /></div>
          </div>
          <div className="flex gap-2"><Button type="button" onClick={addTest}>{editing === null ? <Plus /> : <Pencil />}{editing === null ? "Add test" : "Update test"}</Button>{editing !== null && <Button type="button" variant="ghost" onClick={reset}><X />Cancel</Button>}</div>
          {tests.length === 0 ? <p className="py-4 text-sm text-muted-foreground">No tests added yet.</p> : <ul className="divide-y border-y">
            {tests.map((test, index) => <li key={`${test.name}-${index}`} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0 space-y-1 break-words text-sm"><p className="font-semibold">{test.name}</p>{test.price > 0 && <p>{fmtPrice(test.price)}</p>}<p>{test.details}</p>{test.turnaround && <p className="text-muted-foreground">Report ready in: {test.turnaround}</p>}{test.sample && <p>Sample: {test.sample}</p>}{test.preparation && <p>Preparation: {test.preparation}</p>}{(!test.price || !test.details || !test.turnaround) && <p className="text-destructive">Required details missing</p>}</div>
              <div className="flex shrink-0"><Button type="button" variant="ghost" size="icon" aria-label={`Edit ${test.name}`} title={`Edit ${test.name}`} onClick={() => { setEditing(index); setDraft({ name: test.name, price: test.price > 0 ? String(test.price) : "", details: test.details, turnaround: test.turnaround, sample: test.sample ?? "", preparation: test.preparation ?? "" }); }}><Pencil /></Button><Button type="button" variant="ghost" size="icon" className="text-destructive" aria-label={`Remove ${test.name}`} title={`Remove ${test.name}`} onClick={() => { setTests((current) => current.filter((_, i) => i !== index)); reset(); }}><Trash2 /></Button></div>
            </li>)}
          </ul>}
        </section>
        <Button type="submit" disabled={busy} className="sm:col-span-2">{busy ? "Saving…" : "Save"}</Button>
      </form>
    </div>
  );
}
