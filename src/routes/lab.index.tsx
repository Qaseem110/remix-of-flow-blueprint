import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/app/common";
import { LabOrderCard } from "@/components/app/LabOrderCard";
import { LabAppointmentTime } from "@/components/app/LabAppointmentTime";
import { scheduleLabOrder, setLabOrderStatus, uploadLabResults, useSession, useStore, type LabOrder } from "@/lib/store";
import { meta } from "@/lib/meta";
import { LabProgress } from "@/components/app/LabProgress";

export const Route = createFileRoute("/lab/")({
  head: () => meta("Test requests", "Lab test requests from doctors and patients."),
  component: LabHome,
});

function LabHome() {
  const user = useSession();
  const orders = useStore((s) => s.labOrders.filter((o) => o.labId === user?.id)).sort((a, b) => `${a.date} ${a.time ?? ""}`.localeCompare(`${b.date} ${b.time ?? ""}`));
  const allowed = useStore((s) => s.settings.allowedFileTypes);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const run = async (id: string, fn: () => Promise<void>, ok: string) => {
    setBusy(id);
    try { await fn(); toast.success(ok); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const open = orders.filter((o) => o.status === "Requested" || o.status === "Sample collected");
  const done = orders.filter((o) => ["Completed", "Cancelled", "Expired"].includes(o.status));
  const card = (o: LabOrder) => (
    <LabOrderCard key={o.id} o={o}>
      {!['Cancelled','Expired'].includes(o.status) && <LabProgress order={o} />}
      {o.status === "Requested" && <Button size="sm" variant="outline" onClick={() => { setEditing(o.id); setDate(o.date); setTime(""); }}>{o.time ? "Change date / time" : "Set date / time"}</Button>}
      {editing === o.id && <div className="grid w-full gap-3 sm:grid-cols-2"><LabAppointmentTime labId={o.labId} date={date} time={time} onDate={setDate} onTime={setTime} excludeId={o.id} /><div className="flex gap-2"><Button disabled={!time || busy === o.id} onClick={() => run(o.id, async () => { await scheduleLabOrder(o.id, date, time); setEditing(null); }, "Appointment time sent to patient")}>Save time</Button><Button variant="ghost" onClick={() => setEditing(null)}>Close</Button></div></div>}
      {o.status === "Requested" && <Button size="sm" variant="outline" disabled={busy === o.id} onClick={() => run(o.id, () => setLabOrderStatus(o.id, "Sample collected"), "Marked as sample collected")}>Sample collected</Button>}
      {!["Cancelled", "Expired"].includes(o.status) && (
        <label className={`inline-flex cursor-pointer items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground ${busy === o.id ? "pointer-events-none opacity-60" : ""}`}>
          <Upload className="h-4 w-4" />{o.documents.length ? "Upload more" : "Upload report"}
          <input type="file" multiple className="hidden" accept={allowed.map((x) => "." + x).join(",")} onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) void run(o.id, () => uploadLabResults(o.id, f, o.documents.length ? o.documents[o.documents.length - 1]?.id : undefined), "Report sent to the patient"); }} />
        </label>
      )}
    </LabOrderCard>
  );
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Test requests" subtitle="Tests prescribed by doctors. Uploaded reports go straight to the patient's health records and cannot be deleted." />
      <Button asChild variant="outline" className="mb-5"><Link to="/lab/availability">Set availability</Link></Button>
      <Tabs defaultValue="open">
        <TabsList><TabsTrigger value="open">Pending ({open.length})</TabsTrigger><TabsTrigger value="done">History ({done.length})</TabsTrigger></TabsList>
        <TabsContent value="open" className="space-y-3">{open.length ? open.map(card) : <p className="text-muted-foreground">No pending test requests.</p>}</TabsContent>
        <TabsContent value="done" className="space-y-3">{done.length ? done.map(card) : <p className="text-muted-foreground">Nothing completed yet.</p>}</TabsContent>
      </Tabs>
    </div>
  );
}
