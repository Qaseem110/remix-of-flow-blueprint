import { useEffect, useState } from "react";
import { Lock, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { getState, hydrate, useStore } from "@/lib/store";

/** Doctor-side gate: patient reports stay hidden until the patient's report PIN is entered. */
export function PinGate({ patientId, children }: { patientId: string; children: React.ReactNode }) {
  const sessionUserId = useStore((s) => s.sessionUserId);
  const [accessKey, setAccessKey] = useState<string | null>(null);
  const key = `${sessionUserId}:${patientId}`;
  const open = accessKey === key;
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setAccessKey(null); setHasPin(null); setPin("");
    const check = async () => {
      const { data, error } = await supabase.rpc("has_report_access", { patient: patientId });
      if (cancelled) return;
      if (data && !error) {
        await hydrate(sessionUserId);
        if (!cancelled) setAccessKey(key);
      } else {
        setAccessKey(null);
        const { data: has, error: pinError } = await supabase.rpc("has_report_pin", { patient: patientId });
        if (!cancelled && !pinError) setHasPin(!!has);
      }
    };
    if (sessionUserId) void check();
    const timer = setInterval(() => { if (sessionUserId) void check(); }, 60000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [patientId, sessionUserId, key]);
  if (open) return <>{children}</>;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      const { data, error } = await supabase.rpc("unlock_patient_reports", { patient: patientId, pin });
      if (error || !data) { toast.error(error ? "Could not unlock records. Please try again." : "Wrong PIN or no appointment with this patient"); return; }
      await hydrate(sessionUserId);
      if (getState().sessionUserId === sessionUserId) { setAccessKey(key); setPin(""); }
    } catch { toast.error("Could not load records. Please try again."); }
    finally { setBusy(false); }
  };
  return (
    <div className="rounded-xl border border-dashed bg-muted/40 p-4 text-sm">
      <p className="mb-2 flex items-center gap-2 font-medium"><Lock className="h-4 w-4 text-primary" />Reports are locked</p>
      {hasPin === false ? <p className="text-muted-foreground">This patient hasn't set a report PIN yet. Ask them to set one in their profile.</p> : (
        <form onSubmit={submit} className="flex gap-2">
          <Input aria-label="Patient's report PIN" inputMode="numeric" type="password" maxLength={6} placeholder="Patient's PIN" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} className="max-w-40" />
          <Button size="sm" disabled={busy || pin.length < 4}>Unlock</Button>
        </form>
      )}
    </div>
  );
}

/** Patient-side: set or change the PIN doctors need to view reports. */
export function ReportPinSettings({ userId }: { userId: string }) {
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [pin, setPin] = useState(""); const [pin2, setPin2] = useState("");
  useEffect(() => { void supabase.rpc("has_report_pin", { patient: userId }).then(({ data }) => setHasPin(!!data)); }, [userId]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin !== pin2) { toast.error("PINs don't match"); return; }
    const { error } = await supabase.rpc("set_report_pin", { pin });
    if (error) { toast.error(error.message); return; }
    toast.success("Report PIN saved"); setHasPin(true); setPin(""); setPin2("");
  };
  return (
    <section className="mt-6 rounded-2xl border bg-card p-6 shadow-soft">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><KeyRound className="h-5 w-5 text-primary" />Report PIN</h2>
      <p className="mt-1 text-sm text-muted-foreground">Doctors can only see your reports after you tell them this PIN. {hasPin ? "A PIN is set — you can change it below." : "No PIN set yet."}</p>
      <form onSubmit={save} className="mt-4 grid gap-3 sm:grid-cols-3 sm:items-end">
        <div><Label htmlFor="pin">New PIN (4-6 digits)</Label><Input id="pin" type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} /></div>
        <div><Label htmlFor="pin2">Confirm PIN</Label><Input id="pin2" type="password" inputMode="numeric" maxLength={6} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} /></div>
        <Button disabled={pin.length < 4}>{hasPin ? "Change PIN" : "Set PIN"}</Button>
      </form>
    </section>
  );
}
