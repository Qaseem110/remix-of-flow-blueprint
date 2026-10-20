import { createFileRoute, Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { Pill } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocList, PageHeader, TypeBadge } from "@/components/app/common";
import { slotDateTime, useSession, useStore } from "@/lib/store";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/patient/records")({
  head: () => meta("Health records", "Consultation history, prescriptions and documents."),
  component: Records,
});

function Records() {
  const user = useSession()!;
  const s = useStore((s) => s);
  const records = s.consultations
    .filter((c) => c.patientId === user.id && c.completedAt)
    .map((c) => ({ c, a: s.appointments.find((a) => a.id === c.appointmentId)!, doc: s.users.find((u) => u.id === c.doctorId)! }))
    .sort((x, y) => slotDateTime(y.a).getTime() - slotDateTime(x.a).getTime());
  const allDocs = [
    ...records.flatMap((r) => r.c.documents.map((d) => ({ d, r }))),
    ...s.appointments.filter((a) => a.patientId === user.id).flatMap((a) => a.documents.map((d) => ({ d, r: null }))),
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Health records" subtitle="Everything from your consultations, in one place." />
      <Tabs defaultValue="history">
        <TabsList><TabsTrigger value="history">Consultation history</TabsTrigger><TabsTrigger value="rx">Prescriptions</TabsTrigger><TabsTrigger value="docs">Documents / Reports</TabsTrigger></TabsList>

        <TabsContent value="history" className="space-y-4">
          {records.length === 0 && <p className="text-muted-foreground">No completed consultations yet.</p>}
          {records.map(({ c, a, doc }) => (
            <article key={c.appointmentId} className="rounded-2xl border bg-card p-6 shadow-soft">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><p className="font-display text-xl font-semibold">{doc.name}</p><p className="text-sm text-muted-foreground">{format(slotDateTime(a), "d MMM yyyy, HH:mm")} · {a.id}</p></div>
                <TypeBadge type={a.type} />
              </div>
              <div className="mt-4 grid gap-4 text-sm md:grid-cols-2">
                <div><p className="text-xs uppercase text-muted-foreground">Chief complaint</p><p>{c.symptoms || "—"}</p></div>
                <div><p className="text-xs uppercase text-muted-foreground">Diagnosis</p><p className="font-medium">{c.diagnosis || "—"}</p></div>
                <div className="md:col-span-2"><p className="text-xs uppercase text-muted-foreground">Consultation summary</p><p>{c.summary || "—"}</p></div>
              </div>
              {c.prescription.length > 0 && (
                <div className="mt-4"><p className="mb-2 text-xs uppercase text-muted-foreground">Prescription</p>
                  <ul className="space-y-1 text-sm">{c.prescription.map((p, i) => <li key={i} className="flex gap-2"><Pill className="mt-0.5 h-4 w-4 text-primary" /><span><b>{p.medicine}</b> — {p.dosage}, {p.frequency}, {p.duration}. <span className="text-muted-foreground">{p.instructions}</span></span></li>)}</ul>
                </div>
              )}
              {c.documents.length > 0 && <div className="mt-4"><p className="mb-2 text-xs uppercase text-muted-foreground">Documents from doctor</p><DocList docs={c.documents} /></div>}
              {c.followUpRequired && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-accent/20 p-3">
                  <p className="text-sm"><b>Follow-up:</b> {c.followUpTiming}</p>
                  <Button size="sm" asChild><Link to="/patient/book/$doctorId" params={{ doctorId: c.doctorId }} search={{ followUpOf: c.appointmentId }}>Book follow-up</Link></Button>
                </div>
              )}
            </article>
          ))}
        </TabsContent>

        <TabsContent value="rx">
          <div className="overflow-x-auto rounded-2xl border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground"><tr>{["Date", "Doctor", "Medicine", "Dosage", "Frequency", "Duration", "Instructions"].map((h) => <th key={h} className="p-3">{h}</th>)}</tr></thead>
              <tbody>
                {records.flatMap(({ c, a, doc }) => c.prescription.map((p, i) => (
                  <tr key={c.appointmentId + i} className="border-t"><td className="p-3">{a.date}</td><td className="p-3">{doc.name}</td><td className="p-3 font-medium">{p.medicine}</td><td className="p-3">{p.dosage}</td><td className="p-3">{p.frequency}</td><td className="p-3">{p.duration}</td><td className="p-3 text-muted-foreground">{p.instructions}</td></tr>
                )))}
              </tbody>
            </table>
            {!records.some((r) => r.c.prescription.length) && <p className="p-4 text-muted-foreground">No prescriptions yet.</p>}
          </div>
        </TabsContent>

        <TabsContent value="docs"><DocList docs={allDocs.map((x) => x.d)} empty="No documents yet." /></TabsContent>
      </Tabs>
    </div>
  );
}
