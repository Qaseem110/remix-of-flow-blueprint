import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setNewPassword } from "@/lib/store";
import { meta } from "@/lib/meta";
import { AuthFrame } from "./login";

export const Route = createFileRoute("/reset-password")({
  head: () => meta("Set new password", "Choose a new password for your Sahoolat account."),
  component: Reset,
});

function Reset() {
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 6) return toast.error("Password must be at least 6 characters");
    setBusy(true);
    try {
      await setNewPassword(pw);
      toast.success("Password updated — please sign in");
      navigate({ to: "/login" });
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <AuthFrame title="Set a new password" subtitle="Open this page from the link in your email.">
      <form onSubmit={submit} className="space-y-4">
        <div><Label htmlFor="pw">New password</Label><Input id="pw" type="password" required value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        <Button type="submit" className="w-full" disabled={busy}>Update password</Button>
      </form>
      <p className="mt-4 text-sm text-muted-foreground"><Link to="/login" className="font-medium text-primary">Back to sign in</Link></p>
    </AuthFrame>
  );
}
