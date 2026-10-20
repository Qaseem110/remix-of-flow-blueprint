import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/app/common";
import { updateUser, useStore } from "@/lib/store";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/admin/users")({
  head: () => meta("Users & doctors", "Manage patient and doctor accounts."),
  component: Users,
});

function Users() {
  const s = useStore((s) => s);
  const [role, setRole] = useState("all");
  const [q, setQ] = useState("");
  const list = s.users.filter((u) => u.role !== "admin" && (role === "all" || u.role === role) && (u.name + u.email).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Users & doctors" actions={<Input placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} className="w-64" />} />
      <Tabs value={role} onValueChange={setRole} className="mb-4"><TabsList><TabsTrigger value="all">All</TabsTrigger><TabsTrigger value="patient">Patients</TabsTrigger><TabsTrigger value="doctor">Doctors</TabsTrigger></TabsList></Tabs>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground"><tr>{["Name", "Role", "Email", "Phone", "Details", "Appointments", "Active"].map((h) => <th key={h} className="p-3">{h}</th>)}</tr></thead>
          <tbody>
            {list.map((u) => {
              const d = s.doctors.find((x) => x.userId === u.id);
              const count = s.appointments.filter((a) => a.patientId === u.id || a.doctorId === u.id).length;
              return (
                <tr key={u.id} className="border-t">
                  <td className="p-3 font-medium">{u.name}</td><td className="p-3 capitalize">{u.role}</td><td className="p-3">{u.email}</td><td className="p-3">{u.phone}</td>
                  <td className="p-3 text-muted-foreground">{d ? `${d.specialization} · ${d.verification}` : s.patients.find((p) => p.userId === u.id)?.gender}</td>
                  <td className="p-3">{count}</td>
                  <td className="p-3"><Switch checked={u.active} onCheckedChange={(v) => updateUser(u.id, { active: v })} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
