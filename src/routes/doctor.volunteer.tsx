import { VolunteerCall } from "@/components/app/VolunteerCall";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { HeartHandshake, MapPin, Pencil, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, Stat } from "@/components/app/common";
import { cancelVolunteerSession, isVolunteerSessionUpcoming, saveVolunteerSession, setVolunteerBookingStatus, todayStr, useSession, useStore, volunteerSpotsLeft, type VolunteerInput, type VolunteerSession } from "@/lib/store";
import { fmtTime } from "@/lib/utils";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/doctor/volunteer")({
  head: () => meta("Volunteer free checkups", "Offer free patient checkups on your own days and times, in clinic or online."),
  component: VolunteerPage,
});

function VolunteerPage() {
  const user = useSession();
  const s = useStore((x) => x);
  const [editing, setEditing] = useState<VolunteerSession | null>(null);
  if (!user) return null;
  const dp = s.doctors.find((d) => d.userId === user.id);
  const mine = s.volunteerSessions.filter((v) => v.doctorId === user.id).sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
  const upcoming = mine.filter((v) => isVolunteerSessionUpcoming(v));
  const past = mine.filter((v) => !isVolunteerSessionUpcoming(v)).reverse();
  const bookings = s.volunteerBookings.filter((b) => mine.some((v) => v.id === b.sessionId));
  const helped = bookings.filter((b) => b.status === "Attended").length;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Volunteer" subtitle="Give free checkups on the days and times that suit you." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Upcoming sessions" value={upcoming.length} />
        <Stat label="Patients booked" value={bookings.filter((b) => b.status === "Booked").length} />
        <Stat label="Free checkups given" value={helped} />
      </div>
      <SessionForm key={editing?.id ?? "new"} editing={editing} defaults={{ location: dp?.clinicAddress, city: dp?.city }} onDone={() => setEditing(null)} />
      <h2 className="mb-3 mt-8 text-lg font-semibold">Upcoming</h2>
      {upcoming.length === 0 && <p className="text-sm text-muted-foreground">No upcoming volunteer sessions.</p>}
      <div className="space-y-4">{upcoming.map((v) => <SessionCard key={v.id} v={v} onEdit={() => { setEditing(v); window.scrollTo({ top: 0, behavior: "smooth" }); }} />)}</div>
      {past.length > 0 && <>
        <h2 className="mb-3 mt-8 text-lg font-semibold">Past & cancelled</h2>
        <div className="space-y-4">{past.map((v) => <SessionCard key={v.id} v={v} />)}</div>
      </>}
    </div>
  );
}

