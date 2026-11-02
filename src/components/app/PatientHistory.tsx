import { PinGate } from "@/components/app/ReportPin";
import { Pill } from "lucide-react";
import { DocList } from "@/components/app/common";
import { useStore } from "@/lib/store";

/** Patient info + past consultations, including private notes (doctor-only view). */
export function PatientHistory({ patientId, excludeId, memberId }: { patientId: string; excludeId?: string; memberId?: string | null }) {
  return <PinGate patientId={patientId}><UnlockedPatientHistory patientId={patientId} excludeId={excludeId} memberId={memberId} /></PinGate>;
}

function UnlockedPatientHistory({ patientId, excludeId, memberId }: { patientId: string; excludeId?: string; memberId?: string | null }) {
  const s = useStore((s) => s);
  const u = s.users.find((x) => x.id === patientId);
  const p = s.patients.find((x) => x.userId === patientId);
  const past = s.consultations.filter((c) => c.patientId === patientId && (memberId === undefined || (s.appointments.find((a) => a.id === c.appointmentId)?.memberId ?? null) === memberId) && c.completedAt && c.appointmentId !== excludeId).sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  const uploads = s.appointments.filter((a) => a.patientId === patientId && (memberId === undefined || (a.memberId ?? null) === memberId) && a.id !== excludeId).flatMap((a) => a.documents);
  if (!u || !p) return null;
  return (
    <div className="space-y-4">
      {memberId && (() => { const m = p.members?.find((x) => x.id === memberId); return m ? <p className="rounded-xl bg-accent/20 p-3 text-sm"><b>{m.name}</b> ({m.relation}{m.gender ? `, ${m.gender}` : ""}{m.dob ? `, DOB ${m.dob}` : ""}) — linked to {u.name}'s account</p> : null; })()}
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-3 text-sm">
        <span className="text-muted-foreground">DOB</span><span>{p.dob}</span>
        <span className="text-muted-foreground">Gender</span><span>{p.gender}</span>
        <span className="text-muted-foreground">Blood group</span><span>{p.bloodGroup ?? "—"}</span>
        <span className="text-muted-foreground">Phone</span><span>{u.phone}</span>
        <span className="text-muted-foreground">Emergency</span><span>{p.emergencyContact ?? "—"}</span>
      </div>
      <div>
        <p className="mb-2 text-xs uppercase text-muted-foreground">Previous consultations ({past.length})</p>
        {past.length === 0 && <p className="text-sm text-muted-foreground">No previous records.</p>}
        {past.map((c) => (
          <div key={c.appointmentId} className="mb-2 rounded-xl border p-3 text-sm">
            <p className="font-medium">{c.diagnosis || "No diagnosis"} <span className="font-normal text-muted-foreground">· {s.users.find((x) => x.id === c.doctorId)?.name} · {c.completedAt?.slice(0, 10)}</span></p>
            <p className="text-muted-foreground">{c.symptoms}</p>
            {c.privateNotes && <p className="mt-1 rounded bg-warning/15 p-1.5 text-xs"><b>Private note:</b> {c.privateNotes}</p>}
            {c.prescription.map((rx, i) => <p key={i} className="mt-1 flex gap-1 text-xs"><Pill className="h-3 w-3 text-primary" />{rx.medicine} — {rx.dosage}, {rx.frequency}</p>)}
            {c.documents.length > 0 && <div className="mt-2"><DocList docs={c.documents} /></div>}
          </div>
        ))}
      </div>
      <div><p className="mb-2 text-xs uppercase text-muted-foreground">Other patient uploads</p><DocList docs={uploads} empty="None" /></div>
    </div>
  );
}
