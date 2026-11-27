import { ClinicSelect } from "@/components/app/ClinicSelect";
import type { CareItem } from "@/lib/care";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, Banknote, Briefcase, Building2, Check, Clock, CreditCard, GraduationCap, Languages, Upload, Video } from "lucide-react";
import { RatingSummary } from "@/components/app/Reviews";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, DocList } from "@/components/app/common";
import { BookingDatePicker } from "@/components/app/widgets";
import { weekdayShifts, bookAppointment, nextBooking, ensureFamilyMember, useActiveMember, readAndMakeDocs, nextAvailableDate, todayStr, useSession, useStore, type ConsultType, type DocFile, type PaymentMethod } from "@/lib/store";
import { cn, fmtPrice, fmtTime } from "@/lib/utils";
import { meta } from "@/lib/meta";
import { distanceKm, travelMinutes } from "@/lib/geo";
import { MapPin } from "lucide-react";

type Search = { date?: string; followUpOf?: string };

export const Route = createFileRoute("/patient/book/$doctorId")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    date: typeof s.date === "string" ? s.date : undefined,
    followUpOf: typeof s.followUpOf === "string" ? s.followUpOf : undefined,
  }),
  head: () => meta("Book appointment", "Choose your consultation and day, and receive an assigned queue number and estimated time."),
  component: Book,
});

const STEPS = ["Consultation type", "Date & queue", "Reason & reports", "Confirm"];

