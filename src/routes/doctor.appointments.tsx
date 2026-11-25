import { ClinicSelect } from "@/components/app/ClinicSelect";
import { trackingNumber } from "@/lib/store";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, StatusBadge, TypeBadge } from "@/components/app/common";
import { CancelDialog } from "@/components/app/widgets";
import { ALL_STATUSES, markNoShow, slotDateTime, useSession, useStore } from "@/lib/store";
import { meta } from "@/lib/meta";
import { fmtTime } from "@/lib/utils";

export const Route = createFileRoute("/doctor/appointments")({
  head: () => meta("Appointments", "All your appointments with filters by date and status."),
  component: DoctorAppointments,
});

function DoctorAppointments() {
  const user = useSession();
  const s = useStore((s) => s);
  const [clinicId, setClinicId] = useState("all");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("all");
  if (!user) return null;
  const list = s.appointments
    .filter((a) => a.doctorId === user.id && (clinicId === "all" || (a.clinicId ?? "") === clinicId) && (!date || a.date === date) && (status === "all" || a.status === status))
    .sort((a, b) => slotDateTime(a).getTime() - slotDateTime(b).getTime());
  const name = (id: string, apptId?: string) => s.appointments.find((a) => a.id === apptId)?.memberName ?? s.users.find((u) => u.id === id)?.name;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Appointments" actions={
        <div className="flex gap-2">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
          <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{ALL_STATUSES.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select>
        </div>} />
      <div className="mb-4"><Button variant={clinicId==="all"?"default":"outline"} onClick={()=>setClinicId("all")}>All clinics</Button><ClinicSelect doctorId={user.id} value={clinicId==="all"?"":clinicId} onChange={setClinicId}/></div>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground"><tr>{["ID", "Clinic", "Date", "Time", "Queue", "Patient", "Type", "Reason", "Status", ""].map((h) => <th key={h} className="p-3">{h}</th>)}</tr></thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="p-3 font-medium">{trackingNumber(a)}</td><td className="p-3">{a.clinicName ?? s.doctors.find(d=>d.userId===user.id)?.clinicName ?? "Main clinic"}</td><td className="p-3">{a.date}</td><td className="p-3">{fmtTime(a.time)}</td><td className="p-3">#{a.queueNumber}</td>
                <td className="p-3"><Link className="text-primary" to="/doctor/patients/$id" params={{ id: a.patientId }}>{name(a.patientId, a.id)}</Link></td>
                <td className="p-3"><TypeBadge type={a.type} /></td><td className="max-w-48 truncate p-3">{a.reason}</td><td className="p-3"><StatusBadge status={a.status} /></td>
                <td className="whitespace-nowrap p-3 text-right">
                  {!["Cancelled", "Rescheduled", "No Show", "Expired"].includes(a.status) && <Button size="sm" variant="outline" asChild><Link to="/doctor/consultation/$id" params={{ id: a.id }}>{a.status === "Completed" ? "Record" : "Open"}</Link></Button>}
                  {["Confirmed", "Pending"].includes(a.status) && <CancelDialog appt={a} by="doctor" trigger={<Button size="sm" variant="ghost" className="text-destructive">Cancel</Button>} />}
                  {["Confirmed", "Checked-In", "Waiting"].includes(a.status) && <Button size="sm" variant="ghost" onClick={() => markNoShow(a.id)}>No-show</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <p className="p-4 text-muted-foreground">No appointments.</p>}
      </div>
    </div>
  );
}
