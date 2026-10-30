import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Camera, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/app/common";
import { deleteMedicine, saveMedicine, useSession, useStore, type Medicine } from "@/lib/store";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/pharmacy/")({
  head: () => meta("My medicines", "List the medicines available at your medical store."),
  component: Inventory,
});

type Draft = { id?: string; name: string; formula: string; strength: string; form: string; packSize: string; price: string; inStock: boolean };
const blank: Draft = { name: "", formula: "", strength: "", form: "Tablet", packSize: "", price: "", inStock: true };

function Inventory() {
  const user = useSession()!;
  const meds = useStore((s) => s.medicines.filter((m) => m.pharmacyId === user.id));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [scanning, setScanning] = useState(false);
  const [q, setQ] = useState("");

  const scan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    setScanning(true);
    try {
      const dataUrl = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f); });
      const { scanMedicine } = await import("@/lib/scan-medicine.functions");
      const info = await scanMedicine({ data: { dataUrl } });
      if (!info) { toast.error("Couldn't read the photo — please fill the details yourself."); setDraft({ ...blank }); return; }
      setDraft({ name: info.name, formula: info.formula, strength: info.strength, form: info.form || "Tablet", packSize: info.packSize, price: info.price != null ? String(info.price) : "", inStock: true });
      toast.success("Photo read — check the details and save");
    } catch (err) { toast.error((err as Error).message); setDraft({ ...blank }); }
    finally { setScanning(false); }
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    try {
      saveMedicine({ id: draft.id, pharmacyId: user.id, name: draft.name, formula: draft.formula || undefined, strength: draft.strength, form: draft.form, packSize: draft.packSize || undefined, price: Number(draft.price), inStock: draft.inStock });
      toast.success("Medicine saved"); setDraft(null);
    } catch (err) { toast.error((err as Error).message); }
  };
  const edit = (m: Medicine) => setDraft({ id: m.id, name: m.name, formula: m.formula ?? "", strength: m.strength, form: m.form, packSize: m.packSize ?? "", price: String(m.price), inStock: m.inStock });
  const shown = meds.filter((m) => `${m.name} ${m.formula ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const F = (k: keyof Draft, label: string, type = "text") => (
    <div><Label htmlFor={k}>{label}</Label><Input id={k} type={type} value={String(draft?.[k] ?? "")} onChange={(e) => setDraft((d) => d && { ...d, [k]: e.target.value })} required={k === "name" || k === "price"} min={type === "number" ? 0 : undefined} step="any" /></div>
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="My medicines" subtitle="Patients can search these and contact your store directly." actions={
        <div className="flex gap-2">
          <label className={`inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ${scanning ? "pointer-events-none opacity-70" : ""}`}>
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}{scanning ? "Reading photo…" : "Scan medicine photo"}
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={scan} />
          </label>
          <Button variant="outline" onClick={() => setDraft({ ...blank })}><Plus className="mr-1 h-4 w-4" />Add manually</Button>
        </div>
      } />
      <Input className="mb-4 max-w-sm" placeholder="Search my list…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground"><tr>{["Medicine", "Strength", "Form / pack", "Price (Rs)", "In stock", ""].map((h) => <th key={h} className="p-3">{h}</th>)}</tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No medicines yet. Scan a photo or add one manually.</td></tr>}
            {shown.map((m) => (
              <tr key={m.id} className="border-t">
                <td className="p-3"><p className="font-medium">{m.name}</p>{m.formula && <p className="text-xs text-muted-foreground">{m.formula}</p>}</td>
                <td className="p-3">{m.strength}</td>
                <td className="p-3">{m.form}{m.packSize ? ` · ${m.packSize}` : ""}</td>
                <td className="p-3">{m.price.toLocaleString()}</td>
                <td className="p-3"><Switch checked={m.inStock} onCheckedChange={(v) => saveMedicine({ ...m, inStock: v })} aria-label="In stock" /></td>
                <td className="p-3"><div className="flex justify-end gap-2">
                  <button onClick={() => edit(m)} className="text-primary" aria-label={`Edit ${m.name}`}><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => { if (confirm(`Delete ${m.name}?`)) deleteMedicine(m.id); }} className="text-destructive" aria-label={`Delete ${m.name}`}><Trash2 className="h-4 w-4" /></button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{draft?.id ? "Edit medicine" : "Add medicine"}</DialogTitle></DialogHeader>
          <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">{F("name", "Medicine name")}</div>
            <div className="sm:col-span-2">{F("formula", "Formula / generic (optional)")}</div>
            {F("strength", "Strength (mg)")}
            {F("form", "Form (Tablet, Syrup…)")}
            {F("packSize", "Pack size (optional)")}
            {F("price", "Price (Rs)", "number")}
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><Switch checked={draft?.inStock ?? true} onCheckedChange={(v) => setDraft((d) => d && { ...d, inStock: v })} />Available in stock</label>
            <Button className="sm:col-span-2">Save</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
