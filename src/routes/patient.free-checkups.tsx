import { Link } from "@tanstack/react-router";
import { DocList } from "@/components/app/common";
import { VolunteerCall } from "@/components/app/VolunteerCall";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { HeartHandshake, MapPin, SlidersHorizontal, Video } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/app/common";
import { bookVolunteer, isVolunteerSessionUpcoming, setVolunteerBookingStatus, useSession, useStore, volunteerSpotsLeft, type VolunteerSession } from "@/lib/store";
import { fmtTime } from "@/lib/utils";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/patient/free-checkups")({
  head: () => meta("Free checkups", "Book a free checkup with a volunteer doctor, in clinic or online."),
  component: FreeCheckups,
});

function FreeCheckups() {
  const user = useSession();
  const s = useStore((x) => x);
  const [mode, setMode] = useState("all");
  const [q, setQ] = useState("");
  const [spec, setSpec] = useState("all");
  const [city, setCity] = useState("all");
  const [date, setDate] = useState("");
  const [part, setPart] = useState("all");
  const [openOnly, setOpenOnly] = useState(false);
  const [sort, setSort] = useState("soon");
  const doctor = (id: string) => ({ u: s.users.find((u) => u.id === id), d: s.doctors.find((d) => d.userId === id) });
  const term = q.trim().toLowerCase();
  const upcoming = s.volunteerSessions.filter((v) => isVolunteerSessionUpcoming(v));
  const specs = [...new Set(upcoming.map((v) => doctor(v.doctorId).d?.specialization).filter((x): x is string => !!x))].sort();
  const cities = [...new Set(upcoming.map((v) => v.city).filter((x): x is string => !!x))].sort();
  const hour = (t: string) => Number(t.slice(0, 2));
  const sessions = upcoming.filter((v) => mode === "all" || v.mode === mode).filter((v) => {
    const { u, d } = doctor(v.doctorId);
    if (spec !== "all" && d?.specialization !== spec) return false;
    if (city !== "all" && v.city !== city) return false;
    if (date && v.date !== date) return false;
    if (part === "morning" && hour(v.start) >= 12) return false;
    if (part === "afternoon" && (hour(v.start) < 12 || hour(v.start) >= 17)) return false;
    if (part === "evening" && hour(v.start) < 17) return false;
    if (openOnly && volunteerSpotsLeft(v, s) <= 0) return false;
    if (!term) return true;
    return [u?.name, d?.specialization, v.city, v.location, v.focus].some((x) => x?.toLowerCase().includes(term));
  }).sort((a, b) => sort === "spots" ? volunteerSpotsLeft(b, s) - volunteerSpotsLeft(a, s) : `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
  const activeFilters = [mode !== "all", spec !== "all", city !== "all", !!date, part !== "all", openOnly, !!term].filter(Boolean).length;
  const reset = () => { setMode("all"); setSpec("all"); setCity("all"); setDate(""); setPart("all"); setOpenOnly(false); setQ(""); setSort("soon"); };
  const mine = s.volunteerBookings.filter((b) => b.patientId === user?.id && b.status !== "Cancelled");
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Free checkups" subtitle="Volunteer doctors offering free consultations." />
      {mine.length > 0 && <section className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">My free checkups</h2>
        <div className="grid gap-3 sm:grid-cols-2">{mine.map((b) => {
          const v = s.volunteerSessions.find((x) => x.id === b.sessionId);
          if (!v) return null;
          return <article key={b.id} className="rounded-2xl border bg-card p-4 shadow-soft">
            <p className="font-display text-2xl font-semibold text-primary">Token #{b.token}</p>
            <p className="text-sm">Booking: {b.id} · Reason: {b.reason}</p><p className="text-sm">Session: {fmtTime(v.start)}–{fmtTime(v.end)}</p><p className="font-medium">{doctor(v.doctorId).u?.name} · {v.date}, {fmtTime(v.start)}</p>
            <p className="text-sm text-muted-foreground">{v.status === "Cancelled" ? "Cancelled by doctor" : v.mode === "online" ? "Online" : `${v.location}${v.city ? `, ${v.city}` : ""}`} · {b.memberName ?? "Me"} · {b.status}</p>
            {v.mode === "online" && v.status === "Open" && ["Booked","In Consultation"].includes(b.status) && <VolunteerCall bookingId={b.id} name={b.memberName ?? user?.name ?? ""} />}
            {s.consultations.filter(c=>c.appointmentId===b.id&&c.completedAt).map(c=><section key={c.appointmentId} className="mt-3 space-y-2 border-t pt-3"><h3 className="font-semibold">Consultation record</h3><p>{c.diagnosis}</p><p>{c.summary}</p>{c.prescription.map((r,i)=><p key={i}>{r.medicine} · {r.dosage} · {r.frequency} · {r.duration}</p>)}<DocList docs={c.documents}/>{c.followUpRequired&&<p>Follow-up: {c.followUpTiming}</p>}</section>)}
            {b.status === "Booked" && v.status === "Open" && <Button size="sm" variant="ghost" className="mt-2 text-destructive" onClick={() => setVolunteerBookingStatus(b.id, "Cancelled").then(() => toast.success("Booking cancelled"), (e) => toast.error(e.message))}>Cancel booking</Button>}
          </article>;
        })}</div>
      </section>}
      <div className="mb-5 rounded-2xl border bg-card p-4 shadow-soft">
        <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <p className="flex items-center gap-2 text-sm font-bold"><SlidersHorizontal className="h-4 w-4 text-primary" />Filters{activeFilters ? ` (${activeFilters})` : ""}</p>
          {activeFilters > 0 && <Button size="sm" variant="ghost" onClick={reset}>Clear all</Button>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input className="sm:col-span-2" placeholder="Search doctor, speciality, focus, place…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
          <Select value={mode} onValueChange={setMode}><SelectTrigger aria-label="Where"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Online & in clinic</SelectItem><SelectItem value="clinic">In clinic</SelectItem><SelectItem value="online">Online</SelectItem></SelectContent></Select>
          <Select value={spec} onValueChange={setSpec}><SelectTrigger aria-label="Speciality"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All specialities</SelectItem>{specs.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select>
          <Select value={city} onValueChange={setCity}><SelectTrigger aria-label="City"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All cities</SelectItem>{cities.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
          <Select value={part} onValueChange={setPart}><SelectTrigger aria-label="Time of day"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Any time</SelectItem><SelectItem value="morning">Morning (before 12 PM)</SelectItem><SelectItem value="afternoon">Afternoon (12–5 PM)</SelectItem><SelectItem value="evening">Evening (after 5 PM)</SelectItem></SelectContent></Select>
          <Select value={sort} onValueChange={setSort}><SelectTrigger aria-label="Sort"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="soon">Soonest first</SelectItem><SelectItem value="spots">Most spots left</SelectItem></SelectContent></Select>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm"><Checkbox checked={openOnly} onCheckedChange={(v) => setOpenOnly(!!v)} />Only show sessions with free spots</label>
        <p className="mt-2 text-xs text-muted-foreground">{sessions.length} session{sessions.length === 1 ? "" : "s"} found</p>
      </div>
      {sessions.length === 0 && <p className="text-sm text-muted-foreground">No free checkup sessions match these filters.</p>}
      <div className="grid gap-4 md:grid-cols-2">{sessions.map((v) => <SessionOffer key={v.id} v={v} name={doctor(v.doctorId).u?.name ?? "Doctor"} spec={doctor(v.doctorId).d?.specialization} />)}</div>
    </div>
  );
}

function SessionOffer({ v, name, spec }: { v: VolunteerSession; name: string; spec?: string }) {
  const s = useStore((x) => x);
  const [reason, setReason] = useState("");
  const [forOther, setForOther] = useState("");
  const [busy, setBusy] = useState(false);
  const left = volunteerSpotsLeft(v, s);
  const booked = s.volunteerBookings.some(b=>b.sessionId===v.id&&b.patientId===s.sessionUserId&&b.status!=="Cancelled");
  const book = async () => {
    setBusy(true);
    try { const b = await bookVolunteer(v.id, reason, forOther.trim() || undefined); toast.success(`Booked — your token is #${b.token}`); setReason(""); setForOther(""); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <article className="rounded-2xl border bg-card p-5 shadow-soft">
      <p className="flex items-center gap-2 font-semibold"><HeartHandshake className="h-4 w-4 text-primary" />{name}{spec ? ` · ${spec}` : ""}</p>
      <p className="text-sm">{v.date} · {fmtTime(v.start)} – {fmtTime(v.end)}</p>
      <p className="flex items-center gap-1 text-sm text-muted-foreground">{v.mode === "online" ? <><Video className="h-4 w-4" />Online</> : <><MapPin className="h-4 w-4" />{v.location}{v.city ? `, ${v.city}` : ""}</>}</p>
      {v.focus && <p className="text-sm">Focus: {v.focus}</p>}
      {v.notes && <p className="text-sm text-muted-foreground">{v.notes}</p>}
      <p className="mt-1 text-sm font-medium">{left > 0 ? `${left} free spots left` : "Full"}</p>
      {booked&&<p className="mt-3 font-medium text-primary">Already booked</p>}
      {left > 0 && !booked && !s.sessionUserId && <Button asChild className="mt-3 w-full"><Link to="/login">Sign in to book</Link></Button>}
      {left > 0 && !booked && !!s.sessionUserId && <div className="mt-3 space-y-2">
        <Input placeholder="Reason for visit" value={reason} onChange={(e) => setReason(e.target.value)} />
        <Input placeholder="Patient name (only if for someone else)" value={forOther} onChange={(e) => setForOther(e.target.value)} />
        <Button onClick={book} disabled={busy} className="w-full">Book free spot</Button>
      </div>}
    </article>
  );
}
