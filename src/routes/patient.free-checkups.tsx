import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { HeartHandshake, MapPin, Video } from "lucide-react";
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
  if (!user) return null;
  const doctor = (id: string) => ({ u: s.users.find((u) => u.id === id), d: s.doctors.find((d) => d.userId === id) });
  const term = q.trim().toLowerCase();
  const sessions = s.volunteerSessions.filter((v) => isVolunteerSessionUpcoming(v) && (mode === "all" || v.mode === mode)).filter((v) => {
    if (!term) return true;
    const { u, d } = doctor(v.doctorId);
    return [u?.name, d?.specialization, v.city, v.location, v.focus].some((x) => x?.toLowerCase().includes(term));
  }).sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
  const mine = s.volunteerBookings.filter((b) => b.patientId === user.id && b.status !== "Cancelled");
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
            <p className="font-medium">{doctor(v.doctorId).u?.name} · {v.date}, {fmtTime(v.start)}</p>
            <p className="text-sm text-muted-foreground">{v.status === "Cancelled" ? "Cancelled by doctor" : v.mode === "online" ? "Online" : `${v.location}${v.city ? `, ${v.city}` : ""}`} · {b.memberName ?? "Me"} · {b.status}</p>
            {b.status === "Booked" && v.status === "Open" && <Button size="sm" variant="ghost" className="mt-2 text-destructive" onClick={() => setVolunteerBookingStatus(b.id, "Cancelled").then(() => toast.success("Booking cancelled"), (e) => toast.error(e.message))}>Cancel booking</Button>}
          </article>;
        })}</div>
      </section>}
      <div className="mb-4 flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Search doctor, speciality, city…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={mode} onValueChange={setMode}><SelectTrigger className="w-40" aria-label="Where"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="clinic">In clinic</SelectItem><SelectItem value="online">Online</SelectItem></SelectContent></Select>
      </div>
      {sessions.length === 0 && <p className="text-sm text-muted-foreground">No free checkup sessions available right now.</p>}
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
      {left > 0 && <div className="mt-3 space-y-2">
        <Input placeholder="Reason for visit" value={reason} onChange={(e) => setReason(e.target.value)} />
        <Input placeholder="Patient name (only if for someone else)" value={forOther} onChange={(e) => setForOther(e.target.value)} />
        <Button onClick={book} disabled={busy} className="w-full">Book free spot</Button>
      </div>}
    </article>
  );
}
