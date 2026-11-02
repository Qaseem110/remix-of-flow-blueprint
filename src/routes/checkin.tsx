import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { kioskCheckIn, queueInfo, userById, useStore, type Appointment } from "@/lib/store";

export const Route = createFileRoute("/checkin")({
  head: () => ({ meta: [{ title: "Clinic check-in — Sahoolat" }, { name: "description", content: "Check in at the clinic with your appointment ID or phone number." }, { property: "og:title", content: "Clinic check-in — Sahoolat" }, { property: "og:description", content: "Arrived at the clinic? Check in here." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: CheckIn,
});

function CheckIn() {
  const methods = useStore((s) => s.settings.checkInMethods);
  const [value, setValue] = useState("");
  const [done, setDone] = useState<Appointment | null>(null);
  const q = useStore(() => (done ? queueInfo(done.id) : null));

  const submit = (method: "appointmentId" | "phone") => async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await kioskCheckIn(method, value);
      setValue("");
      if (r.appointment) setDone(r.appointment); else toast.success(`Checked in — ${r.id}. Please wait to be called.`);
    } catch (err) { toast.error((err as Error).message); }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-hero p-6">
      <div className="w-full max-w-md rounded-3xl bg-card p-8 shadow-soft">
        <Link to="/" className="flex items-center gap-2 font-display text-xl font-semibold"><Stethoscope className="h-6 w-6 text-primary" /> Clinic check-in</Link>
        {done && q ? (
          <div className="mt-6 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
            <p className="mt-2 text-muted-foreground">{userById(done.patientId)?.name}, you're checked in with {userById(done.doctorId)?.name}</p>
            <p className="mt-6 text-sm uppercase tracking-widest text-muted-foreground">Your queue number</p>
            <p className="font-display text-8xl font-semibold text-primary">{q.myNumber}</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-muted p-3"><p className="text-xs text-muted-foreground">Now serving</p><p className="font-display text-2xl">{q.currentNumber || "—"}</p></div>
              <div className="rounded-xl bg-muted p-3"><p className="text-xs text-muted-foreground">Ahead of you</p><p className="font-display text-2xl">{q.ahead}</p></div>
            </div>
            <Button variant="outline" className="mt-6" onClick={() => setDone(null)}>Check in another patient</Button>
          </div>
        ) : (
          <Tabs defaultValue={methods.appointmentId ? "appointmentId" : "phone"} className="mt-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="appointmentId" disabled={!methods.appointmentId}>Appointment ID</TabsTrigger>
              <TabsTrigger value="phone" disabled={!methods.phone}>Phone number</TabsTrigger>
            </TabsList>
            <TabsContent value="appointmentId"><form onSubmit={submit("appointmentId")} className="mt-4 space-y-3"><Input placeholder="e.g. APT-1004" value={value} onChange={(e) => setValue(e.target.value)} required className="h-12 text-lg" /><Button className="w-full" size="lg">Check in</Button></form></TabsContent>
            <TabsContent value="phone"><form onSubmit={submit("phone")} className="mt-4 space-y-3"><Input type="tel" placeholder="+2189..." value={value} onChange={(e) => setValue(e.target.value)} required className="h-12 text-lg" /><Button className="w-full" size="lg">Check in</Button></form></TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
