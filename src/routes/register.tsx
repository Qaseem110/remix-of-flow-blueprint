import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { registerDoctor, registerPatient, registerPharmacy, registerLab } from "@/lib/store";
import { AuthFrame } from "./login";

export const Route = createFileRoute("/register")({
  validateSearch: (s: Record<string, unknown>) => ({ role: s.role === "doctor" || s.role === "pharmacy" || s.role === "lab" ? s.role : undefined }) as { role?: "doctor" | "pharmacy" | "lab" },
  head: () => ({ meta: [{ title: "Create account — Sahoolat" }, { name: "description", content: "Register as a patient, doctor, medical store or laboratory on Sahoolat." }, { property: "og:title", content: "Create account — Sahoolat" }, { property: "og:description", content: "Register as a patient or doctor." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: Register,
});

export const SPECIALIZATIONS = ["General Practice", "Cardiology", "Dermatology", "Pediatrics", "Orthopedics", "Neurology", "Gynecology", "ENT", "Ophthalmology", "Psychiatry", "Dentistry", "Internal Medicine"];

function F({ id, label, ...p }: { id: string; label: string } & React.ComponentProps<typeof Input>) {
  return <div><Label htmlFor={id}>{label}</Label><Input id={id} name={id} {...p} /></div>;
}

function Register() {
  const { role } = Route.useSearch();
  const navigate = useNavigate();
  const [gender, setGender] = useState("");
  const [blood, setBlood] = useState("");
  const [spec, setSpec] = useState("");
  const [online, setOnline] = useState(true);
  const [clinic, setClinic] = useState(true);

  const onPatient = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    if (!gender) return toast.error("Please select gender");
    if (f.password.length < 6) return toast.error("Password must be at least 6 characters");
    try {
      await registerPatient({ name: f.name, email: f.email, phone: f.phone, password: f.password, dob: f.dob, gender, bloodGroup: blood || undefined, address: f.address || undefined, emergencyContact: f.emergency || undefined });
      toast.success("Account created");
      navigate({ to: "/patient" });
    } catch (err) { toast.error((err as Error).message); }
  };

  const onDoctor = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    if (!spec) return toast.error("Please select specialization");
    if (!online && !clinic) return toast.error("Choose at least one consultation type");
    if (f.password.length < 6) return toast.error("Password must be at least 6 characters");
    try {
      await registerDoctor({ name: f.name, email: f.email, phone: f.phone, password: f.password, specialization: spec, qualification: f.qualification, licenseNumber: f.license, clinicName: f.clinicName, clinicAddress: f.clinicAddress, city: f.city, online, clinic });
      toast.success("Account created");
      navigate({ to: "/doctor" });
    } catch (err) { toast.error((err as Error).message); }
  };

  const onPharmacy = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    if (f.password.length < 6) return toast.error("Password must be at least 6 characters");
    try {
      await registerPharmacy({ name: f.name, email: f.email, phone: f.phone, password: f.password, storeName: f.storeName, address: f.address, city: f.city });
      toast.success("Account created");
      navigate({ to: "/pharmacy" });
    } catch (err) { toast.error((err as Error).message); }
  };

  const onLab = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    if (f.password.length < 6) return toast.error("Password must be at least 6 characters");
    try {
      await registerLab({ name: f.name, email: f.email, phone: f.phone, password: f.password, labName: f.labName, address: f.address, city: f.city });
      toast.success("Account created");
      navigate({ to: "/lab" });
    } catch (err) { toast.error((err as Error).message); }
  };

  return (
    <AuthFrame title="Create your account" subtitle="Choose how you'll use Sahoolat.">
      <Tabs defaultValue={role ?? "patient"}>
        <TabsList className="mb-4 grid w-full grid-cols-4"><TabsTrigger value="patient">Patient</TabsTrigger><TabsTrigger value="doctor">Doctor</TabsTrigger><TabsTrigger value="pharmacy">Store</TabsTrigger><TabsTrigger value="lab">Laboratory</TabsTrigger></TabsList>
        <TabsContent value="patient">
          <form onSubmit={onPatient} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><F id="name" label="Full name" required /></div>
            <F id="phone" label="Phone" type="tel" required />
            <F id="email" label="Email" type="email" required />
            <F id="password" label="Password" type="password" required />
            <F id="dob" label="Date of birth" type="date" required />
            <div><Label>Gender</Label><Select value={gender} onValueChange={setGender}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{["Male", "Female"].map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Blood group (optional)</Label><Select value={blood} onValueChange={setBlood}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent></Select></div>
            <div className="sm:col-span-2"><F id="address" label="Address (optional)" /></div>
            <div className="sm:col-span-2"><F id="emergency" label="Emergency contact (optional)" placeholder="Name — phone" /></div>
            <Button type="submit" className="sm:col-span-2">Create patient account</Button>
          </form>
        </TabsContent>
        <TabsContent value="doctor">
          <form onSubmit={onDoctor} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><F id="name" label="Full name" required /></div>
            <F id="email" label="Email" type="email" required />
            <F id="phone" label="Phone" type="tel" required />
            <F id="password" label="Password" type="password" required />
            <div><Label>Specialization</Label><Select value={spec} onValueChange={setSpec}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{SPECIALIZATIONS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent></Select></div>
            <F id="qualification" label="Qualification" required placeholder="e.g. MBBS, MD" />
            <F id="license" label="License / registration no." required />
            <F id="clinicName" label="Clinic name" required />
            <F id="city" label="City" required />
            <div className="sm:col-span-2"><F id="clinicAddress" label="Clinic address" required /></div>
            <div className="flex gap-6 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={online} onCheckedChange={(v) => setOnline(!!v)} /> Online consultation</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={clinic} onCheckedChange={(v) => setClinic(!!v)} /> In-clinic consultation</label>
            </div>
            <Button type="submit" className="sm:col-span-2">Create doctor account</Button>
          </form>
        </TabsContent>
        <TabsContent value="pharmacy">
          <form onSubmit={onPharmacy} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><F id="storeName" label="Medical store name" required /></div>
            <F id="name" label="Owner name" required />
            <F id="phone" label="Phone / WhatsApp" type="tel" required />
            <F id="email" label="Email" type="email" required />
            <F id="password" label="Password" type="password" required />
            <F id="city" label="City" required />
            <F id="address" label="Store address" required />
            <Button type="submit" className="sm:col-span-2">Create medical store account</Button>
          </form>
        </TabsContent>
        <TabsContent value="lab">
          <form onSubmit={onLab} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><F id="labName" label="Laboratory name" required /></div>
            <F id="name" label="Contact person" required />
            <F id="phone" label="Phone / WhatsApp" type="tel" required />
            <F id="email" label="Email" type="email" required />
            <F id="password" label="Password" type="password" required />
            <F id="city" label="City" required />
            <F id="address" label="Laboratory address" required />
            <Button type="submit" className="sm:col-span-2">Create laboratory account</Button>
          </form>
        </TabsContent>
      </Tabs>
      <p className="mt-4 text-sm text-muted-foreground">Already registered? <Link to="/login" className="font-medium text-primary">Sign in</Link></p>
    </AuthFrame>
  );
}
