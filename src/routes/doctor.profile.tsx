import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, PageHeader } from "@/components/app/common";
import { updateDoctorProfile, updateUser, useSession, useStore } from "@/lib/store";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/doctor/profile")({
  head: () => meta("Doctor profile", "Complete your public profile, specialization and services."),
  component: DocProfile,
});

function DocProfile() {
  const user = useSession()!;
  const d = useStore((s) => s.doctors.find((x) => x.userId === user.id))!;
  const save = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    updateUser(user.id, { name: f.name, phone: f.phone });
    updateDoctorProfile(user.id, {
      specialization: f.specialization, qualification: f.qualification, licenseNumber: f.licenseNumber, experience: Number(f.experience) || 0, fee: Number(f.fee) || 0,
      languages: f.languages.split(",").map((x) => x.trim()).filter(Boolean), services: f.services.split(",").map((x) => x.trim()).filter(Boolean),
      clinicName: f.clinicName, clinicAddress: f.clinicAddress, city: f.city, about: f.about,
    });
    toast.success("Profile saved");
  };
  const onPic = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) updateDoctorProfile(user.id, { avatar: URL.createObjectURL(file) }); };
  const fields: [string, string, string | number, string?][] = [
    ["name", "Name", user.name], ["phone", "Phone", user.phone], ["specialization", "Specialization", d.specialization], ["qualification", "Qualification", d.qualification],
    ["licenseNumber", "License / registration no.", d.licenseNumber], ["experience", "Experience (years)", d.experience, "number"], ["fee", "Consultation fee (LYD)", d.fee, "number"],
    ["languages", "Languages (comma separated)", d.languages.join(", ")], ["services", "Services (comma separated)", d.services.join(", ")], ["clinicName", "Clinic name", d.clinicName], ["city", "City", d.city], ["clinicAddress", "Clinic address", d.clinicAddress],
  ];
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="My profile" subtitle={`Verification: ${d.verification}`} />
      <form onSubmit={save} className="grid gap-4 rounded-2xl border bg-card p-6 shadow-soft sm:grid-cols-2">
        <div className="flex items-center gap-4 sm:col-span-2">
          <Avatar name={user.name} src={d.avatar} className="h-20 w-20 text-2xl" />
          <label className="cursor-pointer text-sm font-medium text-primary">Change profile picture<input type="file" accept="image/*" className="hidden" onChange={onPic} /></label>
        </div>
        {fields.map(([n, l, v, t]) => <div key={n}><Label htmlFor={n}>{l}</Label><Input id={n} name={n} type={t ?? "text"} defaultValue={v} /></div>)}
        <div className="sm:col-span-2"><Label htmlFor="about">About</Label><Textarea id="about" name="about" rows={4} defaultValue={d.about} /></div>
        <Button className="sm:col-span-2">Save profile</Button>
      </form>
    </div>
  );
}
