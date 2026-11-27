import { useMemo, useState } from "react";
import { CalendarDays, ClipboardList, FileText, FlaskConical, HeartPulse, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

type Entry = { id: string; actor_id: string | null; subject_id: string | null; resource: string; action: string; record_id: string | null; created_at: string };

const RESOURCE: Record<string, { label: string; icon: typeof FileText }> = {
  appointments: { label: "Appointment", icon: CalendarDays },
  consultations: { label: "Consultation", icon: ClipboardList },
  lab_orders: { label: "Lab test", icon: FlaskConical },
  care_items: { label: "Care service", icon: HeartPulse },
  documents: { label: "Document", icon: FileText },
};
const ACTION: Record<string, string> = { INSERT: "created", UPDATE: "updated", DELETE: "deleted", Preview: "viewed", Download: "downloaded" };

export function describeActivity(a: Entry, me: string) {
  const what = RESOURCE[a.resource]?.label ?? a.resource.replace(/_/g, " ");
  const verb = ACTION[a.action] ?? a.action.toLowerCase();
  const who = !a.actor_id ? "The system" : a.actor_id === me ? "You" : "Someone else";
  const forWhom = a.subject_id && a.subject_id !== me && a.actor_id === me ? " for another account" : a.subject_id === me && a.actor_id && a.actor_id !== me ? " on your account" : "";
  return `${who} ${verb} ${/^[aeiou]/i.test(what) ? "an" : "a"} ${what.toLowerCase()}${forWhom}`;
}

export function ActivityLog({ activity, me }: { activity: Entry[]; me: string }) {
  const [type, setType] = useState("all");
  const [action, setAction] = useState("all");
  const [range, setRange] = useState("all");
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const since = range === "all" ? 0 : Date.now() - Number(range) * 86_400_000;
    const t = q.trim().toLowerCase();
    return activity.filter((a) => (type === "all" || a.resource === type) && (action === "all" || a.action === action) && new Date(a.created_at).getTime() >= since && (!t || `${describeActivity(a, me)} ${a.record_id ?? ""}`.toLowerCase().includes(t)));
  }, [activity, type, action, range, q, me]);
  const sel = "h-9 rounded-md border bg-background px-2 text-sm";
  return (
    <section className="border-t pt-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Recent account activity</h2><span className="text-xs text-muted-foreground">{list.length} of {activity.length}</span></div>
      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search activity" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search activity…" className="h-9 pl-8" /></div>
        <select aria-label="Activity type" value={type} onChange={(e) => setType(e.target.value)} className={sel}><option value="all">All types</option>{Object.entries(RESOURCE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <select aria-label="Action" value={action} onChange={(e) => setAction(e.target.value)} className={sel}><option value="all">All actions</option>{Object.entries(ACTION).map(([k, v]) => <option key={k} value={k}>{v[0].toUpperCase() + v.slice(1)}</option>)}</select>
        <select aria-label="Time range" value={range} onChange={(e) => setRange(e.target.value)} className={sel}><option value="all">Any time</option><option value="1">Last 24 hours</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select>
      </div>
      <ul className="max-h-96 divide-y overflow-y-auto rounded-xl border text-sm">
        {list.map((a) => { const Icon = RESOURCE[a.resource]?.icon ?? FileText; return (
          <li key={a.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 px-3 py-2.5">
            <span className="mt-0.5 grid h-8 w-8 place-items-center rounded-lg bg-secondary text-primary"><Icon className="h-4 w-4" /></span>
            <div className="min-w-0"><p className="font-medium">{describeActivity(a, me)}</p><p className="truncate text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString("en-US", { hour12: true, dateStyle: "medium", timeStyle: "short" })}{a.record_id ? ` · Ref ${a.record_id.slice(0, 8)}` : ""}</p></div>
          </li>); })}
        {!list.length && <li className="p-4 text-muted-foreground">{activity.length ? "No activity matches these filters." : "No activity recorded yet."}</li>}
      </ul>
    </section>
  );
}
