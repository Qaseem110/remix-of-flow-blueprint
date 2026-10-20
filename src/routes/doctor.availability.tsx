import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/app/common";
import { BlockSlots } from "@/components/app/BlockSlots";
import { saveAvailability, todayStr, updateDoctorProfile, useSession, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/doctor/availability")({
  head: () => meta("Availability", "Set working days, hours, appointment duration and consultation types."),
  component: Availability,
});

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DURATIONS = [15, 20, 30, 45, 60];

function Availability() {
  const user = useSession()!;
  const av = useStore((s) => s.availability.find((a) => a.doctorId === user.id))!;
  const dp = useStore((s) => s.doctors.find((d) => d.userId === user.id))!;
  const [days, setDays] = useState(av.days);
  const [start, setStart] = useState(av.start);
  const [end, setEnd] = useState(av.end);
  const [duration, setDuration] = useState(av.duration);
  const [pDate, setPDate] = useState(todayStr());
  const save = () => {
    if (start >= end) return toast.error("End time must be after start time");
    if (!days.length) return toast.error("Pick at least one working day");
    saveAvailability({ doctorId: user.id, days, start, end, duration });
    toast.success("Availability saved — slots regenerated");
  };
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Availability & consultation settings" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6 rounded-2xl border bg-card p-6 shadow-soft">
          <div>
            <Label>Working days</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {DAYS.map((d, i) => <button key={d} type="button" onClick={() => setDays(days.includes(i) ? days.filter((x) => x !== i) : [...days, i])} className={cn("h-10 w-12 rounded-lg border text-sm font-medium", days.includes(i) ? "border-primary bg-primary text-primary-foreground" : "bg-card")}>{d}</button>)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="st">Start time</Label><Input id="st" type="time" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div><Label htmlFor="en">End time</Label><Input id="en" type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
          <div>
            <Label>Appointment duration</Label>
            <div className="mt-2 flex flex-wrap gap-2">{DURATIONS.map((d) => <button key={d} type="button" onClick={() => setDuration(d)} className={cn("rounded-lg border px-4 py-2 text-sm", duration === d ? "border-primary bg-primary text-primary-foreground" : "bg-card")}>{d} min</button>)}</div>
          </div>
          <Button onClick={save} className="w-full">Save availability</Button>
          <div className="space-y-3 border-t pt-4">
            <label className="flex items-center justify-between text-sm"><span>Online consultations</span><Switch checked={dp.online} onCheckedChange={(v) => updateDoctorProfile(user.id, { online: v })} /></label>
            <label className="flex items-center justify-between text-sm"><span>In-clinic consultations</span><Switch checked={dp.clinic} onCheckedChange={(v) => updateDoctorProfile(user.id, { clinic: v })} /></label>
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-6">
          <h2 className="mb-1 text-lg font-semibold">Mark times unavailable</h2>
          <p className="mb-4 text-sm text-muted-foreground">Busy, on leave or in surgery? Block a time or a whole day so patients can't book it.</p>
          <BlockSlots doctorId={user.id} date={pDate} onDate={setPDate} />
        </div>
      </div>
    </div>
  );
}
