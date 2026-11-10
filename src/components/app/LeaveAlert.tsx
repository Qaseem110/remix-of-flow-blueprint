import { useEffect, useState } from "react";
import { Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { checkLeaveAlert, minutesUntilTurn, useStore, type Appointment } from "@/lib/store";
import { distanceKm, travelMinutes } from "@/lib/geo";

const KEY = (id: string) => `sahoolat-geo-${id}`;

/** Patient shares live location; we estimate travel time and alert them when it's time to leave. */
export function LeaveAlert({ a }: { a: Appointment }) {
  const doc = useStore((s) => s.doctors.find((d) => d.userId === a.doctorId));
  const [on, setOn] = useState(false);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { setOn(localStorage.getItem(KEY(a.id)) === "1"); }, [a.id]);
  useEffect(() => {
    if (!on || !navigator.geolocation) return;
    const w = navigator.geolocation.watchPosition(
      (p) => { setErr(""); setPos({ lat: p.coords.latitude, lng: p.coords.longitude }); },
      () => setErr("Location permission was denied. Allow location for this site in your browser."),
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(w);
  }, [on]);
  useEffect(() => {
    if (!on || !pos) return;
    checkLeaveAlert(a.id, pos);
    const t = setInterval(() => checkLeaveAlert(a.id, pos), 60000);
    return () => clearInterval(t);
  }, [on, pos, a.id]);

  if (a.type !== "clinic") return null;
  const hasClinic = doc?.clinicLat != null && doc?.clinicLng != null;
  const km = pos && hasClinic ? distanceKm(pos, { lat: doc!.clinicLat!, lng: doc!.clinicLng! }) : null;
  const left = minutesUntilTurn(a.id);
  const toggle = (v: boolean) => { setOn(v); localStorage.setItem(KEY(a.id), v ? "1" : "0"); if (!v) setPos(null); };

  return (
    <section className="mt-6 rounded-2xl border bg-card p-5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2"><Navigation className="h-5 w-5 text-primary" /><p className="font-semibold">Remind me when to leave</p></div>
        <Switch checked={on} onCheckedChange={toggle} disabled={!hasClinic} aria-label="Share my location" />
      </div>
      {!hasClinic ? <p className="mt-2 text-sm text-muted-foreground">The doctor hasn't set the clinic location yet.</p> : (
        <p className="mt-2 text-sm text-muted-foreground">Share your location and we'll message you when it's time to leave so you reach the clinic before your turn. Keep this page open.</p>
      )}
      {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
      {on && km != null && (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-xl bg-muted p-2"><p className="text-muted-foreground">Distance</p><p className="font-semibold">{km.toFixed(1)} km</p></div>
          <div className="rounded-xl bg-muted p-2"><p className="text-muted-foreground">Travel</p><p className="font-semibold">~{travelMinutes(km)} min</p></div>
          <div className="rounded-xl bg-muted p-2"><p className="text-muted-foreground">Your turn in</p><p className="font-semibold">{left ?? "–"} min</p></div>
        </div>
      )}
      {a.leaveAlertAt && <p className="mt-2 text-sm font-medium text-primary">Leave-now alert sent. Please head to the clinic.</p>}
      {on && !pos && !err && <Button variant="ghost" size="sm" disabled className="mt-2">Finding your location…</Button>}
    </section>
  );
}
