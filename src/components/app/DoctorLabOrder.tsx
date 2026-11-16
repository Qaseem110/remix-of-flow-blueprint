import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LabAppointmentTime } from "@/components/app/LabAppointmentTime";
import { clinicDate } from "@/lib/appointment-lifecycle";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LabOrderCard } from "@/components/app/LabOrderCard";
import { createLabOrder, useStore } from "@/lib/store";

/** Doctor sends the recommended tests to a laboratory for this appointment. */
export function DoctorLabOrder({ appointmentId, tests }: { appointmentId: string; tests: string }) {
  const labs = useStore((s) => s.labs);
  const orders = useStore((s) => s.labOrders.filter((o) => o.appointmentId === appointmentId));
  const [lab, setLab] = useState("");
  const [date, setDate] = useState(clinicDate());
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try { await createLabOrder({ labId: lab, appointmentId, tests, date, time }); toast.success("Sent to laboratory"); setLab(""); setTime(""); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="mt-2 space-y-2">
      {labs.length === 0 ? <p className="text-xs text-muted-foreground">No laboratories registered yet.</p> : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Select value={lab} onValueChange={(v) => { setLab(v); setTime(""); }}><SelectTrigger><SelectValue placeholder="Choose laboratory" /></SelectTrigger>
            <SelectContent>{labs.map((l) => <SelectItem key={l.userId} value={l.userId}>{l.labName} — {l.city}</SelectItem>)}</SelectContent></Select>
          <LabAppointmentTime labId={lab} date={date} time={time} onDate={setDate} onTime={setTime} />
          <Button type="button" variant="outline" disabled={busy || !lab || !tests.trim() || !time} onClick={send}>Send to lab</Button>
        </div>
      )}
      {orders.map((o) => <LabOrderCard key={o.id} o={o} />)}
    </div>
  );
}
