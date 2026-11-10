import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LabOrderCard } from "@/components/app/LabOrderCard";
import { createLabOrder, useStore } from "@/lib/store";

/** Doctor sends the recommended tests to a laboratory for this appointment. */
export function DoctorLabOrder({ appointmentId, tests }: { appointmentId: string; tests: string }) {
  const labs = useStore((s) => s.labs);
  const orders = useStore((s) => s.labOrders.filter((o) => o.appointmentId === appointmentId));
  const [lab, setLab] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try { await createLabOrder({ labId: lab, appointmentId, tests, date }); toast.success("Sent to laboratory"); setLab(""); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="mt-2 space-y-2">
      {labs.length === 0 ? <p className="text-xs text-muted-foreground">No laboratories registered yet.</p> : (
        <div className="flex flex-wrap gap-2">
          <Select value={lab} onValueChange={setLab}><SelectTrigger className="w-56"><SelectValue placeholder="Choose laboratory" /></SelectTrigger>
            <SelectContent>{labs.map((l) => <SelectItem key={l.userId} value={l.userId}>{l.labName} — {l.city}</SelectItem>)}</SelectContent></Select>
          <Input type="date" className="w-40" value={date} onChange={(e) => setDate(e.target.value)} />
          <Button type="button" variant="outline" disabled={busy || !lab || !tests.trim()} onClick={send}>Send to lab</Button>
        </div>
      )}
      {orders.map((o) => <LabOrderCard key={o.id} o={o} />)}
    </div>
  );
}
