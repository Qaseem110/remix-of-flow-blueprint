import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, FlaskConical, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/app/common";
import { updateLab, useSession, useStore } from "@/lib/store";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/lab/details")({
  head: () => meta("Lab details", "Your laboratory's contact details and tests."),
  component: LabDetails,
});

function LabDetails() {
  const user = useSession();
  const l = useStore((s) => s.labs.find((x) => x.userId === user?.id));
  if (!user || !l) return null;
  return <LabDetailsForm key={user.id} lab={l} userId={user.id} />;
}

function LabDetailsForm({ lab: l, userId }: { lab: NonNullable<ReturnType<typeof useStore>["labs"][number]>; userId: string }) {
  const [tests, setTests] = useState(() => (l.tests ?? "").split(/[,\n]/).map((test) => test.trim()).filter(Boolean));
  const [newTest, setNewTest] = useState("");
  const addTest = () => {
    const additions = newTest.split(/[,\n]/).map((test) => test.trim()).filter(Boolean);
    if (!additions.length) return;
    setTests((current) => {
      const next = [...current];
      for (const test of additions) {
        if (!next.some((item) => item.toLowerCase() === test.toLowerCase())) next.push(test);
      }
      return next;
    });
    setNewTest("");
  };
  const save = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const allTests = [...tests];
    for (const test of newTest.split(/[,\n]/).map((item) => item.trim()).filter(Boolean)) {
      if (!allTests.some((item) => item.toLowerCase() === test.toLowerCase())) allTests.push(test);
    }
    updateLab(userId, { labName: f.labName, phone: f.phone, address: f.address, city: f.city, hours: f.hours || undefined, tests: allTests.join(", ") });
    setTests(allTests);
    setNewTest("");
    toast.success("Saved");
  };
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Lab details" />
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label>Laboratory name</Label><Input name="labName" defaultValue={l.labName} required /></div>
        <div><Label>Phone / WhatsApp</Label><Input name="phone" defaultValue={l.phone} required /></div>
        <div><Label>City</Label><Input name="city" defaultValue={l.city} required /></div>
        <div className="sm:col-span-2"><Label>Address</Label><Input name="address" defaultValue={l.address} required /></div>
        <div className="sm:col-span-2"><Label>Timings</Label><Input name="hours" defaultValue={l.hours} placeholder="e.g. 8 AM – 10 PM, all days" /></div>
        <section className="space-y-3 border-t pt-5 sm:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-semibold"><FlaskConical className="size-5 text-primary" />Tests offered</h2>
            <span className="text-sm text-muted-foreground">{tests.length} tests</span>
          </div>
          <Label htmlFor="lab-test-name">Test name</Label>
          <div className="flex gap-2">
            <Input id="lab-test-name" value={newTest} onChange={(e) => setNewTest(e.target.value)} placeholder="e.g. Complete Blood Count (CBC)" className="min-w-0 flex-1" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTest(); } }} />
            <Button type="button" onClick={addTest} disabled={!newTest.trim()}><Plus />Add</Button>
          </div>
          {tests.length === 0 ? <p className="py-4 text-sm text-muted-foreground">No tests added yet.</p> : (
            <ul className="divide-y border-y">
              {tests.map((test, index) => <li key={`${test}-${index}`} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 break-words text-sm">{test}</span>
                <Button type="button" variant="ghost" size="icon" className="shrink-0 text-destructive" aria-label={`Remove ${test}`} title={`Remove ${test}`} onClick={() => setTests((current) => current.filter((_, i) => i !== index))}><Trash2 /></Button>
              </li>)}
            </ul>
          )}
        </section>
        <Button type="submit" className="sm:col-span-2">Save</Button>
      </form>
    </div>
  );
}
