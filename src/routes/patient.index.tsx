import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, ClipboardList, MapPin, Search, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, StatusBadge, TypeBadge, Avatar } from "@/components/app/common";
import { QueueCard } from "@/components/app/widgets";
import { canJoin, memberOf, slotDateTime, useActiveMember, useSession, useStore } from "@/lib/store";
import { meta } from "@/lib/meta";
import { format } from "date-fns";

export const Route = createFileRoute("/patient/")({
  head: () => meta("Patient dashboard", "Your upcoming appointment, queue position and quick links."),
  component: PatientDashboard,
});

const ACTIVE = ["Pending", "Confirmed", "Checked-In", "Waiting", "Ready to Join", "In Consultation"];

function PatientDashboard() {
  const user = useSession()!;
  const member = useActiveMember();
  const s = useStore((s) => s);
  const upcoming = s.appointments.filter((a) => a.patientId === user.id && memberOf(a) === member && ACTIVE.includes(a.status)).sort((a, b) => slotDateTime(a).getTime() - slotDateTime(b).getTime());
  const next = upcoming[0];
  const doc = next && s.users.find((u) => u.id === next.doctorId);
  const dp = next && s.doctors.find((d) => d.userId === next.doctorId);
  const followUps = s.consultations.filter((c) => c.patientId === user.id && memberOf(s.appointments.find((a) => a.id === c.appointmentId)) === member && c.followUpRequired && c.completedAt);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={`Hello, ${user.name.split(" ")[0]}`} subtitle="Here's what's next for your health." />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border bg-card p-6 shadow-soft">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Upcoming appointment</p>
          {next && doc && dp ? (
            <>
              <div className="mt-4 flex items-center gap-4">
                <Avatar name={doc.name} src={dp.avatar} className="h-14 w-14" />
                <div className="flex-1">
                  <p className="font-display text-xl font-semibold">{doc.name}</p>
                  <p className="text-sm text-muted-foreground">{dp.specialization}</p>
                </div>
                <StatusBadge status={next.status} />
              </div>
              <div className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
                <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" />{format(slotDateTime(next), "EEE d MMM, h:mm a")}</div>
                <TypeBadge type={next.type} />
                <div className="flex items-center gap-2 text-muted-foreground">{next.type === "online" ? <><Video className="h-4 w-4" /> Video link in app</> : <><MapPin className="h-4 w-4" /> {dp.clinicName}</>}</div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {next.type === "online" && (canJoin(next)
                  ? <Button asChild><Link to="/patient/consultation/$id" params={{ id: next.id }}><Video className="mr-1 h-4 w-4" /> Join Consultation</Link></Button>
                  : <Button disabled title="Available shortly before the appointment or when the doctor is ready"><Video className="mr-1 h-4 w-4" /> Join Consultation</Button>)}
                <Button variant="outline" asChild><Link to="/patient/appointments/$id" params={{ id: next.id }}>View details</Link></Button>
              </div>
            </>
          ) : (
            <div className="mt-4">
              <p className="text-muted-foreground">No upcoming appointments.</p>
              <Button className="mt-4" asChild><Link to="/patient/doctors"><Search className="mr-1 h-4 w-4" /> Find a doctor</Link></Button>
            </div>
          )}
        </section>
        <div className="space-y-4">
          {next && <QueueCard appointmentId={next.id} />}
          <div className="grid grid-cols-3 gap-3">
            {[{ to: "/patient/appointments", label: "My Appointments", icon: CalendarDays }, { to: "/patient/doctors", label: "Find Doctor", icon: Search }, { to: "/patient/records", label: "Health Records", icon: ClipboardList }].map((l) => (
              <Link key={l.to} to={l.to} className="flex flex-col items-center gap-2 rounded-xl border bg-card p-4 text-center text-sm font-medium shadow-soft hover:border-primary"><l.icon className="h-5 w-5 text-primary" />{l.label}</Link>
            ))}
          </div>
        </div>
      </div>

      {upcoming.length > 1 && (
        <section className="mt-8">
          <h2 className="mb-3 text-xl font-semibold">Later</h2>
          <div className="space-y-2">
            {upcoming.slice(1).map((a) => (
              <Link key={a.id} to="/patient/appointments/$id" params={{ id: a.id }} className="flex items-center justify-between rounded-xl border bg-card p-4 hover:border-primary">
                <div><p className="font-medium">{s.users.find((u) => u.id === a.doctorId)?.name}</p><p className="text-sm text-muted-foreground">{format(slotDateTime(a), "EEE d MMM, h:mm a")} · {a.id}</p></div>
                <div className="flex items-center gap-3"><TypeBadge type={a.type} /><StatusBadge status={a.status} /></div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {followUps.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-xl font-semibold">Follow-up recommendations</h2>
          {followUps.map((c) => (
            <div key={c.appointmentId} className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent bg-accent/15 p-4">
              <div><p className="font-medium">{s.users.find((u) => u.id === c.doctorId)?.name}</p><p className="text-sm text-muted-foreground">{c.followUpTiming}</p></div>
              <Button size="sm" asChild><Link to="/patient/book/$doctorId" params={{ doctorId: c.doctorId }} search={{ followUpOf: c.appointmentId }}>Book follow-up</Link></Button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
