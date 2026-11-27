import { useState } from "react";
import { Plus, FlaskConical, Trash2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { saveLabDetails, useSession, useStore, type Lab } from "@/lib/store";
import { labTestCatalogue, validateLabTests, type LabTest } from "@/lib/lab-tests";
import { CURRENCY, fmtPrice } from "@/lib/utils";

/** The laboratory's tests & packages, kept with home sample collection so they live in one place. */
export function LabTestsEditor() {
  const user = useSession();
  const lab = useStore((s) => s.labs.find((x) => x.userId === user?.id));
  if (!user || !lab) return null;
  return <Editor key={user.id} lab={lab} userId={user.id} />;
}
const emptyDraft = () => ({ name: "", price: "", details: "", turnaround: "", sample: "", preparation: "", prescriptionRequired: false });
function Editor({ lab, userId }: { lab: Lab; userId: string }) {
  const [tests, setTests] = useState(() => labTestCatalogue(lab));
  const [draft, setDraft] = useState(emptyDraft);
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const reset = () => { setDraft(emptyDraft()); setEditing(null); };
  const persist = async (next: LabTest[]) => {
    setBusy(true);
    try { await saveLabDetails(userId, { tests: next.map((t) => t.name).join(", "), testCatalogue: next }); setTests(next); toast.success("Tests saved"); return true; }
    catch (e) { toast.error((e as Error).message); return false; } finally { setBusy(false); }
  };
  const addTest = async () => {
    const test: LabTest = { ...draft, name: draft.name.trim(), price: draft.price.trim() ? Number(draft.price) : NaN, details: draft.details.trim(), turnaround: draft.turnaround.trim() };
    try {
      validateLabTests([test]);
      if (tests.some((t, i) => i !== editing && t.name.toLowerCase() === test.name.toLowerCase())) throw new Error("This test is already listed");
    } catch (e) { toast.error((e as Error).message); return; }
    if (await persist(editing === null ? [...tests, test] : tests.map((t, i) => i === editing ? test : t))) reset();
  };
  const field = (key: "name" | "price" | "details" | "turnaround" | "sample" | "preparation", value: string) => setDraft((d) => ({ ...d, [key]: value }));
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-semibold"><FlaskConical className="size-5 text-primary" />Tests & packages</h2>
            <span className="text-sm text-muted-foreground">{tests.length} tests</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="test-name">Test / package name *</Label><Input id="test-name" value={draft.name} onChange={(e) => field("name", e.target.value)} placeholder="Complete Blood Count (CBC)" aria-required="true" /></div>
            <div><Label htmlFor="test-price">Price ({CURRENCY}) *</Label><Input id="test-price" type="number" min="0.01" step="0.01" value={draft.price} onChange={(e) => field("price", e.target.value)} placeholder="e.g. 1500" aria-required="true" /></div>
            <div className="sm:col-span-2"><Label htmlFor="test-details">Test details *</Label><Textarea id="test-details" value={draft.details} onChange={(e) => field("details", e.target.value)} placeholder="What the test measures or includes" aria-required="true" /></div>
            <div><Label htmlFor="test-turnaround">Report ready in *</Label><Input id="test-turnaround" value={draft.turnaround} onChange={(e) => field("turnaround", e.target.value)} placeholder="e.g. 24 hours" aria-required="true" /></div>
            <div><Label htmlFor="test-sample">Sample type (optional)</Label><Input id="test-sample" value={draft.sample} onChange={(e) => field("sample", e.target.value)} placeholder="e.g. Blood" /></div>
            <div className="sm:col-span-2"><Label htmlFor="test-preparation">Preparation (optional)</Label><Input id="test-preparation" value={draft.preparation} onChange={(e) => field("preparation", e.target.value)} placeholder="e.g. Fast for 8 hours" /></div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="size-4 accent-primary" checked={draft.prescriptionRequired} onChange={(e) => setDraft((d) => ({ ...d, prescriptionRequired: e.target.checked }))} />Doctor's prescription required for this test</label>
          </div>
          <div className="flex gap-2"><Button type="button" disabled={busy} onClick={addTest}>{editing === null ? <Plus /> : <Pencil />}{editing === null ? "Add test / package" : "Update test"}</Button>{editing !== null && <Button type="button" variant="ghost" onClick={reset}><X />Cancel</Button>}</div>
          {tests.length === 0 ? <p className="py-4 text-sm text-muted-foreground">No tests added yet.</p> : <ul className="divide-y border-y">
            {tests.map((test, index) => <li key={`${test.name}-${index}`} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0 space-y-1 break-words text-sm"><p className="font-semibold">{test.name}</p>{test.price > 0 && <p>{fmtPrice(test.price)}</p>}<p>{test.details}</p>{test.turnaround && <p className="text-muted-foreground">Report ready in: {test.turnaround}</p>}{test.sample && <p>Sample: {test.sample}</p>}{test.preparation && <p>Preparation: {test.preparation}</p>}<p className={test.prescriptionRequired ? "font-medium text-destructive" : "text-muted-foreground"}>{test.prescriptionRequired ? "Prescription required" : "No prescription needed"}</p>{(!test.price || !test.details || !test.turnaround) && <p className="text-destructive">Required details missing</p>}</div>
              <div className="flex shrink-0"><Button type="button" variant="ghost" size="icon" aria-label={`Edit ${test.name}`} title={`Edit ${test.name}`} onClick={() => { setEditing(index); setDraft({ name: test.name, price: test.price > 0 ? String(test.price) : "", details: test.details, turnaround: test.turnaround, sample: test.sample ?? "", preparation: test.preparation ?? "", prescriptionRequired: !!test.prescriptionRequired }); }}><Pencil /></Button><Button type="button" variant="ghost" size="icon" className="text-destructive" aria-label={`Remove ${test.name}`} title={`Remove ${test.name}`} disabled={busy} onClick={() => { void persist(tests.filter((_, i) => i !== index)); reset(); }}><Trash2 /></Button></div>
            </li>)}
          </ul>}
        </section>
  );
}
