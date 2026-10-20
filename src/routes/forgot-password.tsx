import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "@/lib/store";
import { meta } from "@/lib/meta";
import { AuthFrame } from "./login";

export const Route = createFileRoute("/forgot-password")({
  head: () => meta("Reset password", "Get a link to reset your Sahoolat password."),
  component: Forgot,
});

function Forgot() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <AuthFrame title="Forgot password" subtitle="We'll email you a link to set a new password.">
      {sent ? (
        <div className="rounded-xl border bg-secondary/50 p-5 text-sm">
          <MailCheck className="h-6 w-6 text-primary" />
          <p className="mt-2 font-medium">Check your email</p>
          <p className="text-muted-foreground">If an account exists for {email}, a reset link is on its way.</p>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); requestPasswordReset(email); setSent(true); }} className="space-y-4">
          <div><Label htmlFor="email">Email</Label><Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <Button type="submit" className="w-full">Send reset link</Button>
        </form>
      )}
      <p className="mt-4 text-sm text-muted-foreground"><Link to="/login" className="font-medium text-primary">Back to sign in</Link></p>
    </AuthFrame>
  );
}
