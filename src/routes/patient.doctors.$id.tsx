import { DoctorBranches } from "@/components/app/DoctorBranches";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { BadgeCheck, Building2, CalendarDays, Clock, GraduationCap, Languages, MapPin, Video, Wallet, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/app/common";
import { BookingDatePicker } from "@/components/app/widgets";
import { weekdayShifts, nextBooking, nextAvailableDate, todayStr, useStore } from "@/lib/store";
import { meta } from "@/lib/meta";
import { FeedTabs } from "@/components/feed/FeedTabs";
import { RatingSummary, ReviewList } from "@/components/app/Reviews";
import { fmtPrice, fmtTime } from "@/lib/utils";
import { ProviderActions } from "@/components/app/ProviderActions";

export const Route = createFileRoute("/patient/doctors/$id")({
  head: () => meta("Doctor profile", "Doctor details, fees, languages and available appointment dates."),
  component: DoctorProfile,
});

function DoctorProfile() {
  const { id } = Route.useParams();
  const u = useStore((s) => s.users.find((x) => x.id === id));
  const d = useStore((s) => s.doctors.find((x) => x.userId === id));
  const av = useStore((s) => s.availability.find((x) => x.doctorId === id));
  const [date, setDate] = useState(() => nextAvailableDate(id) ?? todayStr());
  const allocation = useStore((s) => nextBooking(id, date, s));
  if (!u || !d) return <p>Doctor not found.</p>;
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const facts = [
    { icon: GraduationCap, label: "Qualification", v: d.qualification },
    { icon: Briefcase, label: "Experience", v: `${d.experience} years` },
    { icon: Wallet, label: "Consultation fee", v: fmtPrice(d.fee) },
    { icon: Languages, label: "Languages", v: d.languages.join(", ") || "—" },
    { icon: MapPin, label: "Clinic", v: `${d.clinicName}, ${d.clinicAddress}, ${d.city}` },
  ];
  const Pill = ({ children }: { children: React.ReactNode }) => <span className="flex items-center gap-1 rounded-full bg-primary-foreground/15 px-3 py-1">{children}</span>;
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="relative overflow-hidden rounded-[28px] bg-hero p-6 text-primary-foreground shadow-soft sm:p-8">
        <div aria-hidden className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-accent/25 blur-3xl" />
        <div className="relative grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
          <Avatar name={u.name} src={d.avatar} className="h-24 w-24 text-3xl ring-4 ring-primary-foreground/30 sm:h-28 sm:w-28" />
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.2em] opacity-75">Doctor profile</p>
            <h1 className="mt-1 break-words font-display text-3xl font-bold sm:text-4xl">{u.name}</h1>
            <p className="opacity-90">{d.specialization}{d.qualification ? ` · ${d.qualification}` : ""}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
              {d.verification === "Approved" && <Pill><BadgeCheck className="h-3.5 w-3.5" />Verified</Pill>}
              <Pill><Briefcase className="h-3.5 w-3.5" />{d.experience} yrs experience</Pill>
              {d.online && <Pill><Video className="h-3.5 w-3.5" />Online</Pill>}
              {d.clinic && <Pill><Building2 className="h-3.5 w-3.5" />In-clinic</Pill>}
              {d.city && <Pill><MapPin className="h-3.5 w-3.5" />{d.city}</Pill>}
            </div>
            <RatingSummary doctorId={id} className="mt-3" />
          </div>
          <div className="grid gap-3 rounded-2xl bg-card p-4 text-center text-foreground shadow-soft sm:col-span-2 sm:grid-cols-[1fr_auto] sm:items-center sm:text-left lg:col-span-1 lg:grid-cols-1 lg:text-center">
            <div><p className="text-xs text-muted-foreground">Consultation fee</p><p className="font-display text-2xl font-bold text-primary">{fmtPrice(d.fee)}</p></div>
            <Button size="lg" asChild><Link to="/patient/book/$doctorId" params={{ doctorId: id }}>Book appointment</Link></Button>
          </div>
        </div>
      </section>
      <ProviderActions providerId={id} name={u.name} doctor />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <section className="rounded-[22px] border bg-card p-5 shadow-soft sm:p-6">
            <h2 className="font-display text-xl font-semibold">About {u.name}</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{d.about || "No description yet."}</p>
            {d.services.length > 0 && <><h3 className="mt-5 text-sm font-bold text-secondary-foreground">Services</h3><div className="mt-2 flex flex-wrap gap-2">{d.services.map((x) => <span key={x} className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">{x}</span>)}</div></>}
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[...facts, { icon: BadgeCheck, label: "PMDC / licence", v: d.licenseNumber || "—" }].map((f) => <div key={f.label} className="flex gap-3 rounded-2xl border bg-background p-3 text-sm"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><f.icon className="h-4 w-4" /></span><div className="min-w-0"><p className="text-xs text-muted-foreground">{f.label}</p><p className="break-words font-semibold">{f.v}</p></div></div>)}
            </div>
          </section>
          <DoctorBranches doctorId={id} />
          <ReviewList doctorId={id} />
          <section className="space-y-3"><h2 className="font-display text-xl font-semibold">Posts & videos</h2><FeedTabs authorId={id} /></section>
        </div>
        <aside className="space-y-6 lg:sticky lg:top-4 lg:self-start">
          <section className="rounded-[22px] border bg-card p-5 shadow-soft">
            <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold"><CalendarDays className="h-5 w-5 text-primary" />Available dates</h2>
            <BookingDatePicker doctorId={id} date={date} onDate={setDate} />
            <Button className="mt-4 w-full" size="lg" disabled={!allocation} asChild={!!allocation}>
              {allocation ? <Link to="/patient/book/$doctorId" params={{ doctorId: id }} search={{ date }}>Book {date}</Link> : <span>No places available</span>}
            </Button>
          </section>
          {av && <section className="rounded-[22px] border bg-card p-5 shadow-soft"><h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold"><Clock className="h-5 w-5 text-primary" />Weekly timings</h2><div className="divide-y text-sm">{DAYS.map((day, i) => { const shifts = weekdayShifts(av, i); return <div key={day} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-2 py-2"><span className="font-semibold">{day}</span><span className={shifts.length ? "text-right" : "text-right text-muted-foreground"}>{shifts.length ? shifts.map((s) => `${fmtTime(s.start)}–${fmtTime(s.end)}`).join(" / ") : "Closed"}</span></div>; })}</div></section>}
        </aside>
      </div>
    </div>
  );
}
