import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dailyCapacity, saveAvailability, useStore } from "@/lib/store";

export function DailyCapacity({ doctorId }: { doctorId: string }) {
  const av = useStore((s) => s.availability.find((a) => a.doctorId === doctorId));
  const [limit, setLimit] = useState<string | null>(null);
  if (!av) return null;
  const save = () => {
    try {
      saveAvailability({ ...av, dailyLimit: Number(limit ?? dailyCapacity(av)) });
      setLimit(null);
      toast.success("Daily patient limit saved");
    } catch (error) { toast.error((error as Error).message); }
  };
  return (
    <section className="mb-6 flex flex-wrap items-end gap-3 border-b pb-5">
      <div>
        <Label htmlFor="daily-patients">Patients per day</Label>
        <Input id="daily-patients" type="number" min={1} step={1} value={limit ?? dailyCapacity(av)} onChange={(e) => setLimit(e.target.value)} className="mt-1 w-36" />
      </div>
      <Button onClick={save} disabled={limit === null}>Save daily limit</Button>
    </section>
  );
}