import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/app/common";
import { LabOrderCard } from "@/components/app/LabOrderCard";
import { LabDiscussion } from "@/components/app/LabDiscussion";
import { useSession, useStore, type LabOrder } from "@/lib/store";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/doctor/labs")({
  head: () => meta("Lab reports", "Lab tests you prescribed and their reports."),
  component: DoctorLabs,
});

function DoctorLabs() {
  const user = useSession();
  const s = useStore((x) => x);
  const [q, setQ] = useState("");
  if (!user) return null;
  const name = (o: LabOrder) => o.memberName ?? s.users.find((u) => u.id === o.patientId)?.name ?? "";
  const orders = s.labOrders.filter((o) => o.doctorId === user.id && (!q || `${name(o)} ${o.tests} ${o.id}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt));
  const ready = orders.filter((o) => o.documents.length > 0);
  const pending = orders.filter((o) => o.documents.length === 0 && o.status !== "Cancelled");
  const list = (xs: LabOrder[], empty: string) => xs.length ? xs.map((o) => <LabOrderCard key={o.id} o={o}><LabDiscussion orderId={o.id} /></LabOrderCard>) : <p className="text-muted-foreground">{empty}</p>;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Lab reports" subtitle="Reports for tests you prescribed. Discuss results with your patient below each report." />
      <Input className="mb-4" placeholder="Search patient, test or ID" value={q} onChange={(e) => setQ(e.target.value)} />
      <Tabs defaultValue="ready">
        <TabsList><TabsTrigger value="ready">Reports ready ({ready.length})</TabsTrigger><TabsTrigger value="pending">Awaiting lab ({pending.length})</TabsTrigger></TabsList>
        <TabsContent value="ready" className="space-y-3">{list(ready, "No lab reports yet.")}</TabsContent>
        <TabsContent value="pending" className="space-y-3">{list(pending, "No pending lab tests.")}</TabsContent>
      </Tabs>
    </div>
  );
}
