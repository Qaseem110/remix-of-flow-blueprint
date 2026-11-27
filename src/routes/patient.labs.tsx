import { LabServices } from "@/components/app/LabServices";
import { ProviderActions } from "@/components/app/ProviderActions";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { FlaskConical, MapPin, Phone, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PremiumHero } from "@/components/app/common";
import { LabOrderCard } from "@/components/app/LabOrderCard";
import { LabDiscussion } from "@/components/app/LabDiscussion";
import { LabAppointmentTime } from "@/components/app/LabAppointmentTime";
import { createLabOrder, memberOf, prescribedConsultations, setLabOrderStatus, useActiveMember, useSession, useStore, type Lab } from "@/lib/store";
import { meta } from "@/lib/meta";
import { fmtPrice } from "@/lib/utils";
import { labTestCatalogue, testsNeedingPrescription } from "@/lib/lab-tests";

export const Route = createFileRoute("/patient/labs")({
  validateSearch: (s: Record<string, unknown>) => ({ lab: typeof s.lab === "string" ? s.lab : undefined, book: s.book === true }),
  head: () => meta("Lab tests", "Find a laboratory and book lab tests."),
  component: PatientLabs,
});

function PatientLabs() {
  const search = Route.useSearch();
  const user = useSession();
  const s = useStore((x) => x);
  const member = useActiveMember();
  const mine = (apptId: string) => memberOf(s.appointments.find((a) => a.id === apptId)) === member;
  const orders = s.labOrders.filter((o) => o.patientId === user?.id && (o.appointmentId ? mine(o.appointmentId) : member === null)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const rx = prescribedConsultations(user?.id ?? "", s).filter((c) => mine(c.appointmentId));
  const [q, setQ] = useState("");
  const labs = s.labs.filter((l) => (!search.lab || l.userId === search.lab) && (!q || `${l.labName} ${l.city} ${l.tests ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  const [pick, setPick] = useState<Lab | null>(() => search.book ? s.labs.find(l=>l.userId===search.lab) ?? null : null);
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
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PremiumHero eyebrow="HealthSahoolat labs" title="Lab tests" subtitle="Compare laboratories, see test prices and book a time slot." stats={[{ label: "laboratories", value: s.labs.length }, { label: "tests listed", value: s.labs.reduce((n, l) => n + (l.testCatalogue?.length ?? 0), 0) }]}>
        <div className="relative max-w-2xl rounded-2xl bg-card p-2 shadow-soft"><Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search laboratories" className="h-11 border-0 pl-9 text-foreground shadow-none" placeholder="Search by lab name, city or test" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </PremiumHero>
      {user && <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">My lab tests</h2>
        {orders.length === 0 && <p className="text-muted-foreground">No lab tests yet.</p>}
        {orders.map((o) => (
          <LabOrderCard key={o.id} o={o}>
            {o.status === "Requested" && <Button size="sm" variant="outline" onClick={() => setLabOrderStatus(o.id, "Cancelled").then(() => toast.success("Cancelled"), (e: Error) => toast.error(e.message))}>Cancel</Button>}
            <LabDiscussion orderId={o.id} />
          </LabOrderCard>
        ))}
      </section>}
      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Find a laboratory</h2>
        {labs.length === 0 && <p className="text-muted-foreground">No laboratories found.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {labs.map((l) => (
            <article key={l.userId} className="relative overflow-hidden rounded-[22px] border bg-card p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg">
              <div aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-linear-to-r from-primary to-accent" />
              <div className="mb-2 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><FlaskConical className="h-5 w-5" /></span><Link className="min-w-0 truncate font-display text-lg font-semibold hover:text-primary" to="/patient/laboratories/$id" params={{id:l.userId}}>{l.labName}</Link></div><ProviderActions providerId={l.userId} name={l.labName} />
              <p className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-4 w-4" />{l.address}, {l.city}</p>
              <p className="flex items-center gap-1 text-sm text-muted-foreground"><Phone className="h-4 w-4" />{l.phone}{l.hours ? ` · ${l.hours}` : ""}</p>
              {l.tests && <p className="mt-1 line-clamp-2 text-sm">{l.tests}</p>}
              {!!l.testCatalogue?.length && <><h3 className="mt-3 font-medium text-primary">In-lab tests</h3><ul className="mt-3 max-h-72 divide-y overflow-y-auto rounded-xl border bg-secondary/30 px-3 text-sm">{l.testCatalogue.map((test) => <li key={test.name} className="space-y-1 py-2"><p className="flex flex-wrap justify-between gap-2 font-medium"><span>{test.name}</span><span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-foreground">{fmtPrice(test.price)}</span></p><p>{test.details}</p><p className="text-muted-foreground">Report ready in: {test.turnaround}</p>{test.sample && <p>Sample: {test.sample}</p>}{test.preparation && <p>Preparation: {test.preparation}</p>}{test.prescriptionRequired && <p className="font-medium text-destructive">Prescription required</p>}</li>)}</ul></>}
              <LabServices labId={l.userId} />
              {user ? <Button className="mt-4 w-full rounded-full" onClick={() => { setPick(l); setTime(""); setDate(""); }}>Book test</Button> : <Button variant="outline" className="mt-4 w-full rounded-full" asChild><Link to="/login">Sign in to book</Link></Button>}
            </article>
          ))}
        </div>
      </section>
      {pick && (
        <section className="space-y-3 rounded-[22px] border-2 border-primary/30 bg-card p-6 shadow-soft">
          <h2 className="font-display text-xl font-semibold">Book at {pick.labName}</h2>
          {(() => {
            const catalogue = labTestCatalogue(pick);
            const chosen = tests.split(/[,\n]/).map((t) => t.trim()).filter(Boolean);
            const toggle = (name: string) => setTests((chosen.some((c) => c.toLowerCase() === name.toLowerCase()) ? chosen.filter((c) => c.toLowerCase() !== name.toLowerCase()) : [...chosen, name]).join(", "));
            const needRx = testsNeedingPrescription(catalogue, tests);
            return (
              <div className="grid gap-3 sm:grid-cols-2">
                {catalogue.length > 0 && <div className="sm:col-span-2"><Label>Choose tests</Label><div className="mt-2 flex flex-wrap gap-2">{catalogue.map((t) => { const on = chosen.some((c) => c.toLowerCase() === t.name.toLowerCase()); return <button type="button" key={t.name} onClick={() => toggle(t.name)} className={`rounded-full border px-3 py-1.5 text-sm ${on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>{t.name}{t.price > 0 ? ` · ${fmtPrice(t.price)}` : ""}{t.prescriptionRequired ? " · Rx" : ""}</button>; })}</div></div>}
                <div className="sm:col-span-2"><Label>Tests</Label><Input value={tests} onChange={(e) => setTests(e.target.value)} placeholder="e.g. CBC, LFT" /></div>
                <div className="sm:col-span-2"><Label>Doctor's prescription {needRx.length ? "(required)" : "(optional)"}</Label>
                  {rx.length === 0 ? <p className={`text-sm ${needRx.length ? "text-destructive" : "text-muted-foreground"}`}>{needRx.length ? `The lab needs a doctor's prescription for: ${needRx.join(", ")}. Remove these tests or consult a doctor first.` : "No prescription needed for these tests."}</p> : (
                    <Select value={appt || "none"} onValueChange={(v) => v === "none" ? setAppt("") : chooseRx(v)}><SelectTrigger><SelectValue placeholder="Select prescription" /></SelectTrigger>
                      <SelectContent>{!needRx.length && <SelectItem value="none">No prescription</SelectItem>}{rx.map((c) => <SelectItem key={c.appointmentId} value={c.appointmentId}>{docName(c.doctorId)} · {c.appointmentId} · {c.diagnosis || "Consultation"}</SelectItem>)}</SelectContent></Select>)}
                  {needRx.length > 0 && rx.length > 0 && <p className="mt-1 text-sm text-destructive">Prescription required for: {needRx.join(", ")}</p>}
                </div>
                <LabAppointmentTime labId={pick.userId} date={date} time={time} onDate={setDate} onTime={setTime} />
                <div className="flex gap-2 sm:col-span-2"><Button disabled={busy || !tests.trim() || (needRx.length > 0 && !appt) || !date || !time} onClick={book}>Confirm booking</Button><Button variant="ghost" onClick={() => setPick(null)}>Close</Button></div>
              </div>
            );
          })()}
        </section>
      )}
    </div>
  );
}