function SessionForm({ editing, defaults, onDone }: { editing: VolunteerSession | null; defaults: { location?: string; city?: string }; onDone: () => void }) {
  const [f, setF] = useState<VolunteerInput>(editing ? { date: editing.date, start: editing.start, end: editing.end, mode: editing.mode, location: editing.location, city: editing.city, capacity: editing.capacity, focus: editing.focus, notes: editing.notes } : { date: todayStr(), start: "10:00", end: "13:00", mode: "clinic", location: defaults.location, city: defaults.city, capacity: 10, focus: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const up = (p: Partial<VolunteerInput>) => setF((x) => ({ ...x, ...p }));
  const submit = async () => {
    setBusy(true);
    try { await saveVolunteerSession(f, editing?.id); toast.success(editing ? "Session updated — booked patients notified" : "Volunteer session published"); onDone(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-soft">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><HeartHandshake className="h-5 w-5 text-primary" />{editing ? "Edit session" : "Offer a free checkup session"}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div><Label htmlFor="v-date">Day</Label><Input id="v-date" type="date" min={todayStr()} value={f.date} onChange={(e) => up({ date: e.target.value })} /></div>
        <div><Label htmlFor="v-start">From</Label><Input id="v-start" type="time" value={f.start} onChange={(e) => up({ start: e.target.value })} /></div>
        <div><Label htmlFor="v-end">Until</Label><Input id="v-end" type="time" value={f.end} onChange={(e) => up({ end: e.target.value })} /></div>
        <div><Label htmlFor="v-cap">Free spots</Label><Input id="v-cap" type="number" min={1} max={200} value={f.capacity} onChange={(e) => up({ capacity: Number(e.target.value) })} /></div>
        <div><Label>Where</Label>
          <Select value={f.mode} onValueChange={(m) => up({ mode: m as VolunteerInput["mode"] })}>
            <SelectTrigger aria-label="Where"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="clinic">In clinic</SelectItem><SelectItem value="online">Online</SelectItem></SelectContent>
          </Select>
        </div>
        {f.mode === "clinic" && <>
          <div className="sm:col-span-2"><Label htmlFor="v-loc">Clinic / camp address</Label><Input id="v-loc" value={f.location ?? ""} onChange={(e) => up({ location: e.target.value })} placeholder="e.g. Al-Shifa Clinic, Main Road" /></div>
          <div><Label htmlFor="v-city">City</Label><Input id="v-city" value={f.city ?? ""} onChange={(e) => up({ city: e.target.value })} /></div>
        </>}
        <div className="sm:col-span-2"><Label htmlFor="v-focus">Focus (optional)</Label><Input id="v-focus" value={f.focus ?? ""} onChange={(e) => up({ focus: e.target.value })} placeholder="e.g. Children, diabetes screening, elderly" /></div>
        <div className="sm:col-span-2"><Label htmlFor="v-notes">Note for patients (optional)</Label><Textarea id="v-notes" rows={2} value={f.notes ?? ""} onChange={(e) => up({ notes: e.target.value })} placeholder="Bring old reports, fasting needed…" /></div>
      </div>
      <div className="mt-4 flex gap-2">
        <Button onClick={submit} disabled={busy}>{editing ? "Save changes" : "Publish session"}</Button>
        {editing && <Button variant="ghost" onClick={onDone}>Cancel edit</Button>}
      </div>
    </section>
  );
}

function SessionCard({ v, onEdit }: { v: VolunteerSession; onEdit?: () => void }) {
  const s = useStore((x) => x);
  const list = s.volunteerBookings.filter((b) => b.sessionId === v.id && b.status !== "Cancelled").sort((a, b) => (a.token ?? 0) - (b.token ?? 0));
  const name = (b: (typeof list)[number]) => b.memberName ?? s.users.find((u) => u.id === b.patientId)?.name ?? "Patient";
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); } catch (e) { toast.error((e as Error).message); } };
  return (
    <article className="rounded-2xl border bg-card p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{v.date} · {fmtTime(v.start)} – {fmtTime(v.end)}</p>
          <p className="flex items-center gap-1 text-sm text-muted-foreground">{v.mode === "online" ? <><Video className="h-4 w-4" />Online</> : <><MapPin className="h-4 w-4" />{v.location}{v.city ? `, ${v.city}` : ""}</>}</p>
          {v.focus && <p className="text-sm">Focus: {v.focus}</p>}
          <p className="text-sm text-muted-foreground">{v.status === "Cancelled" ? "Cancelled" : `${volunteerSpotsLeft(v, s)} of ${v.capacity} free spots left`}</p>
        </div>
        {onEdit && v.status === "Open" && <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={onEdit}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm("Cancel this session? Booked patients will be notified.")) void act(() => cancelVolunteerSession(v.id)); }}><X className="mr-1 h-3.5 w-3.5" />Cancel</Button>
        </div>}
      </div>
      {list.length > 0 && <ul className="mt-3 divide-y rounded-xl border">
        {list.map((b) => <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
          <span className="min-w-0"><b>Token #{b.token}</b> · {name(b)} · <span className="text-muted-foreground">{b.reason}</span></span>
          {v.mode === "online" && b.status === "Booked" && <VolunteerCall bookingId={b.id} name={s.users.find(u => u.id === v.doctorId)?.name ?? "Doctor"} />}
          {b.status === "Booked" ? <span className="flex gap-1">
            <Button size="sm" variant="secondary" onClick={() => act(() => setVolunteerBookingStatus(b.id, "Attended"))}>Checked</Button>
            <Button size="sm" variant="ghost" onClick={() => act(() => setVolunteerBookingStatus(b.id, "Missed"))}>Absent</Button>
          </span> : <span className="text-xs text-muted-foreground">{b.status}</span>}
        </li>)}
      </ul>}
    </article>
  );
}
