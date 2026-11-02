import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { MapPin, Star, Video, Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Avatar, PageHeader } from "@/components/app/common";
import { getSlots, nextAvailableDate, useStore, visibleDoctors } from "@/lib/store";
import { meta } from "@/lib/meta";
import { fmtPrice } from "@/lib/utils";

export const Route = createFileRoute("/patient/doctors/")({
  head: () => meta("Find a doctor", "Search doctors by name, specialization, location, consultation type and date."),
  component: FindDoctor,
});

function FindDoctor() {
  const s = useStore((s) => s);
  const [q, setQ] = useState("");
  const [spec, setSpec] = useState("all");
  const [city, setCity] = useState("all");
  const [online, setOnline] = useState(false);
  const [clinic, setClinic] = useState(false);
  const [date, setDate] = useState("");
  const docs = visibleDoctors(s);
  const specs = [...new Set(docs.map((d) => d.specialization))];
  const cities = [...new Set(docs.map((d) => d.city))];

  const list = useMemo(() => docs.filter((d) => {
    const u = s.users.find((x) => x.id === d.userId)!;
    if (q && !u.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (spec !== "all" && d.specialization !== spec) return false;
    if (city !== "all" && d.city !== city) return false;
    if (online && !d.online) return false;
    if (clinic && !d.clinic) return false;
    if (date && !getSlots(d.userId, date, s).some((x) => x.available)) return false;
    return true;
  }), [docs, q, spec, city, online, clinic, date, s]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Find a doctor" subtitle={`${list.length} doctors available`} />
      <div className="mb-6 grid gap-3 rounded-2xl border bg-card p-4 shadow-soft md:grid-cols-6">
        <Input placeholder="Doctor name" value={q} onChange={(e) => setQ(e.target.value)} className="md:col-span-2" />
        <Select value={spec} onValueChange={setSpec}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All specializations</SelectItem>{specs.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select>
        <Select value={city} onValueChange={setCity}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All locations</SelectItem>{cities.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Available date" />
        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-1.5"><Checkbox checked={online} onCheckedChange={(v) => setOnline(!!v)} />Online</label>
          <label className="flex items-center gap-1.5"><Checkbox checked={clinic} onCheckedChange={(v) => setClinic(!!v)} />Clinic</label>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {list.map((d) => {
          const u = s.users.find((x) => x.id === d.userId)!;
          const na = nextAvailableDate(d.userId);
          return (
            <div key={d.userId} className="flex gap-4 rounded-2xl border bg-card p-5 shadow-soft">
              <Avatar name={u.name} src={d.avatar} className="h-16 w-16 text-xl" />
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg font-semibold">{u.name}</p>
                <p className="text-sm text-primary">{d.specialization} · {d.experience} yrs</p>
                <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{d.clinicName}, {d.city}</p>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {d.online && <span className="flex items-center gap-1"><Video className="h-3.5 w-3.5" />Online</span>}
                  {d.clinic && <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />In-clinic</span>}
                  <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5" />{d.languages.join(", ")}</span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm"><b className="font-display text-lg">{fmtPrice(d.fee)}</b> · next: {na ?? "—"}</span>
                  <Button size="sm" asChild><Link to="/patient/doctors/$id" params={{ id: d.userId }}>View profile</Link></Button>
                </div>
              </div>
            </div>
          );
        })}
        {list.length === 0 && <p className="text-muted-foreground">No doctors match your filters.</p>}
      </div>
    </div>
  );
}
