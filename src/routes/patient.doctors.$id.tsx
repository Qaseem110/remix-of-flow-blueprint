import { DoctorBranches } from "@/components/app/DoctorBranches";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Building2, GraduationCap, Languages, MapPin, Video, Wallet, Briefcase } from "lucide-react";
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
  return (
    <div className="mx-auto max-w-5xl">
      <div className="rounded-3xl bg-hero p-6 text-primary-foreground md:p-8">
        <div className="flex flex-wrap items-center gap-5">
          <Avatar name={u.name} src={d.avatar} className="h-20 w-20 text-2xl" />
          <div className="flex-1">
            <h1 className="text-3xl font-semibold">{u.name}</h1>
            <p className="opacity-85">{d.specialization}</p>
            <RatingSummary doctorId={id} className="mt-1" />
            <div className="mt-2 flex gap-4 text-sm">
              <span className="flex items-center gap-1"><Video className="h-4 w-4" />Online: {d.online ? "Available" : "Not offered"}</span>
              <span className="flex items-center gap-1"><Building2 className="h-4 w-4" />In-clinic: {d.clinic ? "Available" : "Not offered"}</span>
            </div>
          </div>
          <Button variant="secondary" size="lg" asChild><Link to="/patient/book/$doctorId" params={{ doctorId: id }}>Book Appointment</Link></Button>
        </div>
      </div>
      <ProviderActions providerId={id} name={u.name} doctor /><DoctorBranches doctorId={id} />
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border bg-card p-5">
            <h2 className="text-lg font-semibold">About</h2>
            <p className="mt-2 text-sm text-muted-foreground">{d.about || "No description yet."}</p>
            {d.services.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{d.services.map((x) => <span key={x} className="rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">{x}</span>)}</div>}
          </div>
          <div className="space-y-3 rounded-2xl border bg-card p-5">
            {facts.map((f) => <div key={f.label} className="flex gap-3 text-sm"><f.icon className="mt-0.5 h-4 w-4 text-primary" /><div><p className="text-muted-foreground">{f.label}</p><p className="font-medium">{f.v}</p></div></div>)}
            {av && <div className="space-y-2 border-t pt-3 text-sm">{DAYS.map((day, i) => { const shifts = weekdayShifts(av, i); return shifts.length ? <div key={day} className="flex flex-wrap justify-between gap-2"><span className="text-muted-foreground">{day}</span><span>{shifts.map((s) => `${fmtTime(s.start)}–${fmtTime(s.end)}`).join(" / ")}</span></div> : null; })}</div>}
          </div>
          <ReviewList doctorId={id} />
          <section className="mt-6 space-y-3"><h2 className="font-display text-xl font-semibold">Posts & videos</h2><FeedTabs authorId={id} /></section>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <h2 className="mb-4 text-lg font-semibold">Available dates</h2>
          <BookingDatePicker doctorId={id} date={date} onDate={setDate} />
          <Button className="mt-5 w-full" disabled={!allocation} asChild={!!allocation}>
            {allocation ? <Link to="/patient/book/$doctorId" params={{ doctorId: id }} search={{ date }}>Book {date}</Link> : <span>No places available</span>}
          </Button>
        </div>
      </div>
    </div>
  );
}
