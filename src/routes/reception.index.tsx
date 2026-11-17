import { ClinicSelect } from "@/components/app/ClinicSelect";
import type { CareItem } from "@/lib/care";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, StatusBadge } from "@/components/app/common";
import { BookingDatePicker } from "@/components/app/widgets";
import { bookWalkIn, cancelAppointment, dayAppointments, receptionAttendance, nextAvailableDate, nextBooking, receptionFor, todayStr, useSession, useStore, type ConsultType } from "@/lib/store";
import { fmtTime } from "@/lib/utils";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/reception/")({
  head: () => meta("Reception — book & queue", "Book appointments for walk-in patients and follow the doctor's queue."),
  component: Reception,
});

function Reception() {
  const user = useSession();
  const rec = useStore((s) => receptionFor(user?.id, s));
  const doctor = useStore((s) => s.users.find((u) => u.id === rec?.doctorId));
  const dp = useStore((s) => s.doctors.find((d) => d.userId === rec?.doctorId));
  const [clinicId,setClinicId] = useState("");
  const [branch,setBranch] = useState<CareItem>();
  const [date, setDate] = useState(() => (rec ? nextAvailableDate(rec.doctorId) : null) ?? todayStr());
  const allocation = useStore((s) => (rec ? nextBooking(rec.doctorId, date, s, clinicId || undefined) : null));
  const today = useStore((s) => (rec ? dayAppointments(rec.doctorId, todayStr(), s, clinicId || undefined) : []));
  const [f, setF] = useState({ name: "", phone: "", age: "", gender: "", reason: "" });
  const [type, setType] = useState<ConsultType>("clinic");
  const [busy, setBusy] = useState(false);
  const [attendanceBusy, setAttendanceBusy] = useState<string | null>(null);
  const attendance = async (id: string, arrived: boolean) => {
    setAttendanceBusy(id);
    try { await receptionAttendance(id, arrived); toast.success(arrived ? "Marked as arrived" : "Marked as absent — queue continued"); }
    catch (e) { toast.error((e as Error).message); } finally { setAttendanceBusy(null); }
  };
  if (!user) return null;
  if (!rec) return <div className="mx-auto max-w-3xl"><PageHeader title="Reception" /><p className="text-muted-foreground">This reception account isn't linked to a doctor. Ask the doctor to add you again.</p></div>;
  const p = rec.permissions;
  const book = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const a = await bookWalkIn({ clinicId: clinicId || undefined, clinicName: branch ? String(branch.data.title) : dp?.clinicName, clinicAddress: branch ? String(branch.data.details) : dp?.clinicAddress, doctorId: rec.doctorId, date, reason: f.reason, type, name: f.name, phone: f.phone, age: f.age ? Number(f.age) : undefined, gender: f.gender || undefined });
      toast.success(`Booked — Queue #${a.queueNumber} at ${fmtTime(a.time)}. Message queued to ${f.phone}.`);
      setF({ name: "", phone: "", age: "", gender: "", reason: "" });
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  };
  const name = (a: (typeof today)[number]) => a.walkIn?.name ?? a.memberName ?? "Patient";
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Reception" subtitle={`${doctor?.name ?? "Doctor"} · ${dp?.clinicName ?? ""}`} />
      <ClinicSelect doctorId={rec.doctorId} value={clinicId} onChange={(id,b)=>{setClinicId(id);setBranch(b);}} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {p.book ? (
          <form onSubmit={book} className="space-y-4 rounded-2xl border bg-card p-6 shadow-soft">
            <h2 className="font-semibold">Book appointment</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label htmlFor="pn">Patient name</Label><Input id="pn" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
              <div><Label htmlFor="pp">Mobile number (WhatsApp)</Label><Input id="pp" required inputMode="tel" placeholder="03001234567" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
              <div><Label htmlFor="pa">Age</Label><Input id="pa" type="number" min={0} max={130} value={f.age} onChange={(e) => setF({ ...f, age: e.target.value })} /></div>
              <div><Label>Gender</Label><Select value={f.gender} onValueChange={(v) => setF({ ...f, gender: v })}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent><SelectItem value="Male">Male</SelectItem><SelectItem value="Female">Female</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent></Select></div>
            </div>
            <div className="flex gap-2">
              {(["clinic", "online"] as const).filter((t) => (t === "clinic" ? dp?.clinic : dp?.online)).map((t) => <Button key={t} type="button" variant={type === t ? "default" : "outline"} onClick={() => setType(t)}>{t === "clinic" ? "In-clinic" : "Online"}</Button>)}
            </div>
            <BookingDatePicker doctorId={rec.doctorId} date={date} onDate={setDate} clinicId={clinicId || undefined} />
            <div><Label htmlFor="pr">Reason</Label><Textarea id="pr" rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></div>
            <p className="text-sm text-muted-foreground">{allocation ? `Next place: Queue #${allocation.queueNumber} at ${fmtTime(allocation.time)}` : "No places left on this day."}</p>
            <Button className="w-full" disabled={busy || !allocation}>{busy ? "Booking…" : "Book & send message"}</Button>
          </form>
        ) : <p className="rounded-2xl border bg-card p-6 text-muted-foreground">The doctor hasn't allowed booking from this account.</p>}
        {p.queue ? (
          <section className="rounded-2xl border bg-card p-6 shadow-soft">
            <h2 className="mb-3 font-semibold">Today's queue</h2>
            {today.length === 0 && <p className="text-sm text-muted-foreground">No appointments today.</p>}
            <ul className="divide-y">
              {today.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <span className="w-10 font-display text-lg font-semibold">#{a.queueNumber}</span>
                  <div className="flex-1"><p className="font-medium">{name(a)}</p><p className="text-muted-foreground">{fmtTime(a.time)}{a.walkIn ? ` · ${a.walkIn.phone}` : ""}</p></div>
                  <StatusBadge status={a.status} />
                  {p.checkIn && a.type === "clinic" && ["Pending", "Confirmed", "Waiting", "Checked-In"].includes(a.status) && <>
                    <Button size="sm" variant="outline" disabled={attendanceBusy !== null || ["Waiting", "Checked-In"].includes(a.status)} onClick={() => attendance(a.id, true)}>Arrived</Button>
                    <Button size="sm" variant="outline" disabled={attendanceBusy !== null} onClick={() => attendance(a.id, false)}>Absent</Button>
                  </>}
                  {p.cancel && ["Confirmed", "Pending", "Waiting"].includes(a.status) && <Button size="sm" variant="ghost" onClick={() => { cancelAppointment(a.id, "doctor", "Cancelled at reception"); toast.success("Cancelled"); }}>Cancel</Button>}
                </li>
              ))}
            </ul>
          </section>
        ) : <p className="rounded-2xl border bg-card p-6 text-muted-foreground">Queue view is turned off for this account.</p>}
      </div>
    </div>
  );
}
