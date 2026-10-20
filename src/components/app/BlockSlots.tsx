import { addDays, format, parse } from "date-fns";
import { toast } from "sonner";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSlots, toggleBlockedDay, toggleBlockedSlot, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function BlockSlots({ doctorId, date, onDate }: { doctorId: string; date: string; onDate: (d: string) => void }) {
  const slots = useStore((s) => getSlots(doctorId, date, s));
  const dayOff = useStore((s) => s.availability.find((a) => a.doctorId === doctorId)?.blockedDays?.includes(date) ?? false);
  const days = Array.from({ length: 7 }, (_, i) => format(addDays(new Date(), i), "yyyy-MM-dd"));
  const toggle = (time: string) => {
    try { toggleBlockedSlot(doctorId, date, time); } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {days.map((d) => (
          <button key={d} type="button" onClick={() => onDate(d)} className={cn("rounded-lg border px-3 py-1.5 text-xs", d === date ? "border-primary bg-primary text-primary-foreground" : "bg-card")}>
            {format(parse(d, "yyyy-MM-dd", new Date()), "EEE d")}
          </button>
        ))}
        <Input type="date" value={date} onChange={(e) => e.target.value && onDate(e.target.value)} className="h-8 w-40" />
      </div>
      {slots.length === 0 ? (
        <p className="text-sm text-muted-foreground">Not a working day.</p>
      ) : (
        <>
          <Button size="sm" variant={dayOff ? "secondary" : "outline"} className="mb-3" onClick={() => { toggleBlockedDay(doctorId, date); toast.success(dayOff ? "Day is open again" : "Whole day marked unavailable"); }}>
            <Ban className="mr-1 h-4 w-4" />{dayOff ? "Make this day available" : "Mark whole day unavailable"}
          </Button>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((s) => (
              <button key={s.time} type="button" disabled={dayOff || s.booked} onClick={() => toggle(s.time)}
                className={cn("rounded-lg border px-2 py-2 text-sm",
                  s.booked ? "cursor-not-allowed bg-muted text-muted-foreground line-through" :
                  s.blocked ? "border-destructive bg-destructive/10 text-destructive" : "hover:border-primary")}>
                {s.time}<span className="block text-[10px]">{s.booked ? "Booked" : s.blocked ? "Unavailable" : "Open"}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Tap a time to mark it unavailable. Patients can't book unavailable times. Tap again to reopen.</p>
        </>
      )}
    </div>
  );
}
