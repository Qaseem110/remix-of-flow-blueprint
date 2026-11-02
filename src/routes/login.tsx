import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "@/lib/store";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — Sahoolat" }, { name: "description", content: "Sign in to your Sahoolat patient, doctor or admin account." }, { property: "og:title", content: "Sign in — Sahoolat" }, { property: "og:description", content: "Sign in to your Sahoolat account." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: Login,
});

export function AuthFrame({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="grid min-h-screen md:grid-cols-[1fr_1.1fr]">
      <div className="hidden flex-col justify-between bg-hero p-10 text-primary-foreground md:flex">
        <Link to="/" className="flex items-center gap-2 font-display text-2xl font-semibold"><Stethoscope className="h-7 w-7" /> Sahoolat</Link>
        <p className="font-display text-4xl leading-tight">Care that respects your time.</p>
        <p className="text-sm opacity-75">Appointments · Queue · Video · Records</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <h1 className="text-3xl font-semibold">{title}</h1>
          <p className="mb-6 mt-1 text-muted-foreground">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    doLogin(email, password);
  };
  const [busy, setBusy] = useState(false);
  const doLogin = async (em: string, pw: string) => {
    setBusy(true);
    try {
      const u = await login(em, pw);
      toast.success(`Welcome, ${u.name}`);
      navigate({ to: u.role === "patient" ? "/patient" : u.role === "doctor" ? "/doctor" : u.role === "pharmacy" ? "/pharmacy" : "/admin" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally { setBusy(false); }
  };
  return (
    <AuthFrame title="Sign in" subtitle="Patients, doctors and admins sign in here.">
      <form onSubmit={submit} className="space-y-4">
        <div><Label htmlFor="email">Email</Label><Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><Label htmlFor="pw">Password</Label><Input id="pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
      </form>
      <p className="mt-4 flex justify-between text-sm text-muted-foreground"><span>No account? <Link to="/register" className="font-medium text-primary">Register</Link></span><Link to="/forgot-password" className="font-medium text-primary">Forgot password?</Link></p>
    </AuthFrame>
  );
}
