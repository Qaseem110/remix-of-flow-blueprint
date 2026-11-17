import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getDoctorAlertSettings, saveDoctorAlertSettings, type DoctorAlertSettings } from "@/lib/store";

export function DoctorStatsSettings() {
  const [settings, setSettings] = useState<DoctorAlertSettings>({ enabled: false, dailyTime: "08:00", phone: "", discussionAlerts: true });
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; getDoctorAlertSettings().then((s) => { if (active) { setSettings(s); setLoaded(true); } }).catch((e) => toast.error(e.message)); return () => { active = false; }; }, []);
  const save = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); try { await saveDoctorAlertSettings(settings); toast.success("Stats preferences saved"); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } };
  return <section className="mt-6 border-t pt-6"><Button variant="outline" onClick={() => setOpen(!open)} aria-expanded={open}><Bell className="mr-2 h-4 w-4" />Notify my stats</Button>{open && <form onSubmit={save} className="mt-4 space-y-4"><div><Label htmlFor="stats-phone">WhatsApp number (with country code)</Label><Input id="stats-phone" type="tel" placeholder="+923001234567" value={settings.phone} onChange={(e) => setSettings({ ...settings, phone: e.target.value.replace(/\s/g, "") })} /></div><label className="flex items-center gap-3"><Switch checked={settings.enabled} onCheckedChange={(enabled) => setSettings({ ...settings, enabled })} />Daily appointment summary</label><div><Label htmlFor="stats-time">Daily time (Tripoli)</Label><Input id="stats-time" type="time" value={settings.dailyTime} onChange={(e) => setSettings({ ...settings, dailyTime: e.target.value })} /></div><label className="flex items-center gap-3"><Switch checked={settings.discussionAlerts} onCheckedChange={(discussionAlerts) => setSettings({ ...settings, discussionAlerts })} />New patient discussion messages</label><p role="status" className="text-sm text-muted-foreground">WhatsApp connection pending</p><Button disabled={busy || !loaded}>{busy ? "Saving…" : "Save notification settings"}</Button></form>}</section>;
}