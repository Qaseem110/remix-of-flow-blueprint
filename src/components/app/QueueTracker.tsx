import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Clock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { lookupQueue, type KioskQueue } from "@/lib/store";
import { fmtTime } from "@/lib/utils";

type Found = KioskQueue & { date?: string; time?: string };

/** Live queue status lookup (no check-in — arrival is marked by the doctor or receptionist). */
export function QueueTracker() {
  const [value, setValue] = useState("");
  const [key, setKey] = useState<{ method: "appointmentId"; value: string } | null>(null);
  const [q, setQ] = useState<Found | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!key) { setQ(null); return; }
    let live = true;
    const load = () => lookupQueue(key.method, key.value).then((r) => { if (live) setQ(r); }).catch((e: Error) => { if (live) { toast.error(e.message); setKey(null); } });
    void load();
    const t = setInterval(load, 15_000);
    return () => { live = false; clearInterval(t); };
  }, [key]);

  const submit = (method: "appointmentId") => async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setKey({ method, value: value.trim() }); setBusy(false);
  };

  if (key && q) {
    const turn = q.status === "Ready to Join" || q.status === "In Consultation";
    return (
      <div className="text-center">
        <p className="text-sm text-muted-foreground">{q.doctorName ? `Dr. ${q.doctorName.replace(/^Dr\.?\s*/i, "")}` : "Your appointment"}{q.date ? ` · ${q.date}` : ""}{q.time ? ` · ${fmtTime(q.time)}` : ""}</p>
        <p className="mt-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Your queue number</p>
        <p className="font-display text-7xl font-bold text-primary">{q.myNumber}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-muted p-3"><p className="flex items-center justify-center gap-1 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" />Now serving</p><p className="font-display text-2xl font-bold">{q.currentNumber || "—"}</p></div>
          <div className="rounded-xl bg-muted p-3"><p className="flex items-center justify-center gap-1 text-xs text-muted-foreground"><Users className="h-3.5 w-3.5" />Ahead of you</p><p className="font-display text-2xl font-bold">{q.ahead}</p></div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Status: {q.status} · updates every 15 seconds</p>
        {turn && <p className="mt-3 rounded-xl bg-secondary p-3 font-semibold text-success">It's your turn — please go in.</p>}
        <Button variant="outline" className="mt-5" onClick={() => { setKey(null); setValue(""); }}>Track another appointment</Button>
      </div>
    );
  }
  return (
    <form onSubmit={submit("appointmentId")} className="space-y-3"><Input aria-label="Tracking number" inputMode="numeric" pattern="[0-9]+" placeholder="Tracking number, e.g. 100001" value={value} onChange={(e) => setValue(e.target.value)} required className="h-12 text-lg" /><Button className="w-full" size="lg" disabled={busy || (!!key && !q)}>{key && !q ? "Loading…" : "Show my queue status"}</Button></form>
  );
}
