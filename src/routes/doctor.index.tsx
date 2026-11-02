import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowDown, ArrowUp, PhoneCall, Play, Undo2, UserX } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PageHeader, Stat, StatusBadge, TypeBadge, Initials } from "@/components/app/common";
import { callPatient, dayAppointments, inActiveQueue, markNoShow, moveInQueue, returnToQueue, todayStr, useSession, useStore, waitingQueue } from "@/lib/store";
import { meta } from "@/lib/meta";
import { fmtTime } from "@/lib/utils";

export const Route = createFileRoute("/doctor/")({
  head: () => meta("Doctor dashboard", "Today's appointments, live queue and consultations."),
  component: DoctorDashboard,
});

function DoctorDashboard() {
  const user = useSession()!;
  const navigate = useNavigate();
  const s = useStore((s) => s);
  const dp = s.doctors.find((d) => d.userId === user.id)!;
  const today = dayAppointments(user.id, todayStr(), s);
  const current = today.find((a) => a.status === "In Consultation" || a.status === "Ready to Join");
  const queue = waitingQueue(today);
  const absent = today.filter((a) => a.status === "No Show");
  const awaitingCheckIn = today.filter((a) => a.type === "clinic" && a.status === "Confirmed");
  const name = (id: string, apptId?: string) => s.appointments.find((a) => a.id === apptId)?.memberName ?? s.users.find((u) => u.id === id)?.name ?? "";
  const followUps = s.consultations.filter((c) => c.doctorId === user.id && c.followUpRequired && c.completedAt);

  const start = (id: string) => { callPatient(id); navigate({ to: "/doctor/consultation/$id", params: { id } }); };

  return (
    <div className="mx-auto max-w-6xl">
      {dp.verification !== "Approved" && s.settings.doctorVerification && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-warning bg-warning/15 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-warning-foreground" />
          <div><p className="font-semibold">{dp.verification}</p><p className="text-sm text-muted-foreground">{dp.verification === "Rejected" ? "Your registration was rejected by admin." : "An admin is reviewing your registration. You are not visible to patients until approved. Complete your profile and availability meanwhile."}</p></div>
        </div>
      )}
      <PageHeader title="Today" subtitle={new Date().toDateString()} />
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Appointments" value={today.length} />
        <Stat label="In queue" value={queue.length} />
        <Stat label="Awaiting check-in" value={awaitingCheckIn.length} />
        <Stat label="Completed" value={today.filter((a) => a.status === "Completed").length} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <section className="rounded-2xl bg-hero p-6 text-primary-foreground">
          <p className="text-xs uppercase tracking-widest opacity-75">Current patient</p>
          {current ? (
            <>
              <p className="mt-2 font-display text-5xl font-semibold">#{current.queueNumber}</p>
              <p className="mt-1 text-lg">{name(current.patientId, current.id)}</p>
              <p className="text-sm opacity-80">{current.reason} · {current.type === "online" ? "Online" : "In-clinic"} · {current.status}</p>
              <Button variant="secondary" className="mt-4" asChild><Link to="/doctor/consultation/$id" params={{ id: current.id }}><Play className="mr-1 h-4 w-4" />Open consultation</Link></Button>
            </>
          ) : <p className="mt-2 text-lg opacity-90">No patient in consultation.</p>}
          <div className="mt-6 border-t border-primary-foreground/20 pt-4">
            <p className="text-xs uppercase tracking-widest opacity-75">Next patients</p>
            {queue.map((a, i) => (
              <div key={a.id} className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-primary-foreground/10 p-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{i + 1}. #{a.queueNumber} · {name(a.patientId, a.id)} · {a.type === "online" ? "Online" : "Clinic"}</span>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Move up" disabled={i === 0} onClick={() => moveInQueue(a.id, -1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Move down" disabled={i === queue.length - 1} onClick={() => moveInQueue(a.id, 1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
                  {i === 0 && !current && <Button size="sm" variant="secondary" onClick={() => start(a.id)}><PhoneCall className="mr-1 h-3.5 w-3.5" />Call next</Button>}
                </div>
              </div>
            ))}
            {queue.length === 0 && <p className="mt-2 text-sm opacity-75">Queue is empty.</p>}
          </div>
          {absent.length > 0 && (
            <div className="mt-6 border-t border-primary-foreground/20 pt-4">
              <p className="text-xs uppercase tracking-widest opacity-75">Absent patients</p>
              {absent.map((a) => <AbsentRow key={a.id} id={a.id} label={`#${a.queueNumber} · ${name(a.patientId, a.id)}`} waiting={queue.length} />)}
            </div>
          )}
        </section>

        <section className="rounded-2xl border bg-card p-5">
          <h2 className="mb-3 text-lg font-semibold">Today's appointments</h2>
          <div className="space-y-2">
            {today.length === 0 && <p className="text-sm text-muted-foreground">No appointments today.</p>}
            {today.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
                <span className="w-16 font-display text-lg">{fmtTime(a.time)}</span>
                <Initials name={name(a.patientId, a.id)} className="h-9 w-9 text-sm" />
                <div className="min-w-0 flex-1">
                  <Link to="/doctor/patients/$id" params={{ id: a.patientId }} className="font-medium hover:text-primary">{name(a.patientId, a.id)}</Link>
                  <p className="text-xs text-muted-foreground">#{a.queueNumber} · {a.id} · <TypeBadge type={a.type} /></p>
                </div>
                <StatusBadge status={a.status} />
                {inActiveQueue(a) && a.status !== "In Consultation" && a.status !== "Ready to Join" && <Button size="sm" onClick={() => start(a.id)}>Start</Button>}
                {(a.status === "Confirmed" || a.status === "Checked-In" || a.status === "Waiting") && <Button size="icon" variant="ghost" title="Mark no-show" onClick={() => markNoShow(a.id)}><UserX className="h-4 w-4" /></Button>}
              </div>
            ))}
          </div>
        </section>
      </div>

      {followUps.length > 0 && (
        <section className="mt-6 rounded-2xl border bg-card p-5">
          <h2 className="mb-3 text-lg font-semibold">Follow-up management</h2>
          <div className="space-y-2 text-sm">
            {followUps.map((c) => {
              const booked = s.appointments.find((a) => a.followUpOf === c.appointmentId && a.status !== "Cancelled");
              return (
                <div key={c.appointmentId} className="flex justify-between rounded-lg bg-muted p-3">
                  <span><b>{name(c.patientId, c.appointmentId)}</b> — {c.followUpTiming} (from {c.appointmentId})</span>
                  <span className={booked ? "text-success" : "text-muted-foreground"}>{booked ? `Booked ${booked.date} ${fmtTime(booked.time)}` : "Not booked yet"}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function AbsentRow({ id, label, waiting }: { id: string; label: string; waiting: number }) {
  const [pos, setPos] = useState("0");
  const options = Array.from({ length: waiting + 1 }, (_, i) => i);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-primary-foreground/10 p-2 text-sm">
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <Select value={pos} onValueChange={setPos}>
        <SelectTrigger className="h-8 w-40 bg-card text-foreground" aria-label="Queue position"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map((i) => <SelectItem key={i} value={String(i)}>{i === 0 ? "Next in line" : i === waiting ? "End of queue" : `After ${i} patient${i > 1 ? "s" : ""}`}</SelectItem>)}</SelectContent>
      </Select>
      <Button size="sm" variant="secondary" onClick={() => { returnToQueue(id, Number(pos)); toast.success("Patient returned to the queue"); }}><Undo2 className="mr-1 h-3.5 w-3.5" />Return</Button>
    </div>
  );
}