function Book() {
  const { doctorId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const user = useSession();
  const u = useStore((s) => s.users.find((x) => x.id === doctorId));
  const d = useStore((s) => s.doctors.find((x) => x.userId === doctorId));
  const allowed = useStore((s) => s.settings.allowedFileTypes);
  const av = useStore((s) => s.availability.find((x) => x.doctorId === doctorId));
  const [clinicId, setClinicId] = useState("");
  const [branch, setBranch] = useState<CareItem>();
  const [step, setStep] = useState(0);
  const [type, setType] = useState<ConsultType | null>(null);
  const [date, setDate] = useState(search.date ?? nextAvailableDate(doctorId) ?? todayStr());
  const allocation = useStore((s) => nextBooking(doctorId, date, s, type === "clinic" ? clinicId || undefined : undefined));
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState(search.followUpOf ? `Follow-up for ${search.followUpOf}` : "");
  const [docs, setDocs] = useState<DocFile[]>([]);
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const markLocation = () => {
    if (!navigator.geolocation) return toast.error("Location isn't available on this device");
    navigator.geolocation.getCurrentPosition((p) => setLoc({ lat: p.coords.latitude, lng: p.coords.longitude }), () => toast.error("Location permission was denied. Allow location for this site in your browser."), { timeout: 20000 });
  };
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const activeMember = useActiveMember();
  const members = useStore((s) => s.patients.find((p) => p.userId === user?.id)?.members) ?? [];
  const [forWho, setForWho] = useState<string>(activeMember ?? "main"); // "main" | member id | "new"
  const [newName, setNewName] = useState("");
  const [newRel, setNewRel] = useState("");
  if (!user || !u || !d) return <p>Doctor not found.</p>;

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []); e.target.value = "";
    const t = toast.loading("Reading report…");
    readAndMakeDocs(files, "patient").then((d) => { setDocs((prev) => [...prev, ...d]); toast.dismiss(t); }).catch((err) => toast.error((err as Error).message, { id: t }));
  };
  const confirm = async () => {
    if (!type || busy) return;
    setBusy(true);
    try {
      let memberId: string | undefined, memberName: string | undefined;
      if (forWho === "new") {
        const m = ensureFamilyMember(user.id, newName, newRel.trim() || "Other");
        memberId = m.id; memberName = m.name;
      } else if (forWho !== "main") {
        const m = members.find((x) => x.id === forWho); memberId = m?.id; memberName = m?.name;
      }
      const a = await bookAppointment({clinicLat:branch?Number(branch.data.lat):undefined,clinicLng:branch?Number(branch.data.lng):undefined, clinicId: type === "clinic" ? clinicId || undefined : undefined, clinicName: branch ? String(branch.data.title) : d.clinicName, clinicAddress: branch ? String(branch.data.details) : d.clinicAddress, memberId, memberName, doctorId, patientId: user.id, type, date, reason, documents: docs, followUpOf: search.followUpOf, payment, patientLat: type === "clinic" ? loc?.lat : undefined, patientLng: type === "clinic" ? loc?.lng : undefined });
      navigate({ to: "/patient/appointments/$id", params: { id: a.id }, search: { confirmed: true } });
    } catch (err) { toast.error((err as Error).message); setStep(1); } finally { setBusy(false); }
  };
  const clinicLat=branch?Number(branch.data.lat):d.clinicLat;const clinicLng=branch?Number(branch.data.lng):d.clinicLng;
  const canNext = [!!type, !!allocation, reason.trim().length > 2 && (forWho !== "new" || newName.trim().length > 1), true][step];

  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const facts: [typeof GraduationCap, string, string][] = [
    [GraduationCap, "Qualification", d.qualification || "—"],
    [Briefcase, "Experience", `${d.experience} years`],
    [BadgeCheck, "PMDC / licence", d.licenseNumber || "—"],
    [Languages, "Languages", d.languages.join(", ") || "—"],
    [MapPin, "Clinic", [d.clinicName, d.clinicAddress, d.city].filter(Boolean).join(", ") || "—"],
  ];
  return (
    <div className="mx-auto max-w-6xl">
      <section className="relative overflow-hidden rounded-[28px] bg-hero p-6 text-primary-foreground shadow-soft sm:p-8">
        <div aria-hidden className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-accent/25 blur-3xl" />
        <div className="relative grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
          <Avatar name={u.name} src={d.avatar} className="h-24 w-24 text-3xl ring-4 ring-primary-foreground/30" />
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.2em] opacity-75">{search.followUpOf ? "Book follow-up" : "Book appointment"}</p>
            <h1 className="mt-1 truncate font-display text-3xl font-bold sm:text-4xl">{u.name}</h1>
            <p className="opacity-90">{d.specialization}{d.qualification ? ` · ${d.qualification}` : ""}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
              {d.verification === "Approved" && <span className="flex items-center gap-1 rounded-full bg-primary-foreground/15 px-3 py-1"><BadgeCheck className="h-3.5 w-3.5" />Verified</span>}
              <span className="rounded-full bg-primary-foreground/15 px-3 py-1">{d.experience} yrs experience</span>
              {d.online && <span className="flex items-center gap-1 rounded-full bg-primary-foreground/15 px-3 py-1"><Video className="h-3.5 w-3.5" />Online</span>}
              {d.clinic && <span className="flex items-center gap-1 rounded-full bg-primary-foreground/15 px-3 py-1"><Building2 className="h-3.5 w-3.5" />In-clinic</span>}
            </div>
            <RatingSummary doctorId={doctorId} className="mt-2" />
          </div>
          <div className="rounded-2xl bg-card p-4 text-center text-foreground shadow-soft">
            <p className="text-xs text-muted-foreground">Consultation fee</p>
            <p className="font-display text-2xl font-bold text-primary">{fmtPrice(d.fee)}</p>
          </div>
        </div>
      </section>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
      <ol className="mb-5 grid grid-cols-4 gap-2">
        {STEPS.map((s, i) => (
          <li key={s} className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold", i < step ? "bg-primary text-primary-foreground" : i === step ? "bg-sidebar text-primary-foreground ring-4 ring-primary/20" : "bg-muted text-muted-foreground")}>{i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>
              <div className={cn("h-1 flex-1 rounded-full", i < step ? "bg-primary" : "bg-muted")} />
            </div>
            <p className={cn("mt-1.5 truncate text-xs", i === step ? "font-semibold text-foreground" : "text-muted-foreground")}>{s}</p>
          </li>
        ))}
      </ol>
      <div className="rounded-[22px] border bg-card p-5 shadow-soft sm:p-6">
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
        {step === 1 && <>{type === "clinic" && <ClinicSelect doctorId={doctorId} value={clinicId} onChange={(id,b) => { setClinicId(id); setBranch(b); setDate(nextAvailableDate(doctorId,id || undefined) ?? todayStr()); }} />}<BookingDatePicker doctorId={doctorId} date={date} onDate={setDate} clinicId={type === "clinic" ? clinicId || undefined : undefined} /></>}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <Label>Who is this appointment for?</Label>
              <div className="mt-1 flex flex-wrap gap-2">
                {[["main", `${user.name} (Me)`], ...members.map((m) => [m.id, `${m.name} (${m.relation})`]), ["new", "+ Someone else"]].map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setForWho(v)} className={cn("rounded-full border-2 px-3 py-1.5 text-sm", forWho === v ? "border-primary bg-secondary" : "hover:border-primary/50")}>{l}</button>
                ))}
              </div>
              {forWho === "new" && (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Input placeholder="Full name" value={newName} onChange={(e) => setNewName(e.target.value)} />
                  <Input placeholder="Relation (e.g. Sister, Friend)" value={newRel} onChange={(e) => setNewRel(e.target.value)} />
                  <p className="text-xs text-muted-foreground sm:col-span-2">A linked account will be created automatically for this person.</p>
                </div>
              )}
            </div>
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
          <>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {[["Patient", forWho === "main" ? user.name : forWho === "new" ? newName : members.find((m) => m.id === forWho)?.name ?? ""], ["Doctor", u.name], ["Type", type === "online" ? "Online Consultation" : "In-Clinic Consultation"], ["Date", date], ["Queue number", allocation ? `#${allocation.queueNumber}` : "Full"], ["Estimated time", allocation ? fmtTime(allocation.time) : "Unavailable"], ["Location", type === "online" ? "Video link available in app" : branch ? `${branch.data.title}, ${branch.data.details}` : `${d.clinicName}, ${d.clinicAddress}`], ["Fee", fmtPrice(d.fee)], ["Reason", reason], ["Documents", `${docs.length} file(s)`]].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-muted p-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>
            ))}
          </dl>
          {type === "clinic" && (
            <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border p-4 text-sm">
              <MapPin className="h-5 w-5 text-primary" />
              <div className="flex-1">
                <p className="font-medium">Your location</p>
                <p className="text-muted-foreground">{loc ? (clinicLat != null && clinicLng != null && Number.isFinite(clinicLat) && Number.isFinite(clinicLng) ? (() => { const km = distanceKm(loc, { lat: clinicLat, lng: clinicLng }); return `About ${km.toFixed(1)} km away, roughly ${travelMinutes(km)} min to reach the clinic.`; })() : "Location marked. The doctor hasn't set the clinic location yet.") : "Mark where you'll travel from so we can tell you when to leave."}</p>
              </div>
              <Button type="button" variant="outline" onClick={markLocation}>{loc ? "Update location" : "Mark my location"}</Button>
            </div>
          )}
          <p className="mb-2 mt-5 text-sm font-medium">Payment method</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {([["cash", type === "online" ? "Pay later" : "Pay at clinic", Banknote], ["card", "Card (online)", CreditCard]] as const).map(([v, t, Icon]) => (
              <button key={v} type="button" onClick={() => setPayment(v)} className={cn("flex items-center gap-3 rounded-xl border-2 p-4 text-left text-sm", payment === v ? "border-primary bg-secondary" : "hover:border-primary/50")}>
                <Icon className="h-5 w-5 text-primary" /><span className="font-medium">{t}</span>
              </button>
            ))}
          </div>
          {payment === "card" && <p className="mt-2 text-xs text-muted-foreground">Card payment will be processed once the payment service is connected.</p>}
          </>
        )}
        <div className="mt-6 flex justify-between">
          <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</Button>
          {step < 3 ? <Button disabled={!canNext} onClick={() => setStep(step + 1)}>Continue</Button> : <Button disabled={busy || !allocation} onClick={confirm}><Check className="mr-1 h-4 w-4" />{busy ? "Booking…" : "Confirm appointment"}</Button>}
        </div>
      </div>
      </div>
      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-[22px] border bg-card p-5 shadow-soft">
          <h2 className="font-bold text-secondary-foreground">About the doctor</h2>
          <p className="mt-2 text-sm text-muted-foreground">{d.about || "No description yet."}</p>
          <div className="mt-4 space-y-3">{facts.map(([Icon, k, v]) => <div key={k} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 text-sm"><Icon className="mt-0.5 h-4 w-4 text-primary" /><div className="min-w-0"><p className="text-xs text-muted-foreground">{k}</p><p className="break-words font-medium">{v}</p></div></div>)}</div>
          {d.services.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{d.services.map((x) => <span key={x} className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">{x}</span>)}</div>}
        </div>
        {av && <div className="rounded-[22px] border bg-card p-5 shadow-soft">
          <h2 className="flex items-center gap-2 font-bold text-secondary-foreground"><Clock className="h-4 w-4 text-primary" />Weekly timings</h2>
          <div className="mt-3 space-y-1.5 text-sm">{DAYS.map((day, i) => { const sh = weekdayShifts(av, i); return <div key={day} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-2"><span className="text-muted-foreground">{day}</span><span className={sh.length ? "font-medium" : "text-muted-foreground"}>{sh.length ? sh.map((x) => `${fmtTime(x.start)}–${fmtTime(x.end)}`).join(" / ") : "Off"}</span></div>; })}</div>
        </div>}
        {allocation && step > 0 && <div className="rounded-[22px] border border-primary/30 bg-secondary p-5 shadow-soft">
          <p className="text-xs text-muted-foreground">Your place on {date}</p>
          <p className="font-display text-3xl font-bold text-primary">#{allocation.queueNumber}</p>
          <p className="text-sm">Estimated time {fmtTime(allocation.time)}</p>
        </div>}
      </aside>
      </div>
    </div>
  );
}
