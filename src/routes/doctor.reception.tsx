import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/app/common";
import { refreshAll, updateReceptionPermissions, useSession, useStore, type ReceptionPermissions } from "@/lib/store";
import { createReceptionist, removeReceptionist } from "@/lib/reception.functions";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/doctor/reception")({
  head: () => meta("Reception accounts", "Create front-desk logins and choose what they can do."),
  component: DoctorReception,
});

const PERMS: [keyof ReceptionPermissions, string][] = [["book", "Book appointments"], ["queue", "See today's queue"], ["checkIn", "Mark patients as arrived / absent"], ["cancel", "Cancel appointments"]];

function DoctorReception() {
  const user = useSession();
  const list = useStore((s) => s.receptionists.filter((r) => r.doctorId === user?.id));
  const create = useServerFn(createReceptionist);
  const remove = useServerFn(removeReceptionist);
  const [f, setF] = useState({ name: "", email: "", phone: "", password: "" });
  const [perms, setPerms] = useState<ReceptionPermissions>({ book: true, queue: true, checkIn: true, cancel: false });
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await create({ data: { ...f, permissions: perms } }); await refreshAll(); toast.success("Reception account created — share the email and password with your receptionist"); setF({ name: "", email: "", phone: "", password: "" }); }
    catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Reception accounts" subtitle="Front-desk logins with limited access to your clinic" />
      <form onSubmit={submit} className="grid gap-3 rounded-2xl border bg-card p-6 shadow-soft sm:grid-cols-2">
        <div><Label htmlFor="rn">Name</Label><Input id="rn" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><Label htmlFor="rp">Phone</Label><Input id="rp" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
        <div><Label htmlFor="re">Login email</Label><Input id="re" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div><Label htmlFor="rw">Password</Label><Input id="rw" type="password" minLength={8} required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
        <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2">{PERMS.map(([k, l]) => <label key={k} className="flex items-center gap-2 text-sm"><Switch checked={perms[k]} onCheckedChange={(v) => setPerms({ ...perms, [k]: v })} />{l}</label>)}</div>
        <Button className="sm:col-span-2" disabled={busy}>{busy ? "Creating…" : "Create reception account"}</Button>
      </form>
      <div className="mt-6 space-y-3">
        {list.length === 0 && <p className="text-sm text-muted-foreground">No reception accounts yet.</p>}
        {list.map((r) => (
          <section key={r.id} className="rounded-2xl border bg-card p-5 shadow-soft">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{r.name}</p><p className="text-sm text-muted-foreground">{r.email}{r.phone ? ` · ${r.phone}` : ""}</p></div>
              <Button variant="ghost" size="sm" onClick={async () => { if (!confirm(`Remove ${r.name}'s account?`)) return; try { await remove({ data: { id: r.id } }); await refreshAll(); toast.success("Removed"); } catch (e) { toast.error((e as Error).message); } }}>Remove</Button></div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">{PERMS.map(([k, l]) => <label key={k} className="flex items-center gap-2 text-sm"><Switch checked={r.permissions[k]} onCheckedChange={(v) => updateReceptionPermissions(r.id, { ...r.permissions, [k]: v }).catch((e) => toast.error((e as Error).message))} />{l}</label>)}</div>
          </section>
        ))}
      </div>
    </div>
  );
}
