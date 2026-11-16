import { trackingNumber } from "@/lib/store";
import { createFileRoute, Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, StatusBadge, TypeBadge } from "@/components/app/common";
import { CancelDialog, RescheduleDialog } from "@/components/app/widgets";
import { memberOf, slotDateTime, useActiveMember, useSession, useStore, type Appointment } from "@/lib/store";
import { meta } from "@/lib/meta";
import { fmtTime } from "@/lib/utils";

export const Route = createFileRoute("/patient/appointments/")({
  head: () => meta("My appointments", "View, reschedule or cancel your appointments."),
  component: MyAppointments,
});

const UPCOMING = ["Pending", "Confirmed", "Checked-In", "Waiting", "Ready to Join", "In Consultation"];

function MyAppointments() {
  const user = useSession()!;
  const member = useActiveMember();
  const s = useStore((s) => s);
  const mine = s.appointments.filter((a) => a.patientId === user.id && memberOf(a) === member).sort((a, b) => slotDateTime(b).getTime() - slotDateTime(a).getTime());
  const upcoming = mine.filter((a) => UPCOMING.includes(a.status)).reverse();
  const past = mine.filter((a) => !UPCOMING.includes(a.status));
  const Row = ({ a }: { a: Appointment }) => {
    const doc = s.users.find((u) => u.id === a.doctorId);
    const changeable = a.status === "Confirmed" || a.status === "Pending";
    return (
      <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-4">
        <div className="w-20 text-center"><p className="text-xs uppercase text-muted-foreground">{format(slotDateTime(a), "EEE")}</p><p className="font-display text-2xl font-semibold">{format(slotDateTime(a), "d MMM")}</p><p className="text-sm">{fmtTime(a.time)}</p></div>
        <div className="min-w-0 flex-1"><p className="font-medium">{doc?.name}</p><p className="text-sm text-muted-foreground">{trackingNumber(a)} · {a.reason}</p><TypeBadge type={a.type} /></div>
        <StatusBadge status={a.status} />
        <div className="flex gap-2">
          <Button size="sm" variant="outline" asChild><Link to="/patient/appointments/$id" params={{ id: a.id }}>Open</Link></Button>
          {changeable && <RescheduleDialog appt={a} trigger={<Button size="sm" variant="secondary">Reschedule</Button>} />}
          {changeable && <CancelDialog appt={a} by="patient" trigger={<Button size="sm" variant="ghost" className="text-destructive">Cancel</Button>} />}
        </div>
      </div>
    );
  };
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="My appointments" actions={<Button asChild><Link to="/patient/doctors">Book new</Link></Button>} />
      <Tabs defaultValue="upcoming">
        <TabsList><TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger><TabsTrigger value="past">Past ({past.length})</TabsTrigger></TabsList>
        <TabsContent value="upcoming" className="space-y-3">{upcoming.length ? upcoming.map((a) => <Row key={a.id} a={a} />) : <p className="text-muted-foreground">Nothing scheduled.</p>}</TabsContent>
        <TabsContent value="past" className="space-y-3">{past.length ? past.map((a) => <Row key={a.id} a={a} />) : <p className="text-muted-foreground">No past appointments.</p>}</TabsContent>
      </Tabs>
    </div>
  );
}
