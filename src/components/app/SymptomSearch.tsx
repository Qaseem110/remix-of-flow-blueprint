import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Search, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore, visibleDoctors } from "@/lib/store";
import { suggestDoctors } from "@/lib/symptom-match.functions";

export function SymptomSearch() {
  const s = useStore((s) => s);
  const docs = visibleDoctors(s);
  const [text, setText] = useState("");
  const run = useServerFn(suggestDoctors);
  const m = useMutation({ mutationFn: (symptoms: string) => run({ data: { symptoms, doctors: docs.map((d) => ({ id: d.userId, specialization: d.specialization })) } }) });
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (text.trim().length >= 3) m.mutate(text.trim()); };
  const r = m.data;
  const matched = r ? docs.filter((d) => r.doctorIds.includes(d.userId)).slice(0, 6) : [];
  return (
    <div className="mt-7 rounded-[18px] border bg-card p-4 shadow-soft">
      <p className="flex items-center gap-2 text-sm font-bold text-secondary-foreground"><Stethoscope className="h-4 w-4 text-primary" />Not sure which doctor? Describe your problem</p>
      <form onSubmit={submit} className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <Input aria-label="Describe your illness" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="e.g. sir dard aur bukhar, skin rash, knee pain…" className="h-11 min-w-0" />
        <Button type="submit" disabled={m.isPending || text.trim().length < 3} className="h-11 shrink-0">{m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}<span className="hidden sm:inline">Suggest</span></Button>
      </form>
      {r?.error && <p className="mt-3 text-sm text-destructive">{r.error}</p>}
      {r && !r.error && (
        <div className="mt-3 space-y-2 text-sm">
          {r.urgent && <p className="flex gap-2 rounded-lg bg-destructive/10 p-2 font-semibold text-destructive"><AlertTriangle className="h-4 w-4 shrink-0" />This may be an emergency. Please go to the nearest hospital now.</p>}
          {r.advice && <p className="text-muted-foreground">{r.advice}</p>}
          {r.specializations.length > 0 && <p><span className="font-semibold">Suggested:</span> {r.specializations.join(", ")}</p>}
          {matched.length > 0 ? (
            <ul className="grid gap-1">
              {matched.map((d) => { const u = s.users.find((x) => x.id === d.userId); return (
                <li key={d.userId}><Link to="/patient/doctors/$id" params={{ id: d.userId }} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 hover:border-primary"><span className="min-w-0 truncate font-semibold">{u?.name ?? "Doctor"}</span><span className="shrink-0 text-xs text-muted-foreground">{d.specialization}</span></Link></li>
              ); })}
            </ul>
          ) : <p className="text-muted-foreground">No matching doctor is listed yet. <Link to="/patient/doctors" className="font-semibold text-primary">Browse all doctors</Link></p>}
          <p className="text-[11px] text-muted-foreground">This is a suggestion, not a diagnosis.</p>
        </div>
      )}
    </div>
  );
}
