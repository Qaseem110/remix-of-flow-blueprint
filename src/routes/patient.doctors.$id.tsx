import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Building2, GraduationCap, Languages, MapPin, Video, Wallet, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/app/common";
import { SlotPicker } from "@/components/app/widgets";
import { nextAvailableDate, todayStr, useStore } from "@/lib/store";
import { meta } from "@/lib/meta";
import { RatingSummary, ReviewList } from "@/components/app/Reviews";
import { fmtTime } from "@/lib/utils";

export const Route = createFileRoute("/patient/doctors/$id")({
  head: () => meta("Doctor profile", "Doctor details, fees, languages and available slots."),
  component: DoctorProfile,
});

function DoctorProfile() {
  const { id } = Route.useParams();
  const u = useStore((s) => s.users.find((x) => x.id === id));
  const d = useStore((s) => s.doctors.find((x) => x.userId === id));
  const av = useStore((s) => s.availability.find((x) => x.doctorId === id));
  const [date, setDate] = useState(() => nextAvailableDate(id) ?? todayStr());
  const [time, setTime] = useState("");
  if (!u || !d) return <p>Doctor not found.</p>;
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const facts = [
    { icon: GraduationCap, label: "Qualification", v: d.qualification },
    { icon: Briefcase, label: "Experience", v: `${d.experience} years` },
    { icon: Wallet, label: "Consultation fee", v: `${d.fee} LYD` },
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
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border bg-card p-5">
            <h2 className="text-lg font-semibold">About</h2>
            <p className="mt-2 text-sm text-muted-foreground">{d.about || "No description yet."}</p>
            {d.services.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{d.services.map((x) => <span key={x} className="rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">{x}</span>)}</div>}
          </div>
          <div className="space-y-3 rounded-2xl border bg-card p-5">
            {facts.map((f) => <div key={f.label} className="flex gap-3 text-sm"><f.icon className="mt-0.5 h-4 w-4 text-primary" /><div><p className="text-muted-foreground">{f.label}</p><p className="font-medium">{f.v}</p></div></div>)}
            {av && <p className="border-t pt-3 text-sm text-muted-foreground">Works {av.days.sort().map((x) => DAYS[x]).join(", ")} · {fmtTime(av.start)}–{fmtTime(av.end)} · {av.duration}-min visits</p>}
          </div>
          <ReviewList doctorId={id} />
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <h2 className="mb-4 text-lg font-semibold">Available slots</h2>
          <SlotPicker doctorId={id} date={date} time={time} onDate={setDate} onTime={setTime} />
          <Button className="mt-5 w-full" disabled={!time} asChild={!!time}>
            {time ? <Link to="/patient/book/$doctorId" params={{ doctorId: id }} search={{ date, time }}>Book {date} at {time}</Link> : <span>Select a slot</span>}
          </Button>
        </div>
      </div>
    </div>
  );
}
