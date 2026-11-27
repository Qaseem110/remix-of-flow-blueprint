import { trackingNumber } from "@/lib/store";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { toast } from "sonner";
import { CalendarDays, CheckCircle2, MapPin, Upload, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocList, StatusBadge, TypeBadge } from "@/components/app/common";
import { CancelDialog, QueueCard, RescheduleDialog } from "@/components/app/widgets";
import { addAppointmentDocs, canJoin, readAndMakeDocs, slotDateTime, todayStr, useStore } from "@/lib/store";
import { meta } from "@/lib/meta";
import { LeaveAlert } from "@/components/app/LeaveAlert";
import { ReviewForm } from "@/components/app/Reviews";
import { fmtPrice } from "@/lib/utils";

export const Route = createFileRoute("/patient/appointments/$id")({
  validateSearch: (s: Record<string, unknown>): { confirmed?: boolean } => ({ confirmed: s.confirmed === true || s.confirmed === "true" ? true : undefined }),
  head: () => meta("Appointment details", "Appointment confirmation, queue position and actions."),
  component: ApptDetail,
});

function ApptDetail() {
  const { id } = Route.useParams();
  const { confirmed } = Route.useSearch();
  const navigate = useNavigate();
  const a = useStore((s) => s.appointments.find((x) => x.id === id));
  const doc = useStore((s) => s.users.find((x) => x.id === a?.doctorId));
  const dp = useStore((s) => s.doctors.find((x) => x.userId === a?.doctorId));
  const consult = useStore((s) => s.consultations.find((c) => c.appointmentId === id));
  const allowed = useStore((s) => s.settings.allowedFileTypes);
  if (!a || !doc || !dp) return <p>Appointment not found.</p>;
  const changeable = a.status === "Confirmed" || a.status === "Pending";
  const active = !["Completed", "Cancelled", "No Show", "Rescheduled", "Expired"].includes(a.status);

  const upload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []); e.target.value = "";
    const t = toast.loading("Reading report…");
    readAndMakeDocs(files, "patient").then((d) => { addAppointmentDocs(a.id, d); toast.success("Uploaded", { id: t }); }).catch((err) => toast.error((err as Error).message, { id: t }));
  };

  return (
    <div className="mx-auto max-w-4xl">
      {confirmed && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-success/40 bg-success/10 p-4">
          <CheckCircle2 className="h-6 w-6 text-success" />
          <div><p className="font-semibold">Appointment confirmed</p><p className="text-sm text-muted-foreground">A confirmation has been sent to your notifications.</p></div>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <section className="rounded-2xl border bg-card p-6 shadow-soft">
          <div className="flex items-start justify-between">
            <div><p className="text-xs uppercase tracking-wider text-muted-foreground">Tracking number</p><p className="break-all font-display text-3xl font-semibold">{trackingNumber(a)}</p></div>
            <StatusBadge status={a.status} />
          </div>
          <dl className="mt-6 space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Doctor</dt><dd className="font-medium">{doc.name} · {dp.specialization}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Date & time</dt><dd className="flex items-center gap-1 font-medium"><CalendarDays className="h-4 w-4" />{format(slotDateTime(a), "EEEE d MMM yyyy, h:mm a")}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Type</dt><dd><TypeBadge type={a.type} /></dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{a.type === "online" ? "Consultation link" : "Clinic location"}</dt>
              <dd className="text-right font-medium">{a.type === "online" ? <span className="flex items-center gap-1"><Video className="h-4 w-4" />sahoolat.app/room/{trackingNumber(a)}</span> : <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{dp.clinicName}, {dp.clinicAddress}, {dp.city}</span>}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Reason</dt><dd className="text-right">{a.reason}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Payment</dt><dd>{fmtPrice(dp.fee)} · {a.payment === "card" ? "Card" : a.type === "online" ? "Pay later" : "Pay at clinic"}</dd></div>
            {a.rescheduledFrom && <div className="flex justify-between"><dt className="text-muted-foreground">Rescheduled from</dt><dd>{trackingNumber({ id: a.rescheduledFrom })}</dd></div>}
            {a.rescheduledTo && <div className="flex justify-between"><dt className="text-muted-foreground">Moved to</dt><dd><Link className="text-primary" to="/patient/appointments/$id" params={{ id: a.rescheduledTo }}>{trackingNumber({ id: a.rescheduledTo })}</Link></dd></div>}
            {a.status === "Cancelled" && <div className="flex justify-between"><dt className="text-muted-foreground">Cancelled by</dt><dd className="capitalize">{a.cancelledBy}{a.cancelReason ? ` — ${a.cancelReason}` : ""}</dd></div>}
          </dl>
          {a.date === todayStr() && ["Confirmed", "Pending"].includes(a.status) && <LeaveAlert a={a} />}
          <div className="mt-6 flex flex-wrap gap-2">
            {a.type === "online" && active && (canJoin(a)
              ? <Button onClick={() => navigate({ to: "/patient/consultation/$id", params: { id: a.id } })}><Video className="mr-1 h-4 w-4" /> Join Consultation</Button>
              : <Button disabled><Video className="mr-1 h-4 w-4" /> Join opens shortly before start</Button>)}
            {a.type === "clinic" && a.status === "Confirmed" && a.date === todayStr() && (
              <p className="text-sm text-muted-foreground">The clinic will mark your arrival when you reach.</p>
            )}
            {changeable && <RescheduleDialog appt={a} onDone={(nid) => navigate({ to: "/patient/appointments/$id", params: { id: nid } })} trigger={<Button variant="secondary">Reschedule</Button>} />}
            {changeable && <CancelDialog appt={a} by="patient" trigger={<Button variant="ghost" className="text-destructive">Cancel</Button>} />}
            {a.status === "Completed" && <Button variant="outline" asChild><Link to="/patient/records">View consultation record</Link></Button>}
            {a.status === "Completed" && consult?.followUpRequired && <Button asChild><Link to="/patient/book/$doctorId" params={{ doctorId: a.doctorId }} search={{ followUpOf: a.id }}>Book follow-up</Link></Button>}
          </div>
        </section>
        <div className="space-y-4">
          {active && <QueueCard appointmentId={a.id} />}
          {a.status === "Completed" && <ReviewForm appointmentId={a.id} />}
          <div className="rounded-2xl border bg-card p-5">
            <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">My documents</h2>
              {active && <label className="flex cursor-pointer items-center gap-1 text-sm text-primary"><Upload className="h-4 w-4" />Upload<input type="file" multiple className="hidden" accept={allowed.map((x) => "." + x).join(",")} onChange={upload} /></label>}
            </div>
            <DocList docs={a.documents} empty="No reports uploaded." />
          </div>
        </div>
      </div>
    </div>
  );
}
