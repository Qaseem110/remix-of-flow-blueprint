import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/app/common";
import { saveLabSchedule, useSession, useStore } from "@/lib/store";
import { emptyLabSchedule, type LabSchedule } from "@/lib/lab-schedule";
import type { Shift } from "@/lib/schedule";
import { clinicDate } from "@/lib/appointment-lifecycle";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/lab/availability")({ head: () => meta("Laboratory availability", "Set laboratory test appointment hours, duration and available places."), component: LabAvailability });
function LabAvailability() {
  const user = useSession();
  const lab = useStore((s) => s.labs.find((l) => l.userId === user?.id));
  if (!user || !lab) return null;
  return <Editor key={user.id} id={user.id} initial={lab.schedule ?? emptyLabSchedule()} />;
}
function Editor({ id, initial }: { id: string; initial: LabSchedule }) {
  const [s, setS] = useState(initial);
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const update = (key: "weeklyShifts" | "dateOverrides", day: string, shifts: Shift[]) => setS((v) => ({ ...v, [key]: { ...v[key], [day]: shifts } }));
  const shiftsEditor = (key: "weeklyShifts" | "dateOverrides", day: string, title: string) => {
    const shifts = s[key][day] ?? [];
    return <section key={day} className="border-b py-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{title}</h2><div className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={() => update(key, day, [...shifts, { start: shifts.length ? "14:00" : "09:00", end: shifts.length ? "17:00" : "12:00", capacity: 1 }])}><Plus className="h-4 w-4" />Add shift</Button>{key === "dateOverrides" && <Button type="button" size="icon" variant="ghost" title="Remove date override" aria-label={`Remove override ${day}`} onClick={() => setS((v) => { const overrides = { ...v.dateOverrides }; delete overrides[day]; return { ...v, dateOverrides: overrides }; })}><Trash2 className="h-4 w-4" /></Button>}</div></div>
      {!shifts.length && <p className="text-sm text-muted-foreground">Closed</p>}
      <div className="space-y-3">{shifts.map((sh, i) => <div key={i} className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <div><Label>From</Label><Input aria-label={`${title} shift ${i + 1} start`} type="time" value={sh.start} onChange={(e) => update(key, day, shifts.map((v, n) => n === i ? { ...v, start: e.target.value } : v))} /></div>
        <div><Label>Until</Label><Input aria-label={`${title} shift ${i + 1} end`} type="time" value={sh.end} onChange={(e) => update(key, day, shifts.map((v, n) => n === i ? { ...v, end: e.target.value } : v))} /></div>
        <div><Label>Patients per time slot</Label><Input aria-label={`${title} shift ${i + 1} capacity`} type="number" min={1} value={sh.capacity} onChange={(e) => update(key, day, shifts.map((v, n) => n === i ? { ...v, capacity: Number(e.target.value) } : v))} /></div>
        <Button type="button" size="icon" variant="ghost" className="text-destructive" title="Remove shift" aria-label={`Remove ${title} shift ${i + 1}`} onClick={() => update(key, day, shifts.filter((_, n) => n !== i))}><Trash2 className="h-4 w-4" /></Button>
      </div>)}</div>
    </section>;
  };
  return <div className="mx-auto max-w-4xl"><PageHeader title="Laboratory availability" />
    <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await saveLabSchedule(id, s); toast.success("Lab availability saved"); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } }}>
      <div className="max-w-xs"><Label>Minutes per test appointment</Label><Input aria-label="Minutes per test appointment" type="number" min={5} max={240} value={s.slotMinutes} onChange={(e) => setS((v) => ({ ...v, slotMinutes: Number(e.target.value) }))} /></div>
      {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, i) => shiftsEditor("weeklyShifts", String(i), day))}
      <section className="mt-6"><h2 className="mb-3 text-lg font-semibold">Special dates</h2><div className="flex flex-wrap gap-2"><Input aria-label="Special date" type="date" min={clinicDate()} value={date} onChange={(e) => setDate(e.target.value)} className="w-48" /><Button type="button" variant="outline" disabled={!date} onClick={() => { update("dateOverrides", date, s.dateOverrides[date] ?? []); setDate(""); }}><Plus className="h-4 w-4" />Add date</Button></div>{Object.keys(s.dateOverrides).sort().map((day) => shiftsEditor("dateOverrides", day, day))}</section>
      <Button className="mt-6" type="submit" disabled={busy}><Save className="h-4 w-4" />{busy ? "Saving…" : "Save availability"}</Button>
    </form></div>;
}