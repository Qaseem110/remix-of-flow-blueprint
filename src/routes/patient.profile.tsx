import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/app/common";
import { ReportPinSettings } from "@/components/app/ReportPin";
import { FamilyMembers } from "@/components/app/FamilyMembers";
import { updatePatientProfile, updateUser, useSession, useStore } from "@/lib/store";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/patient/profile")({
  head: () => meta("My profile", "Update your personal and medical details."),
  component: PatientProfile,
});

function PatientProfile() {
  const user = useSession()!;
  const p = useStore((s) => s.patients.find((x) => x.userId === user.id));
  if (!p) return null;
  const save = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    updateUser(user.id, { name: f.name, phone: f.phone, email: f.email });
    updatePatientProfile(user.id, { dob: f.dob, gender: f.gender, bloodGroup: f.bloodGroup, address: f.address, emergencyContact: f.emergencyContact });
    toast.success("Profile saved");
  };
  const fields: [string, string, string, string?][] = [
    ["name", "Full name", user.name], ["phone", "Phone", user.phone], ["email", "Email", user.email, "email"], ["dob", "Date of birth", p.dob, "date"],
    ["gender", "Gender", p.gender], ["bloodGroup", "Blood group", p.bloodGroup ?? ""], ["address", "Address", p.address ?? ""], ["emergencyContact", "Emergency contact", p.emergencyContact ?? ""],
  ];
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="My profile" subtitle="Keep your details up to date for your doctors." />
      <form onSubmit={save} className="grid gap-4 rounded-2xl border bg-card p-6 shadow-soft sm:grid-cols-2">
        {fields.map(([n, l, v, t]) => <div key={n}><Label htmlFor={n}>{l}</Label><Input id={n} name={n} type={t ?? "text"} defaultValue={v} /></div>)}
        <Button className="sm:col-span-2">Save changes</Button>
      </form>
      <ReportPinSettings userId={user.id} />
      <FamilyMembers userId={user.id} />
    </div>
  );
}
