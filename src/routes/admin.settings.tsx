import { createFileRoute } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/app/common";
import { updateSettings, useStore } from "@/lib/store";
import { meta } from "@/lib/meta";
import { AdminSecurity } from "@/components/app/AdminSecurity";

export const Route = createFileRoute("/admin/settings")({
  head: () => meta("System settings", "Doctor verification, check-in methods, join window and file types."),
  component: SettingsPage,
});

function SettingsPage() {
  const st = useStore((s) => s.settings);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="System settings" />
      <AdminSecurity />
      <div className="space-y-5 rounded-2xl border bg-card p-6 shadow-soft">
        <label className="flex items-center justify-between"><div><p className="font-medium">Doctor verification</p><p className="text-sm text-muted-foreground">New doctors stay hidden until an admin approves them.</p></div><Switch checked={st.doctorVerification} onCheckedChange={(v) => updateSettings({ doctorVerification: v })} /></label>
        <div className="border-t pt-5">
          <p className="font-medium">Clinic check-in methods</p>
          <label className="mt-3 flex items-center justify-between text-sm"><span>Appointment ID</span><Switch checked={st.checkInMethods.appointmentId} onCheckedChange={(v) => updateSettings({ checkInMethods: { ...st.checkInMethods, appointmentId: v } })} /></label>
          <label className="mt-3 flex items-center justify-between text-sm"><span>Phone number</span><Switch checked={st.checkInMethods.phone} onCheckedChange={(v) => updateSettings({ checkInMethods: { ...st.checkInMethods, phone: v } })} /></label>
        </div>
        <div className="grid gap-4 border-t pt-5 sm:grid-cols-2">
          <div><Label htmlFor="jw">Join window (minutes before start)</Label><Input id="jw" type="number" min={0} value={st.joinWindowMinutes} onChange={(e) => updateSettings({ joinWindowMinutes: Number(e.target.value) })} /></div>
          <div><Label htmlFor="ta">"Turn approaching" alert (patients ahead)</Label><Input id="ta" type="number" min={0} value={st.turnApproachingAhead} onChange={(e) => updateSettings({ turnApproachingAhead: Number(e.target.value) })} /></div>
          <div className="sm:col-span-2"><Label htmlFor="ft">Allowed file types (comma separated)</Label><Input id="ft" defaultValue={st.allowedFileTypes.join(", ")} onBlur={(e) => updateSettings({ allowedFileTypes: e.target.value.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean) })} /></div>
        </div>
      </div>
    </div>
  );
}
