import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@tanstack/react-router";
import { clinicAvailability, dailyCapacity, scheduleShifts, weekdayShifts, persistAvailability, todayStr, useStore } from "@/lib/store";

export function DailyCapacity({ doctorId, clinicId }: { doctorId: string; clinicId?: string }) {
  const av = useStore((s) => clinicAvailability(doctorId,clinicId,s));
  const [limit, setLimit] = useState<string | null>(null);
  if (!av) return null;
  const date = todayStr();
  const shifts = scheduleShifts(av, date);
  const save = async () => {
    try {
      if (shifts.length !== 1) return;
      const weeklyShifts = av.weeklyShifts ?? Object.fromEntries(Array.from({ length: 7 }, (_, i) => [String(i), weekdayShifts(av, i)]));
      await persistAvailability({ ...av, weeklyShifts, dateOverrides: { ...av.dateOverrides, [date]: [{ ...shifts[0], capacity: Number(limit ?? dailyCapacity(av, date)) }] } });
      setLimit(null);
      toast.success("Daily patient limit saved");
    } catch (error) { toast.error((error as Error).message); }
  };
  return (
    <section className="mb-6 flex flex-wrap items-end gap-3 border-b pb-5">
      <div>
        <Label htmlFor="daily-patients">Today's patient limit</Label>
        <Input id="daily-patients" type="number" min={1} step={1} disabled={shifts.length !== 1} value={limit ?? dailyCapacity(av, date)} onChange={(e) => setLimit(e.target.value)} className="mt-1 w-36" />
      </div>
      {shifts.length === 1 && <Button onClick={save} disabled={limit === null}>Save today's limit</Button>}
      <Button variant="outline" asChild><Link to="/doctor/availability">Customize shifts</Link></Button>
    </section>
  );
}