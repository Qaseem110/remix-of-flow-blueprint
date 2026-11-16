import { trackingNumber } from "@/lib/store";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DocList, PageHeader, StatusBadge, TypeBadge } from "@/components/app/common";
import { listCallRecordings, recordedAppointmentIds, slotDateTime, useStore, type CallRecording } from "@/lib/store";
import { meta } from "@/lib/meta";
import { fmtTime } from "@/lib/utils";

export const Route = createFileRoute("/admin/cases")({
  head: () => meta("Consultation case files", "Complete case files with call recordings, notes and shared documents."),
  component: Cases,
});

function Cases() {
  const s = useStore((s) => s);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [recorded, setRecorded] = useState<Set<string>>(new Set());
  useEffect(() => { void recordedAppointmentIds().then(setRecorded); }, []);
  const name = (id: string) => s.users.find((u) => u.id === id)?.name ?? "—";
  const list = s.appointments
    .filter((a) => a.type === "online" || recorded.has(a.id) || s.consultations.some((c) => c.appointmentId === a.id))
    .filter((a) => !q || `${trackingNumber(a)} ${name(a.doctorId)} ${a.memberName ?? name(a.patientId)}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => slotDateTime(b).getTime() - slotDateTime(a).getTime());
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Case files" subtitle="Every consultation with its voice recordings, notes, prescription and shared reports." />
      <Input placeholder="Search by ID, doctor or patient" value={q} onChange={(e) => setQ(e.target.value)} className="mb-4 max-w-sm" />
      <div className="space-y-3">
        {list.length === 0 && <p className="text-sm text-muted-foreground">No case files yet.</p>}
        {list.map((a) => (
          <div key={a.id} className="rounded-2xl border bg-card">
            <button className="flex w-full flex-wrap items-center gap-3 p-4 text-left" onClick={() => setOpen(open === a.id ? null : a.id)}>
              <span className="font-mono text-xs text-muted-foreground">{trackingNumber(a)}</span>
              <span className="font-medium">{a.memberName ?? name(a.patientId)}</span>
              <span className="text-sm text-muted-foreground">with {name(a.doctorId)}</span>
              <span className="text-sm text-muted-foreground">{a.date} · {fmtTime(a.time)}</span>
              <TypeBadge type={a.type} /><StatusBadge status={a.status} />
              {recorded.has(a.id) && <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">Recorded</span>}
            </button>
            {open === a.id && <CaseFile id={a.id} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function CaseFile({ id }: { id: string }) {
  const s = useStore((s) => s);
  const a = s.appointments.find((x) => x.id === id)!;
  const c = s.consultations.find((x) => x.appointmentId === id);
  const [recs, setRecs] = useState<CallRecording[] | null>(null);
  useEffect(() => { void listCallRecordings(id).then(setRecs); }, [id]);
  const name = (uid: string) => s.users.find((u) => u.id === uid)?.name ?? "—";
  const Row = ({ k, v }: { k: string; v?: string }) => v ? <p className="text-sm"><span className="text-muted-foreground">{k}: </span>{v}</p> : null;
  return (
    <div className="grid gap-6 border-t p-4 md:grid-cols-2">
      <section className="space-y-1">
        <h3 className="mb-2 font-display font-semibold">Appointment</h3>
        <Row k="Patient" v={a.memberName ?? name(a.patientId)} />
        <Row k="Account holder" v={name(a.patientId)} />
        <Row k="Doctor" v={name(a.doctorId)} />
        <Row k="Reason" v={a.reason} />
        <Row k="Queue no." v={String(a.queueNumber || "")} />
        <Row k="Payment" v={a.payment} />
        <Row k="Booked" v={a.createdAt?.slice(0, 16).replace("T", " ")} />
      </section>
      <section className="space-y-1">
        <h3 className="mb-2 font-display font-semibold">Consultation</h3>
        {!c ? <p className="text-sm text-muted-foreground">No consultation notes.</p> : <>
          <Row k="Symptoms" v={c.symptoms} />
          <Row k="Diagnosis" v={c.diagnosis} />
          <Row k="Summary for patient" v={c.summary} />
          <Row k="Doctor's private notes" v={c.privateNotes} />
          <Row k="Follow-up" v={c.followUpRequired ? c.followUpTiming || "Required" : ""} />
          <Row k="Completed" v={c.completedAt?.slice(0, 16).replace("T", " ")} />
          {c.prescription.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm">{c.prescription.map((p, i) => <li key={i}>{p.medicine} — {p.dosage}, {p.frequency}, {p.duration}{p.instructions ? ` (${p.instructions})` : ""}</li>)}</ul>}
        </>}
      </section>
      <section className="md:col-span-2">
        <h3 className="mb-2 font-display font-semibold">Call voice recordings</h3>
        {recs === null ? <p className="text-sm text-muted-foreground">Loading…</p> : recs.length === 0 ? <p className="text-sm text-muted-foreground">No recordings.</p> : (
          <div className="space-y-2">
            {recs.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-2">
                <span className="w-48 text-xs"><b className="capitalize">{r.role}</b> · {name(r.uploaderId)}<br /><span className="text-muted-foreground">{new Date(r.startedAt).toLocaleString()}</span></span>
                <audio controls preload="none" src={r.url} className="h-9 flex-1" />
                <Button asChild size="sm" variant="outline"><a href={r.url} download>Download</a></Button>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="md:col-span-2">
        <h3 className="mb-2 font-display font-semibold">Shared documents</h3>
        <DocList docs={[...a.documents, ...(c?.documents ?? [])]} />
      </section>
    </div>
  );
}
