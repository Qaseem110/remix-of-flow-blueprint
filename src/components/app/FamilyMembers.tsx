import { useState } from "react";
import { toast } from "sonner";
import { Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addFamilyMember, removeFamilyMember, setActiveMember, useStore } from "@/lib/store";

export function FamilyMembers({ userId }: { userId: string }) {
  const members = useStore((s) => s.patients.find((p) => p.userId === userId)?.members) ?? [];
  const [f, setF] = useState({ name: "", relation: "", dob: "", gender: "" });
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    try { addFamilyMember(userId, { ...f, relation: f.relation.trim() || "Other" }); setF({ name: "", relation: "", dob: "", gender: "" }); toast.success("Linked account added"); }
    catch (err) { toast.error((err as Error).message); }
  };
  return (
    <section className="mt-6 rounded-2xl border bg-card p-6 shadow-soft">
      <h2 className="text-xl font-semibold">Family & linked accounts</h2>
      <p className="mb-4 text-sm text-muted-foreground">Add family members or friends. Each person keeps their own appointments and reports. Switch between them from the top bar.</p>
      <ul className="mb-4 space-y-2">
        {members.length === 0 && <li className="text-sm text-muted-foreground">No linked accounts yet.</li>}
        {members.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
            <div><p className="font-medium">{m.name}</p><p className="text-xs text-muted-foreground">{m.relation}{m.gender ? ` · ${m.gender}` : ""}{m.dob ? ` · ${m.dob}` : ""}</p></div>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => { setActiveMember(m.id); toast.success(`Switched to ${m.name}`); }}>Switch</Button>
              <Button size="icon" variant="ghost" aria-label={`Remove ${m.name}`} onClick={() => { try { removeFamilyMember(userId, m.id); } catch (err) { toast.error((err as Error).message); } }}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="m-name">Full name</Label><Input id="m-name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><Label htmlFor="m-rel">Relation</Label><Input id="m-rel" placeholder="Sister, Father, Friend…" value={f.relation} onChange={(e) => setF({ ...f, relation: e.target.value })} /></div>
        <div><Label htmlFor="m-dob">Date of birth</Label><Input id="m-dob" type="date" value={f.dob} onChange={(e) => setF({ ...f, dob: e.target.value })} /></div>
        <div><Label htmlFor="m-gen">Gender</Label><Input id="m-gen" value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })} /></div>
        <Button className="sm:col-span-2" variant="secondary"><UserPlus className="mr-1 h-4 w-4" />Add linked account</Button>
      </form>
    </section>
  );
}
