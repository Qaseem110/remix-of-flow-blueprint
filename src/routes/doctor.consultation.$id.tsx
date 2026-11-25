import { VolunteerCall } from "@/components/app/VolunteerCall";
import { PrescriptionTemplates } from "@/components/app/PrescriptionTemplates";
import { trackingNumber } from "@/lib/store";
import { DoctorLabOrder } from "@/components/app/DoctorLabOrder";
import { suggestTimes } from "@/lib/medicine-reminders";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Save, Trash2, Upload, CheckCircle2, PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PinGate } from "@/components/app/ReportPin";
import { DocList, StatusBadge, TypeBadge } from "@/components/app/common";
import { VideoRoom } from "@/components/app/widgets";
import { PatientHistory } from "@/components/app/PatientHistory";
import { MedicineInput } from "@/components/app/MedicineInput";
import { consultationAppointment, addConsultationDocs, callVolunteerPatient, callPatient, completeConsultation, ensureConsultation, makeDocs, persistConsultation, useSession, useStore, type PrescriptionItem } from "@/lib/store";
import { meta } from "@/lib/meta";
import { fmtTime } from "@/lib/utils";
import { ConsultationTemplates } from "@/components/app/ConsultationTemplates";

export const Route = createFileRoute("/doctor/consultation/$id")({
  head: () => meta("Consultation", "Conduct the consultation and complete notes, diagnosis, prescription and follow-up."),
  component: Console,
});

const emptyRx: PrescriptionItem = { medicine: "", dosage: "", frequency: "", duration: "", instructions: "" };

