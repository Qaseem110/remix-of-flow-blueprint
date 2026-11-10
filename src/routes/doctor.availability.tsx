import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/app/common";
import { BlockSlots } from "@/components/app/BlockSlots";
import { ShiftEditor } from "@/components/app/ShiftEditor";
import { persistAvailability, scheduleShifts, weekdayShifts, todayStr, updateDoctorProfile, useSession, useStore, type Availability as Schedule, type Shift } from "@/lib/store";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/doctor/availability")({
  head: () => meta("Availability", "Customize weekly clinic shifts, patient limits, special dates and days off."),
  component: Availability,
});
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function ScheduleForm({ av }: { av: Schedule }) {
  const dp = useStore((s) => s.doctors.find((d) => d.userId === av.doctorId));
  const [week, setWeek] = useState<Record<string, Shift[]>>(() => Object.fromEntries(DAYS.map((_, i) => [String(i), weekdayShifts(av, i).map((s) => ({ ...s }))])));
  const [overrides, setOverrides] = useState<Record<string, Shift[]>>(av.dateOverrides ?? {});
  const [date, setDate] = useState(todayStr());
  const [blockDate, setBlockDate] = useState(todayStr());
  const [consult, setConsult] = useState(av.consultMinutes ? String(av.consultMinutes) : "");
  const [perSlot, setPerSlot] = useState(av.patientsPerSlot && av.patientsPerSlot > 1 ? String(av.patientsPerSlot) : "1");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const changeDay = (day: string, shifts: Shift[]) => { setWeek((w) => ({ ...w, [day]: shifts })); setDirty(true); };
  const changeOverrides = (next: Record<string, Shift[]>) => { setOverrides(next); setDirty(true); };
  const save = async () => {
    setBusy(true);
    try {
      await persistAvailability({ ...av, weeklyShifts: week, dateOverrides: overrides, consultMinutes: consult ? Number(consult) : undefined, patientsPerSlot: Number(perSlot) > 1 ? Number(perSlot) : undefined, days: DAYS.map((_, i) => i).filter((i) => week[String(i)]?.length) });
      setDirty(false); toast.success("Schedule saved");
    } catch (error) { toast.error((error as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Availability" subtitle="Clinic shifts & consultation settings" />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div className="flex flex-wrap gap-5">
          {dp && <><label className="flex items-center gap-2 text-sm"><Switch checked={dp.online} onCheckedChange={(v) => updateDoctorProfile(av.doctorId, { online: v })} />Online</label><label className="flex items-center gap-2 text-sm"><Switch checked={dp.clinic} onCheckedChange={(v) => updateDoctorProfile(av.doctorId, { clinic: v })} />In-clinic</label></>}
          <div className="flex items-center gap-2"><Label htmlFor="consult-minutes" className="text-sm">Time per patient</Label><Input id="consult-minutes" type="number" min={1} max={240} placeholder="Auto" className="h-9 w-20" value={consult} onChange={(e) => { setConsult(e.target.value); setDirty(true); }} /><span className="text-sm text-muted-foreground">min</span></div>
          <div className="flex items-center gap-2"><Label htmlFor="per-slot" className="text-sm">Patients at the same time</Label><Input id="per-slot" type="number" min={1} max={50} className="h-9 w-20" value={perSlot} onChange={(e) => { setPerSlot(e.target.value); setDirty(true); }} /></div>
        </div>
        <Button onClick={save} disabled={busy || !dirty}>{busy ? "Saving…" : "Save schedule"}</Button>
      </div>
      <Tabs defaultValue="weekly">
        <TabsList className="mb-4 flex h-auto flex-wrap justify-start"><TabsTrigger value="weekly">Weekly schedule</TabsTrigger><TabsTrigger value="dates">Special dates</TabsTrigger><TabsTrigger value="blocked">Unavailable times</TabsTrigger></TabsList>
        <TabsContent value="weekly">
          {DAYS.map((day, i) => {
            const shifts = week[String(i)] ?? [];
            return <section key={day} aria-label={day} className="grid gap-4 border-b py-5 md:grid-cols-[180px_1fr]">
              <div><div className="flex items-center justify-between gap-3 md:justify-start"><h2 className="font-semibold">{day}</h2><Switch aria-label={`${day} working`} checked={shifts.length > 0} onCheckedChange={(v) => changeDay(String(i), v ? [{ start: "09:00", end: "12:00", capacity: 10 }] : [])} /></div><p className="mt-1 text-xs text-muted-foreground">{shifts.reduce((sum, s) => sum + (s.capacity || 0), 0)} patients</p>
              {shifts.length > 0 && <Button size="sm" variant="ghost" className="mt-2 px-0" onClick={() => { setWeek(Object.fromEntries(DAYS.map((_, d) => [String(d), (week[String(d)]?.length || d === i) ? shifts.map((s) => ({ ...s })) : []]))); setDirty(true); }}><Copy className="mr-1 h-3.5 w-3.5" />Copy to working days</Button>}</div>
              <ShiftEditor shifts={shifts} onChange={(next) => changeDay(String(i), next)} id={`day-${i}`} />
            </section>;
          })}
        </TabsContent>
        <TabsContent value="dates">
          <div className="mb-5 flex flex-wrap items-end gap-3 border-b pb-5"><div><Label htmlFor="special-date">Date</Label><Input id="special-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-44" /></div><Button variant="outline" disabled={!date || !!overrides[date]} onClick={() => changeOverrides({ ...overrides, [date]: scheduleShifts({ ...av, weeklyShifts: week }, date) })}>Add special date</Button></div>
          {Object.entries(overrides).sort(([a], [b]) => a.localeCompare(b)).map(([day, shifts]) => <section key={day} aria-label={`Special ${day}`} className="border-b py-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">{day} · {shifts.reduce((sum, s) => sum + (s.capacity || 0), 0)} patients</h2><Button size="icon" variant="ghost" aria-label={`Remove special date ${day}`} title="Restore weekly schedule" onClick={() => { const next = { ...overrides }; delete next[day]; changeOverrides(next); }}><Trash2 className="h-4 w-4" /></Button></div><ShiftEditor shifts={shifts} id={`date-${day}`} onChange={(next) => changeOverrides({ ...overrides, [day]: next })} /><Button size="sm" variant="ghost" className="mt-2" onClick={() => changeOverrides({ ...overrides, [day]: [] })}>Mark day off</Button></section>)}
        </TabsContent>
        <TabsContent value="blocked"><BlockSlots doctorId={av.doctorId} date={blockDate} onDate={setBlockDate} /></TabsContent>
      </Tabs>
      {dirty && <div className="mt-5 flex justify-end"><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save schedule"}</Button></div>}
    </div>
  );
}
function Availability() {
  const user = useSession();
  const av = useStore((s) => s.availability.find((a) => a.doctorId === user?.id));
  if (!user) return null;
  // Doctors without a saved schedule start from a default weekday schedule instead of a blank page.
  const schedule: Schedule = av ?? { doctorId: user.id, days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00", duration: 30 };
  return <ScheduleForm key={`${schedule.doctorId}-${av ? "saved" : "new"}`} av={schedule} />;
}
