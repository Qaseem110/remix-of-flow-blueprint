import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtTime } from "@/lib/utils";
import type { Shift } from "@/lib/schedule";

export function ShiftEditor({ shifts, onChange, id }: { shifts: Shift[]; onChange: (shifts: Shift[]) => void; id: string }) {
  const change = (i: number, patch: Partial<Shift>) => onChange(shifts.map((s, index) => index === i ? { ...s, ...patch } : s));
  const add = () => {
    const last = shifts[shifts.length - 1];
    const start = last?.end ?? "09:00";
    const hour = Math.min(23, Number(start.slice(0, 2)) + 2);
    onChange([...shifts, { start, end: `${String(hour).padStart(2, "0")}:59`, capacity: 10 }]);
  };
  return (
    <div className="space-y-3">
      {shifts.map((shift, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr] items-end gap-3 sm:grid-cols-[1fr_1fr_100px_36px]">
          <div className="min-w-0"><Label htmlFor={`${id}-${i}-start`}>Start · {fmtTime(shift.start)}</Label><Input id={`${id}-${i}-start`} type="time" value={shift.start} onChange={(e) => change(i, { start: e.target.value })} className="mt-1 min-w-0" /></div>
          <div className="min-w-0"><Label htmlFor={`${id}-${i}-end`}>End · {fmtTime(shift.end)}</Label><Input id={`${id}-${i}-end`} type="time" value={shift.end} onChange={(e) => change(i, { end: e.target.value })} className="mt-1 min-w-0" /></div>
          <div><Label htmlFor={`${id}-${i}-capacity`}>Patients</Label><Input id={`${id}-${i}-capacity`} type="number" min={1} step={1} value={Number.isNaN(shift.capacity) ? "" : shift.capacity} onChange={(e) => change(i, { capacity: Number(e.target.value) })} className="mt-1" /></div>
          <Button type="button" size="icon" variant="ghost" aria-label={`Remove shift ${i + 1}`} title={`Remove shift ${i + 1}`} onClick={() => onChange(shifts.filter((_, index) => index !== i))}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ))}
      {shifts.length === 0 && <p className="text-sm text-muted-foreground">Day off</p>}
      <Button type="button" size="sm" variant="outline" onClick={add}><Plus className="mr-1 h-4 w-4" />Add shift</Button>
    </div>
  );
}