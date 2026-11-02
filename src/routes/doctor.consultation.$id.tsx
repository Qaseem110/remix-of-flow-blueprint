import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { callPatient, completeConsultation, ensureConsultation, makeDocs, saveConsultation, useSession, useStore, type PrescriptionItem } from "@/lib/store";
import { meta } from "@/lib/meta";
import { fmtTime } from "@/lib/utils";

export const Route = createFileRoute("/doctor/consultation/$id")({
  head: () => meta("Consultation", "Conduct the consultation and complete notes, diagnosis, prescription and follow-up."),
  component: Console,
});

const emptyRx: PrescriptionItem = { medicine: "", dosage: "", frequency: "", duration: "", instructions: "" };

function Console() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const user = useSession()!;
  const a = useStore((s) => s.appointments.find((x) => x.id === id));
  const patient = useStore((s) => s.users.find((x) => x.id === a?.patientId));
  const allowed = useStore((s) => s.settings.allowedFileTypes);
  const [c, setC] = useState(() => (a ? ensureConsultation(id) : null));
  const [kind, setKind] = useState("Prescription");
  useEffect(() => { if (a && !c) setC(ensureConsultation(id)); }, [a, c, id]);
  if (!a || !patient || !c || a.doctorId !== user.id) return <p>Consultation not found.</p>;
  const done = a.status === "Completed";
  const upd = (p: Partial<typeof c>) => setC({ ...c, ...p });
  const setRx = (i: number, p: Partial<PrescriptionItem>) => upd({ prescription: c.prescription.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  const save = () => { saveConsultation(id, c); toast.success("Consultation record saved"); };
  const complete = () => {
    if (!c.diagnosis.trim()) return toast.error("Add a diagnosis before completing");
    if (c.followUpRequired && !c.followUpTiming.trim()) return toast.error("Enter recommended follow-up timing");
    completeConsultation(id, { ...c, prescription: c.prescription.filter((r) => r.medicine.trim()) });
    toast.success("Consultation completed");
    navigate({ to: "/doctor" });
  };
  const upload = (e: React.ChangeEvent<HTMLInputElement>) => {
    try { upd({ documents: [...c.documents, ...makeDocs(e.target.files ?? [], "doctor", kind)] }); } catch (err) { toast.error((err as Error).message); }
    e.target.value = "";
  };

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">{a.memberName ?? patient.name}</h1><p className="text-sm text-muted-foreground">{a.id} · #{a.queueNumber} · {a.date} {fmtTime(a.time)} · <TypeBadge type={a.type} /></p></div>
        <div className="flex items-center gap-2">
          <StatusBadge status={a.status} />
          {!done && !["In Consultation", "Ready to Join"].includes(a.status) && <Button variant="secondary" onClick={() => callPatient(id)}><PhoneCall className="mr-1 h-4 w-4" />{a.type === "online" ? "I'm ready (notify patient)" : "Call patient"}</Button>}
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          {a.type === "online" && !done && <VideoRoom roomId={a.id} selfName={user.name} otherName={a.memberName ?? patient.name} onLeave={() => navigate({ to: "/doctor" })} />}
          <section className="space-y-4 rounded-2xl border bg-card p-6 shadow-soft">
            <h2 className="text-lg font-semibold">Consultation record</h2>
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
                </div>
              ))}
            </div>

            <div>
              <Label>Documents for patient</Label>
              {!done && (
                <div className="mt-2 flex gap-2">
                  <Select value={kind} onValueChange={setKind}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent>{["Prescription", "Consultation summary", "Report", "Referral", "Other"].map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent></Select>
                  <label className="flex cursor-pointer items-center gap-1 rounded-md border px-3 text-sm"><Upload className="h-4 w-4" />Upload<input type="file" multiple className="hidden" accept={allowed.map((x) => "." + x).join(",")} onChange={upload} /></label>
                </div>
              )}
              <div className="mt-2"><DocList docs={c.documents} empty="No documents uploaded." /></div>
            </div>

            <div className="rounded-xl bg-muted p-4">
              <label className="flex items-center justify-between text-sm font-medium"><span>Follow-up required</span><Switch disabled={done} checked={c.followUpRequired} onCheckedChange={(v) => upd({ followUpRequired: v })} /></label>
              {c.followUpRequired && <Input disabled={done} className="mt-3" placeholder="Recommended timing, e.g. In 2 weeks" value={c.followUpTiming} onChange={(e) => upd({ followUpTiming: e.target.value })} />}
            </div>

            {done ? <p className="flex items-center gap-2 text-success"><CheckCircle2 className="h-5 w-5" /> Completed — record shared with patient.</p> : (
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={save}><Save className="mr-1 h-4 w-4" />Save record</Button>
                <Button onClick={complete}><CheckCircle2 className="mr-1 h-4 w-4" />Complete consultation</Button>
              </div>
            )}
          </section>
        </div>
        <aside className="rounded-2xl border bg-card p-5">
          <Tabs defaultValue="current">
            <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="current">This visit</TabsTrigger><TabsTrigger value="history">History</TabsTrigger></TabsList>
            <TabsContent value="current" className="space-y-3">
              <div><p className="text-xs uppercase text-muted-foreground">Reason for visit</p><p className="text-sm">{a.reason}</p></div>
              <div><p className="mb-2 text-xs uppercase text-muted-foreground">Patient uploaded documents</p><PinGate patientId={a.patientId}><DocList docs={a.documents} empty="No uploads for this visit." /></PinGate></div>
            </TabsContent>
            <TabsContent value="history"><PatientHistory patientId={a.patientId} memberId={a.memberId ?? null} excludeId={a.id} /></TabsContent>
          </Tabs>
        </aside>
      </div>
    </div>
  );
}
