import { trackingNumber } from "@/lib/store";
import { FileText, FlaskConical } from "lucide-react";
import type { ReactNode } from "react";
import { useStore, type LabOrder } from "@/lib/store";

const tone: Record<LabOrder["status"], string> = {
  Requested: "bg-warning/15 text-warning-foreground",
  "Sample collected": "bg-primary/10 text-primary",
  Completed: "bg-success/15 text-success",
  Cancelled: "bg-muted text-muted-foreground",
  Expired: "bg-muted text-muted-foreground",
};

/** Summary of one lab test request, shared by patient, doctor and lab views. */
export function LabOrderCard({ o, children }: { o: LabOrder; children?: ReactNode }) {
  const lab = useStore((s) => s.labs.find((l) => l.userId === o.labId));
  const doctor = useStore((s) => s.users.find((u) => u.id === o.doctorId));
  const patient = useStore((s) => s.users.find((u) => u.id === o.patientId));
  return (
    <article className="rounded-2xl border bg-card p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 font-semibold"><FlaskConical className="h-4 w-4 text-primary" />{o.tests}</p>
          <p className="text-sm text-muted-foreground">{trackingNumber(o)} · {o.date} · {lab?.labName ?? "Laboratory"}{lab?.city ? `, ${lab.city}` : ""}</p>
          <p className="text-sm text-muted-foreground">Patient: {o.memberName ?? patient?.name ?? "—"} · Prescribed by {doctor?.name ?? "doctor"} ({trackingNumber({ id: o.appointmentId })}) · {o.orderedBy === "doctor" ? "Sent by doctor" : "Booked by patient"}</p>
          {o.notes && <p className="mt-1 text-sm">Note: {o.notes}</p>}
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tone[o.status]}`}>{o.status}</span>
      </div>
      {o.documents.length > 0 && (
        <ul className="mt-3 space-y-1">
          {o.documents.map((d) => (
            <li key={d.id}><a href={d.url || undefined} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline"><FileText className="h-4 w-4" />{d.title ?? d.name}</a></li>
          ))}
        </ul>
      )}
      {children && <div className="mt-3 flex flex-wrap gap-2">{children}</div>}
    </article>
  );
}
