import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { kioskCheckIn, kioskQueueStatus, useStore, type KioskQueue } from "@/lib/store";

/** Clinic check-in and live queue position; shared by the homepage and /checkin. */
export function QueueTracker() {
  const methods = useStore((s) => s.settings.checkInMethods);
  const [value, setValue] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [q, setQ] = useState<KioskQueue | null>(null);
  useEffect(() => {
    if (!done) { setQ(null); return; }
    let live = true;
    const load = () => kioskQueueStatus(done).then((r) => { if (live) setQ(r); }).catch(() => {});
    void load();
    const t = setInterval(load, 15_000);
    return () => { live = false; clearInterval(t); };
  }, [done]);

  const submit = (method: "appointmentId" | "phone") => async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await kioskCheckIn(method, value);
      setValue("");
      setDone(r.id); toast.success("Checked in. Please wait to be called.");
    } catch (err) { toast.error((err as Error).message); }
  };

  if (done && q) return (
    <div className="text-center">
      <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
      <p className="mt-2 text-muted-foreground">You're checked in{q.doctorName ? ` with ${q.doctorName}` : ""}. This updates automatically.</p>
      <p className="mt-6 text-sm uppercase tracking-widest text-muted-foreground">Your queue number</p>
      <p className="font-display text-8xl font-semibold text-primary">{q.myNumber}</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-muted p-3"><p className="text-xs text-muted-foreground">Now serving</p><p className="font-display text-2xl">{q.currentNumber || "—"}</p></div>
        <div className="rounded-xl bg-muted p-3"><p className="text-xs text-muted-foreground">Ahead of you</p><p className="font-display text-2xl">{q.ahead}</p></div>
      </div>
      {q.status === "Ready to Join" || q.status === "In Consultation" ? <p className="mt-4 rounded-xl bg-secondary p-3 font-semibold text-success">It's your turn — please go in.</p> : null}
      <Button variant="outline" className="mt-6" onClick={() => setDone(null)}>Check in another patient</Button>
    </div>
  );
  return (
    <Tabs defaultValue={methods.appointmentId ? "appointmentId" : "phone"}>
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="appointmentId" disabled={!methods.appointmentId}>Tracking number</TabsTrigger>
        <TabsTrigger value="phone" disabled={!methods.phone}>Phone number</TabsTrigger>
      </TabsList>
      <TabsContent value="appointmentId"><form onSubmit={submit("appointmentId")} className="mt-4 space-y-3"><Input inputMode="numeric" pattern="[0-9]+" placeholder="e.g. 100001" value={value} onChange={(e) => setValue(e.target.value)} required className="h-12 text-lg" /><Button className="w-full" size="lg">Check in</Button></form></TabsContent>
      <TabsContent value="phone"><form onSubmit={submit("phone")} className="mt-4 space-y-3"><Input type="tel" placeholder="+2189..." value={value} onChange={(e) => setValue(e.target.value)} required className="h-12 text-lg" /><Button className="w-full" size="lg">Check in</Button></form></TabsContent>
    </Tabs>
  );
}
