import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { MapPin, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/app/common";
import { LabOrderCard } from "@/components/app/LabOrderCard";
import { LabDiscussion } from "@/components/app/LabDiscussion";
import { LabAppointmentTime } from "@/components/app/LabAppointmentTime";
import { createLabOrder, memberOf, prescribedConsultations, setLabOrderStatus, useActiveMember, useSession, useStore, type Lab } from "@/lib/store";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/patient/labs")({
  head: () => meta("Lab tests", "Find a laboratory and book prescribed tests."),
  component: PatientLabs,
});

function PatientLabs() {
  const user = useSession();
  const s = useStore((x) => x);
  const member = useActiveMember();
  const mine = (apptId: string) => memberOf(s.appointments.find((a) => a.id === apptId)) === member;
  const orders = s.labOrders.filter((o) => o.patientId === user?.id && mine(o.appointmentId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const rx = prescribedConsultations(user?.id ?? "", s).filter((c) => mine(c.appointmentId));
  const [q, setQ] = useState("");
  const labs = s.labs.filter((l) => !q || `${l.labName} ${l.city} ${l.tests ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const [pick, setPick] = useState<Lab | null>(null);
  const [appt, setAppt] = useState("");
  const [tests, setTests] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const chooseRx = (id: string) => {
    setAppt(id);
    const c = rx.find((x) => x.appointmentId === id);
    if (c?.labTests && !tests) setTests(c.labTests);
  };
  const book = async () => {
    if (!pick) return;
    setBusy(true);
    try { await createLabOrder({ labId: pick.userId, appointmentId: appt, tests, date, time }); toast.success("Lab test booked"); setPick(null); setAppt(""); setTests(""); setDate(""); setTime(""); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const docName = (id: string) => s.users.find((u) => u.id === id)?.name ?? "Doctor";
  if (!user) return null;
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader title="Lab tests" subtitle="Book tests at a laboratory. A doctor's prescription is required." />
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">My lab tests</h2>
        {orders.length === 0 && <p className="text-muted-foreground">No lab tests yet.</p>}
        {orders.map((o) => (
          <LabOrderCard key={o.id} o={o}>
            {o.status === "Requested" && <Button size="sm" variant="outline" onClick={() => setLabOrderStatus(o.id, "Cancelled").then(() => toast.success("Cancelled"), (e: Error) => toast.error(e.message))}>Cancel</Button>}
            <LabDiscussion orderId={o.id} />
          </LabOrderCard>
        ))}
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Find a laboratory</h2>
        <Input placeholder="Search by name, city or test" value={q} onChange={(e) => setQ(e.target.value)} />
        {labs.length === 0 && <p className="text-muted-foreground">No laboratories found.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {labs.map((l) => (
            <article key={l.userId} className="rounded-2xl border bg-card p-5 shadow-soft">
              <p className="font-semibold">{l.labName}</p>
              <p className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-4 w-4" />{l.address}, {l.city}</p>
              <p className="flex items-center gap-1 text-sm text-muted-foreground"><Phone className="h-4 w-4" />{l.phone}{l.hours ? ` · ${l.hours}` : ""}</p>
              {l.tests && <p className="mt-1 line-clamp-2 text-sm">{l.tests}</p>}
              <Button size="sm" className="mt-3" onClick={() => { setPick(l); setTime(""); setDate(""); }}>Book test</Button>
            </article>
          ))}
        </div>
      </section>
      {pick && (
        <section className="space-y-3 rounded-2xl border bg-card p-6 shadow-soft">
          <h2 className="text-lg font-semibold">Book at {pick.labName}</h2>
          {rx.length === 0 ? <p className="text-sm text-destructive">You need a doctor's prescription first. Tests can only be booked against a completed consultation.</p> : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2"><Label>Doctor's prescription</Label>
                <Select value={appt} onValueChange={chooseRx}><SelectTrigger><SelectValue placeholder="Select prescription" /></SelectTrigger>
                  <SelectContent>{rx.map((c) => <SelectItem key={c.appointmentId} value={c.appointmentId}>{docName(c.doctorId)} · {c.appointmentId} · {c.diagnosis || "Consultation"}</SelectItem>)}</SelectContent></Select>
              </div>
              <div><Label>Tests</Label><Input value={tests} onChange={(e) => setTests(e.target.value)} placeholder="e.g. CBC, LFT" /></div>
              <LabAppointmentTime labId={pick.userId} date={date} time={time} onDate={setDate} onTime={setTime} />
              <div className="flex gap-2 sm:col-span-2"><Button disabled={busy || !appt || !date || !time} onClick={book}>Confirm booking</Button><Button variant="ghost" onClick={() => setPick(null)}>Close</Button></div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
