import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, StatusBadge, TypeBadge, Stat } from "@/components/app/common";
import { CancelDialog } from "@/components/app/widgets";
import { ALL_STATUSES, slotDateTime, useStore } from "@/lib/store";
import { meta } from "@/lib/meta";
import { fmtTime } from "@/lib/utils";

export const Route = createFileRoute("/admin/appointments")({
  head: () => meta("Appointments overview", "System-wide appointment overview with filters."),
  component: AdminAppts,
});

function AdminAppts() {
  const s = useStore((s) => s);
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("all");
  const [doc, setDoc] = useState("all");
  const list = s.appointments.filter((a) => (!date || a.date === date) && (status === "all" || a.status === status) && (doc === "all" || a.doctorId === doc)).sort((a, b) => slotDateTime(b).getTime() - slotDateTime(a).getTime());
  const name = (id: string) => s.users.find((u) => u.id === id)?.name;
  const count = (st: string) => s.appointments.filter((a) => a.status === st).length;
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Appointments overview" />
      <div className="mb-6 grid gap-3 sm:grid-cols-5">
        {["Confirmed", "Checked-In", "In Consultation", "Completed", "Cancelled"].map((st) => <Stat key={st} label={st} value={count(st)} />)}
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{ALL_STATUSES.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select>
        <Select value={doc} onValueChange={setDoc}><SelectTrigger className="w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All doctors</SelectItem>{s.doctors.map((d) => <SelectItem key={d.userId} value={d.userId}>{name(d.userId)}</SelectItem>)}</SelectContent></Select>
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground"><tr>{["ID", "Date", "Time", "Doctor", "Patient", "Type", "Status", ""].map((h) => <th key={h} className="p-3">{h}</th>)}</tr></thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="p-3 font-medium">{a.id}</td><td className="p-3">{a.date}</td><td className="p-3">{fmtTime(a.time)}</td><td className="p-3">{name(a.doctorId)}</td><td className="p-3">{name(a.patientId)}</td>
                <td className="p-3"><TypeBadge type={a.type} /></td><td className="p-3"><StatusBadge status={a.status} /></td>
                <td className="p-3 text-right">{["Confirmed", "Pending", "Checked-In", "Waiting"].includes(a.status) && <CancelDialog appt={a} by="admin" trigger={<Button size="sm" variant="ghost" className="text-destructive">Cancel</Button>} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