function Console() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const user = useSession();
  const a = useStore((s) => consultationAppointment(id, s));
  const patient = useStore((s) => s.users.find((x) => x.id === a?.patientId));
  const allowed = useStore((s) => s.settings.allowedFileTypes);
  const [c, setC] = useState<ReturnType<typeof ensureConsultation> | null>(null);
  const [kind, setKind] = useState("Prescription");
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (a && user && a.doctorId === user.id && a.status !== "Expired") setC(ensureConsultation(id));
    else setC(null);
  }, [id, a?.id, user?.id]);
  if (!user || !a || !patient || a.doctorId !== user.id) return <p>Consultation not found.</p>;
  if (a.status === "Expired") return <p>This appointment has ended. Patient reports remain in their health records.</p>;
  if (!c || c.appointmentId !== id) return <p role="status" className="text-muted-foreground">Loading consultation…</p>;
  const done = a.status === "Completed";
  const upd = (p: Partial<typeof c>) => setC({ ...c, ...p });
  const setRx = (i: number, p: Partial<PrescriptionItem>) => upd({ prescription: c.prescription.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  const save = async () => { try { await persistConsultation(id, c); toast.success("Consultation record saved"); } catch(e) { toast.error((e as Error).message); } };
  const complete = async () => {
    if (!c.diagnosis.trim()) return toast.error("Add a diagnosis before completing");
    if (c.followUpRequired && !c.followUpTiming.trim()) return toast.error("Enter recommended follow-up timing");
    try { await completeConsultation(id, { ...c, prescription: c.prescription.filter((r) => r.medicine.trim()) }); }
    catch(e) { toast.error((e as Error).message); return; }
    toast.success("Consultation completed");
    navigate({ to: a.id.startsWith("VB") ? "/doctor/volunteer" : "/doctor" });
  };
  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setUploading(true);
    try {
      const saved = await addConsultationDocs(id, makeDocs(files, "doctor", kind));
      setC((current) => current ? { ...current, documents: saved.documents } : saved);
      toast.success("Documents uploaded and saved");
    } catch (err) { toast.error((err as Error).message); }
    finally { setUploading(false); }
  };

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">{a.memberName ?? patient.name}</h1><p className="text-sm text-muted-foreground">{trackingNumber(a)} · #{a.queueNumber} · {a.date} {fmtTime(a.time)} · <TypeBadge type={a.type} /></p></div>
        <div className="flex items-center gap-2">
          <StatusBadge status={a.status} />
          {!done && !["In Consultation", "Ready to Join"].includes(a.status) && <Button variant="secondary" onClick={() => a.id.startsWith("VB") ? void callVolunteerPatient(id).catch(e=>toast.error(e.message)) : callPatient(id)}><PhoneCall className="mr-1 h-4 w-4" />{a.type === "online" ? "I'm ready (notify patient)" : "Call patient"}</Button>}
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          {a.type === "online" && !done && (a.id.startsWith("VB") ? <VolunteerCall bookingId={a.id} name={user.name}/> : <VideoRoom roomId={a.id} selfName={user.name} otherName={a.memberName ?? patient.name} onLeave={() => navigate({ to: "/doctor" })} />)}
          <section className="space-y-4 rounded-2xl border bg-card p-6 shadow-soft">
            <h2 className="text-lg font-semibold">Consultation record</h2>
            {!done && <ConsultationTemplates onApply={(patch) => upd({ ...patch, prescription: [...c.prescription, ...(patch.prescription ?? [])] })} />}
            <div><Label>Symptoms / chief complaint</Label><Textarea disabled={done} value={c.symptoms} onChange={(e) => upd({ symptoms: e.target.value })} /></div>
            <div><Label>Diagnosis</Label><Input disabled={done} value={c.diagnosis} onChange={(e) => upd({ diagnosis: e.target.value })} /></div>
            <div><Label>Clinical / consultation notes <span className="text-xs text-warning-foreground">(private — doctors only)</span></Label><Textarea disabled={done} rows={3} value={c.privateNotes} onChange={(e) => upd({ privateNotes: e.target.value })} className="bg-warning/10" /></div>
            <div><Label>Patient-visible consultation summary</Label><Textarea disabled={done} rows={3} value={c.summary} onChange={(e) => upd({ summary: e.target.value })} /></div>

            <div>
              <div className="mb-2 flex items-center justify-between"><Label>Prescription</Label>{!done && <Button size="sm" variant="ghost" onClick={() => upd({ prescription: [...c.prescription, { ...emptyRx }] })}><Plus className="mr-1 h-4 w-4" />Add medicine</Button>}</div>
              {c.prescription.length === 0 && <p className="text-sm text-muted-foreground">No medicines added.</p>}
              {c.prescription.map((r, i) => (
                <div key={i} className="mb-2 grid gap-2 rounded-xl border p-3 sm:grid-cols-5">
                  <MedicineInput disabled={done} value={r.medicine} onChange={(v) => setRx(i, { medicine: v })} />
                  {(["dosage", "frequency", "duration"] as const).map((k) => <Input key={k} disabled={done} placeholder={k[0].toUpperCase() + k.slice(1)} value={r[k]} onChange={(e) => setRx(i, { [k]: e.target.value })} />)}
                  <div className="flex gap-1"><Input disabled={done} placeholder="Instructions" value={r.instructions} onChange={(e) => setRx(i, { instructions: e.target.value })} />{!done && <Button size="icon" variant="ghost" onClick={() => upd({ prescription: c.prescription.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>}</div>
                  <div className="flex flex-wrap items-center gap-2 sm:col-span-5">
                    <span className="text-xs text-muted-foreground">Patient alerts:</span>
                    {(r.times ?? []).map((t) => <span key={t} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{fmtTime(t)}{!done && <button type="button" aria-label="Remove alert" onClick={() => setRx(i, { times: (r.times ?? []).filter((x) => x !== t) })}>×</button>}</span>)}
                    {!done && <Input type="time" className="h-8 w-32" onChange={(e) => { const v = e.target.value; if (v && !(r.times ?? []).includes(v)) setRx(i, { times: [...(r.times ?? []), v].sort() }); e.target.value = ""; }} />}
                    {!done && <Button type="button" size="sm" variant="outline" disabled={!suggestTimes(r.frequency).length} onClick={() => setRx(i, { times: suggestTimes(r.frequency) })}>Set from frequency</Button>}
                  </div>
                </div>
              ))}
            </div>

            <div>
              {!done && <PrescriptionTemplates items={c.prescription} onApply={(items) => upd({ prescription: [...c.prescription, ...items] })} />}
              <Label>Lab tests</Label>
              <Input disabled={done} placeholder="Recommended tests, e.g. CBC, LFT, Ultrasound abdomen" value={c.labTests ?? ""} onChange={(e) => upd({ labTests: e.target.value })} />
              <p className="mt-1 text-xs text-muted-foreground">The patient can also book these at any laboratory using this prescription.</p>
              <DoctorLabOrder appointmentId={a.id} tests={c.labTests ?? ""} />
            </div>

            <div>
              <Label>Documents for patient</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Select value={kind} onValueChange={setKind}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent>{["Prescription", "Consultation summary", "Report", "Other"].map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent></Select>
                  <Button type="button" variant="outline" disabled={uploading} onClick={() => fileInput.current?.click()}><Upload className="mr-1 h-4 w-4" />{uploading ? "Uploading…" : "Upload documents"}</Button>
                  <input ref={fileInput} aria-label="Upload consultation documents" type="file" multiple className="hidden" accept={allowed.map((x) => "." + x).join(",")} onChange={upload} />
                </div>
              <p className="mt-1 text-xs text-muted-foreground">{allowed.join(", ").toUpperCase()} · Up to 10 MB per file</p>
              <div className="mt-2"><DocList docs={c.documents} empty="No documents uploaded." /></div>
            </div>

            <div className="rounded-xl bg-muted p-4">
              <label className="flex items-center justify-between text-sm font-medium"><span>Follow-up required</span><Switch disabled={done} checked={c.followUpRequired} onCheckedChange={(v) => upd({ followUpRequired: v })} /></label>
              {c.followUpRequired && <><Input disabled={done} className="mt-3" placeholder="Recommended timing, e.g. In 2 weeks" value={c.followUpTiming} onChange={(e) => upd({ followUpTiming: e.target.value })} /><Label htmlFor="follow-up-date">Follow-up date</Label><Input id="follow-up-date" type="date" disabled={done} value={c.followUpDate ?? ""} onChange={(e) => upd({ followUpDate: e.target.value })} /></>}
            </div>

            {done ? <p className="flex items-center gap-2 text-success"><CheckCircle2 className="h-5 w-5" /> Completed — record shared with patient.</p> : (
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" disabled={uploading} onClick={save}><Save className="mr-1 h-4 w-4" />Save record</Button>
                <Button disabled={uploading} onClick={complete}><CheckCircle2 className="mr-1 h-4 w-4" />Complete consultation</Button>
              </div>
            )}
          </section>
        </div>
        <aside className="rounded-2xl border bg-card p-5">
          <Tabs defaultValue="current">
            <TabsList className="grid w-full grid-cols-3"><TabsTrigger value="current">This visit</TabsTrigger><TabsTrigger value="reports">All reports</TabsTrigger><TabsTrigger value="history">History</TabsTrigger></TabsList>
            <TabsContent value="current" className="space-y-3">
              <div><p className="text-xs uppercase text-muted-foreground">Reason for visit</p><p className="text-sm">{a.reason}</p></div>
              <div><p className="mb-2 text-xs uppercase text-muted-foreground">Patient uploaded documents</p><PinGate patientId={a.patientId}><DocList docs={a.documents} empty="No uploads for this visit." /></PinGate></div>
            </TabsContent>
            <TabsContent value="reports"><PinGate patientId={a.patientId}><AllReports patientId={a.patientId} memberId={a.memberId ?? null} /></PinGate></TabsContent>
            <TabsContent value="history"><PatientHistory patientId={a.patientId} memberId={a.memberId ?? null} excludeId={a.id} /></TabsContent>
          </Tabs>
        </aside>
      </div>
    </div>
  );
}

/** Every health report of the patient (all visits, all doctors), newest first. */
function AllReports({ patientId, memberId }: { patientId: string; memberId: string | null }) {
  const appts = useStore((s) => s.appointments);
  const cons = useStore((s) => s.consultations);
  const visits = appts.filter((x) => x.patientId === patientId && (x.memberId ?? null) === memberId);
  const ids = new Set(visits.map((x) => x.id));
  const seen = new Set<string>();
  const docs = [...visits.flatMap((x) => x.documents), ...cons.filter((c) => ids.has(c.appointmentId)).flatMap((c) => c.documents)]
    .filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)))
    .sort((x, y) => (y.uploadedAt ?? "").localeCompare(x.uploadedAt ?? ""));
  return <DocList docs={docs} empty="No health reports yet." />;
}
