import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader, Stat, Avatar } from "@/components/app/common";
import { setVerification, todayStr, useStore } from "@/lib/store";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/admin/")({
  head: () => meta("Doctor verification", "Review and approve or reject doctor registrations."),
  component: Verification,
});

function Verification() {
  const s = useStore((s) => s);
  const pending = s.doctors.filter((d) => d.verification === "Pending Verification");
  const reviewed = s.doctors.filter((d) => d.verification !== "Pending Verification");
  const name = (id: string) => s.users.find((u) => u.id === id);
  const Card = ({ d }: { d: (typeof s.doctors)[number] }) => {
    const u = name(d.userId)!;
    return (
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-4">
        <Avatar name={u.name} src={d.avatar} />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-display text-lg font-semibold">{u.name}</p>
          <p className="text-muted-foreground">{d.specialization} · {d.qualification} · License {d.licenseNumber}</p>
          <p className="text-muted-foreground">{u.email} · {u.phone} · {d.clinicName}, {d.city} · {[d.online && "Online", d.clinic && "In-clinic"].filter(Boolean).join(" & ")}</p>
        </div>
        <Badge variant={d.verification === "Approved" ? "default" : d.verification === "Rejected" ? "destructive" : "secondary"}>{d.verification}</Badge>
        <div className="flex gap-2">
          {d.verification !== "Approved" && <Button size="sm" onClick={() => { setVerification(d.userId, "Approved"); toast.success("Doctor approved"); }}>Approve</Button>}
          {d.verification !== "Rejected" && <Button size="sm" variant="outline" className="text-destructive" onClick={() => { setVerification(d.userId, "Rejected"); toast("Doctor rejected"); }}>Reject</Button>}
        </div>
      </div>
    );
  };
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Admin overview" subtitle={s.settings.doctorVerification ? "Doctor verification is enabled" : "Doctor verification is disabled — new doctors are auto-approved"} />
      <div className="mb-8 grid gap-4 sm:grid-cols-4">
        <Stat label="Pending review" value={pending.length} />
        <Stat label="Doctors" value={s.doctors.length} />
        <Stat label="Patients" value={s.patients.length} />
        <Stat label="Appointments today" value={s.appointments.filter((a) => a.date === todayStr()).length} />
      </div>
      <h2 className="mb-3 text-xl font-semibold">Pending verification</h2>
      <div className="space-y-3">{pending.length ? pending.map((d) => <Card key={d.userId} d={d} />) : <p className="text-muted-foreground">No pending registrations.</p>}</div>
      <h2 className="mb-3 mt-8 text-xl font-semibold">Reviewed</h2>
      <div className="space-y-3">{reviewed.map((d) => <Card key={d.userId} d={d} />)}</div>
    </div>
  );
}
