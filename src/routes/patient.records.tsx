import { createFileRoute, Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { Pill, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocList, PageHeader, TypeBadge } from "@/components/app/common";
import { addAppointmentDocs, readAndMakeDocs, memberOf, slotDateTime, useActiveMember, useSession, useStore, type DocFile } from "@/lib/store";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/patient/records")({
  head: () => meta("Health records", "Consultation history, prescriptions and documents."),
  component: Records,
});

function Records() {
  const user = useSession()!;
  const s = useStore((s) => s);
  const member = useActiveMember();
  const allowed = s.settings.allowedFileTypes;
  const mine = (apptId: string) => memberOf(s.appointments.find((a) => a.id === apptId)) === member;
  const records = s.consultations
    .filter((c) => c.patientId === user.id && c.completedAt && mine(c.appointmentId))
    .map((c) => ({ c, a: s.appointments.find((a) => a.id === c.appointmentId)!, doc: s.users.find((u) => u.id === c.doctorId)! }))
    .sort((x, y) => slotDateTime(y.a).getTime() - slotDateTime(x.a).getTime());
  const myAppts = s.appointments.filter((a) => a.patientId === user.id && memberOf(a) === member);
  const allDocs = [
    ...records.flatMap((r) => r.c.documents.map((d) => ({ d, doctorId: r.c.doctorId }))),
    ...myAppts.flatMap((a) => a.documents.map((d) => ({ d, doctorId: a.doctorId }))),
  ];
  const myDoctors = [...new Set(myAppts.map((a) => a.doctorId))].map((id) => s.users.find((u) => u.id === id)).filter(Boolean) as { id: string; name: string }[];
  const kinds = [...new Set(allDocs.map((x) => x.d.kind))];
  const [q, setQ] = useState(""); const [fDoc, setFDoc] = useState("all"); const [fKind, setFKind] = useState("all");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const docDay = (d: DocFile) => d.reportDate || (d.uploadedAt || "").slice(0, 10);
  const filtered = allDocs.filter(({ d, doctorId }) =>
    (fDoc === "all" || doctorId === fDoc) && (fKind === "all" || d.kind === fKind) &&
    (!from || docDay(d) >= from) && (!to || docDay(d) <= to) &&
    (!q || `${d.title ?? ""} ${d.name}`.toLowerCase().includes(q.toLowerCase())));
  // Group by report date (or upload date) so same-date reports land in one box.
  const byDay = new Map<string, DocFile[]>();
  for (const { d } of filtered) {
    const day = docDay(d) || "unknown";
    byDay.set(day, [...(byDay.get(day) ?? []), d]);
  }
  const docGroups = [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, docs]) => ({
      date,
      label: date === "unknown" ? "Unknown date" : format(new Date(date + "T00:00:00"), "d MMMM yyyy"),
      docs: docs.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),
    }));
  // Upload: doctor is required; the file is attached to the latest appointment with that doctor.
  const [upDoc, setUpDoc] = useState("");
  const [busy, setBusy] = useState(false);
  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []); e.target.value = "";
    if (!upDoc) { toast.error("Please select the doctor first"); return; }
    const appt = myAppts.filter((a) => a.doctorId === upDoc && a.status !== "Cancelled").sort((x, y) => slotDateTime(y).getTime() - slotDateTime(x).getTime())[0]
      ?? myAppts.filter((a) => a.doctorId === upDoc)[0];
    if (!appt) { toast.error("No appointment with this doctor"); return; }
    setBusy(true); const t = toast.loading("Reading report…");
    try { addAppointmentDocs(appt.id, await readAndMakeDocs(files, "patient")); toast.success("Report saved", { id: t }); }
    catch (err) { toast.error((err as Error).message, { id: t }); } finally { setBusy(false); }
  };

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
                <div><p className="font-display text-xl font-semibold">{doc.name}</p><p className="text-sm text-muted-foreground">{format(slotDateTime(a), "d MMM yyyy, h:mm a")} · {a.id}</p></div>
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

        <TabsContent value="docs" className="space-y-4">
          <div className="rounded-2xl border bg-card p-5 shadow-soft">
            <p className="mb-2 font-semibold">Upload a report</p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-56 flex-1"><Label>Doctor <span className="text-destructive">*</span></Label>
                <Select value={upDoc} onValueChange={setUpDoc}><SelectTrigger><SelectValue placeholder={myDoctors.length ? "Select doctor" : "Book an appointment first"} /></SelectTrigger>
                  <SelectContent>{myDoctors.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select>
              </div>
              <label className={`flex items-center gap-2 rounded-md border px-4 py-2 text-sm ${upDoc && !busy ? "cursor-pointer text-primary hover:border-primary" : "pointer-events-none opacity-50"}`}>
                <Upload className="h-4 w-4" />{busy ? "Reading…" : "Choose files"}
                <input type="file" multiple className="hidden" accept={allowed.map((x) => "." + x).join(",")} onChange={onUpload} disabled={!upDoc || busy} />
              </label>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">The report name and date are read from the document automatically.</p>
          </div>
          <div className="grid gap-2 rounded-2xl border bg-card p-4 sm:grid-cols-5">
            <Input placeholder="Search report name" value={q} onChange={(e) => setQ(e.target.value)} className="sm:col-span-2" />
            <Select value={fDoc} onValueChange={setFDoc}><SelectTrigger aria-label="Filter by doctor"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All doctors</SelectItem>{myDoctors.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select>
            <Select value={fKind} onValueChange={setFKind}><SelectTrigger aria-label="Filter by type"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All types</SelectItem>{kinds.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent></Select>
            <Button variant="ghost" onClick={() => { setQ(""); setFDoc("all"); setFKind("all"); setFrom(""); setTo(""); }}>Clear</Button>
            <div className="flex items-center gap-2 sm:col-span-5 text-sm"><span className="text-muted-foreground">From</span><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" /><span className="text-muted-foreground">To</span><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" /></div>
          </div>
          {docGroups.length === 0 && <p className="text-muted-foreground">{allDocs.length ? "No reports match the filter." : "No documents yet."}</p>}
          {docGroups.map((g) => (
            <div key={g.date} className="rounded-2xl border bg-card p-5 shadow-soft">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-display text-lg font-semibold">{g.label}</p>
                <p className="text-xs text-muted-foreground">{g.docs.length} file{g.docs.length > 1 ? "s" : ""}</p>
              </div>
              <DocList docs={g.docs} empty="No documents." />
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
