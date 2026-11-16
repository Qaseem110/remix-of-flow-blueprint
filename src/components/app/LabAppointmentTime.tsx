import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getLabSlots, useStore } from "@/lib/store";
import { clinicDate } from "@/lib/appointment-lifecycle";
import { fmtTime } from "@/lib/utils";

export function LabAppointmentTime({ labId, date, time, onDate, onTime, excludeId }: { labId: string; date: string; time: string; onDate: (s: string) => void; onTime: (s: string) => void; excludeId?: string }) {
  const schedule = useStore((s) => s.labs.find((l) => l.userId === labId)?.schedule);
  const orders = useStore((s) => s.labOrders);
  const [slots, setSlots] = useState<{ time: string; available: boolean }[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let alive = true;
    setSlots([]);
    if (!date || !labId || !schedule) return;
    setLoading(true);
    getLabSlots(labId, date, excludeId).then((s) => { if (alive) setSlots(s); }, (e: Error) => { if (alive) toast.error(e.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [labId, date, schedule, orders, excludeId]);
  return <>
    <div><Label>Test appointment date</Label><Input aria-label="Test appointment date" type="date" min={clinicDate()} value={date} onChange={(e) => { onDate(e.target.value); onTime(""); }} /></div>
    <div><Label>Test appointment time</Label><Select value={time} onValueChange={onTime} disabled={loading || !date || !schedule}><SelectTrigger aria-label="Test appointment time"><SelectValue placeholder={loading ? "Checking times…" : "Choose available time"} /></SelectTrigger><SelectContent>{slots.filter((s) => s.available).map((s) => <SelectItem key={s.time} value={s.time}>{fmtTime(s.time)}</SelectItem>)}</SelectContent></Select>
      {!schedule ? <p className="mt-1 text-xs text-muted-foreground">Availability not set by this laboratory.</p> : date && !loading && !slots.some((s) => s.available) ? <p className="mt-1 text-xs text-muted-foreground">No available times on this date.</p> : null}
    </div>
  </>;
}