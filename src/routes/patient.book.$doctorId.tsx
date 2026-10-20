import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Building2, Check, Upload, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, DocList } from "@/components/app/common";
import { SlotPicker } from "@/components/app/widgets";
import { bookAppointment, makeDocs, nextAvailableDate, todayStr, useSession, useStore, type ConsultType, type DocFile } from "@/lib/store";
import { cn } from "@/lib/utils";
import { meta } from "@/lib/meta";

type Search = { date?: string; time?: string; followUpOf?: string };

export const Route = createFileRoute("/patient/book/$doctorId")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    date: typeof s.date === "string" ? s.date : undefined,
    time: typeof s.time === "string" ? s.time : undefined,
    followUpOf: typeof s.followUpOf === "string" ? s.followUpOf : undefined,
  }),
  head: () => meta("Book appointment", "Choose consultation type, date, time and reason for your visit."),
  component: Book,
});

const STEPS = ["Consultation type", "Date & time", "Reason & reports", "Confirm"];

function Book() {
  const { doctorId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const user = useSession()!;
  const u = useStore((s) => s.users.find((x) => x.id === doctorId));
  const d = useStore((s) => s.doctors.find((x) => x.userId === doctorId));
  const allowed = useStore((s) => s.settings.allowedFileTypes);
  const [step, setStep] = useState(0);
  const [type, setType] = useState<ConsultType | null>(null);
  const [date, setDate] = useState(search.date ?? nextAvailableDate(doctorId) ?? todayStr());
  const [time, setTime] = useState(search.time ?? "");
  const [reason, setReason] = useState(search.followUpOf ? `Follow-up for ${search.followUpOf}` : "");
  const [docs, setDocs] = useState<DocFile[]>([]);
  if (!u || !d) return <p>Doctor not found.</p>;

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    try { setDocs([...docs, ...makeDocs(e.target.files ?? [], "patient")]); } catch (err) { toast.error((err as Error).message); }
    e.target.value = "";
  };
  const confirm = () => {
    try {
      const a = bookAppointment({ doctorId, patientId: user.id, type: type!, date, time, reason, documents: docs, followUpOf: search.followUpOf });
      navigate({ to: "/patient/appointments/$id", params: { id: a.id }, search: { confirmed: true } });
    } catch (err) { toast.error((err as Error).message); setStep(1); }
  };
  const canNext = [!!type, !!time, reason.trim().length > 2, true][step];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center gap-4">
        <Avatar name={u.name} src={d.avatar} />
        <div><h1 className="text-2xl font-semibold">{search.followUpOf ? "Book follow-up" : "Book appointment"}</h1><p className="text-muted-foreground">{u.name} · {d.specialization} · {d.fee} LYD</p></div>
      </div>
      <ol className="mb-6 flex gap-2">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1">
            <div className={cn("h-1.5 rounded-full", i <= step ? "bg-primary" : "bg-muted")} />
            <p className={cn("mt-1.5 text-xs", i === step ? "font-semibold text-foreground" : "text-muted-foreground")}>{s}</p>
          </li>
        ))}
      </ol>
      <div className="rounded-2xl border bg-card p-6 shadow-soft">
        {step === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {([["online", "Online Consultation", "Video/audio from anywhere", Video, d.online], ["clinic", "In-Clinic Consultation", `${d.clinicName}, ${d.city}`, Building2, d.clinic]] as const).map(([v, t, sub, Icon, ok]) => (
              <button key={v} disabled={!ok} onClick={() => setType(v)} className={cn("rounded-xl border-2 p-5 text-left transition", type === v ? "border-primary bg-secondary" : "hover:border-primary/50", !ok && "cursor-not-allowed opacity-40")}>
                <Icon className="h-6 w-6 text-primary" />
                <p className="mt-3 font-semibold">{t}</p>
                <p className="text-sm text-muted-foreground">{ok ? sub : "Not offered by this doctor"}</p>
              </button>
            ))}
          </div>
        )}
        {step === 1 && <SlotPicker doctorId={doctorId} date={date} time={time} onDate={setDate} onTime={setTime} />}
        {step === 2 && (
          <div className="space-y-4">
            <div><Label htmlFor="reason">Reason for visit</Label><Textarea id="reason" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Describe your symptoms or the reason for this visit" /></div>
            <div>
              <Label>Previous reports / documents (optional)</Label>
              <label className="mt-1 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-sm text-muted-foreground hover:border-primary">
                <Upload className="h-5 w-5" /> Click to upload ({allowed.join(", ").toUpperCase()})
                <input type="file" multiple className="hidden" accept={allowed.map((x) => "." + x).join(",")} onChange={onFiles} />
              </label>
              <div className="mt-3"><DocList docs={docs} empty="" /></div>
            </div>
          </div>
        )}
        {step === 3 && (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {[["Doctor", u.name], ["Type", type === "online" ? "Online Consultation" : "In-Clinic Consultation"], ["Date", date], ["Time", time], ["Location", type === "online" ? "Video link available in app" : `${d.clinicName}, ${d.clinicAddress}`], ["Fee", `${d.fee} LYD`], ["Reason", reason], ["Documents", `${docs.length} file(s)`]].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-muted p-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>
            ))}
          </dl>
        )}
        <div className="mt-6 flex justify-between">
          <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</Button>
          {step < 3 ? <Button disabled={!canNext} onClick={() => setStep(step + 1)}>Continue</Button> : <Button onClick={confirm}><Check className="mr-1 h-4 w-4" /> Confirm appointment</Button>}
        </div>
      </div>
    </div>
  );
}
