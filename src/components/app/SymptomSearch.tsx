import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, FileText, Image as ImageIcon, MessagesSquare, PlayCircle, Search, Sparkles, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore, visibleDoctors } from "@/lib/store";
import { KIND_LABEL, usePosts, type PostKind } from "@/lib/feed";
import { suggestDoctors } from "@/lib/symptom-match.functions";

type Target = "doctors" | PostKind;
const TARGETS: { v: Target; label: string; icon: typeof Stethoscope }[] = [
  { v: "doctors", label: "Doctors", icon: Stethoscope },
  { v: "blog", label: "Blogs", icon: FileText },
  { v: "forum", label: "Discussions", icon: MessagesSquare },
  { v: "photo", label: "Photos", icon: ImageIcon },
  { v: "video", label: "Videos", icon: PlayCircle },
];

function PremiumLoader({ label }: { label: string }) {
  return (
    <div role="status" className="mt-4 flex items-center gap-4 rounded-[14px] bg-linear-to-r from-secondary to-card p-4">
      <span className="relative grid h-12 w-12 shrink-0 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-primary/25" />
        <span className="absolute inset-1 animate-pulse rounded-full bg-primary/15" />
        <span className="relative grid h-9 w-9 place-items-center rounded-full bg-sidebar text-primary-foreground shadow-soft"><Sparkles className="h-4 w-4" /></span>
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-bold text-secondary-foreground">{label}</p>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted"><div className="h-full w-1/3 animate-[loader-slide_1.2s_ease-in-out_infinite] rounded-full bg-linear-to-r from-primary to-accent" /></div>
      </div>
    </div>
  );
}

function PostResults({ kind, q }: { kind: PostKind; q: string }) {
  const r = usePosts({ kinds: [kind], q });
  if (r.isLoading) return <PremiumLoader label={`Searching ${KIND_LABEL[kind].toLowerCase()} posts…`} />;
  const posts = (r.data ?? []).slice(0, 6);
  return (
    <div className="mt-3 space-y-2 text-sm">
      {posts.length ? (
        <ul className="grid gap-1">{posts.map((p) => <li key={p.id}><Link to="/feed/$postId" params={{ postId: p.id }} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border px-3 py-2 hover:border-primary"><span className="min-w-0 truncate font-semibold">{p.title}</span><span className="shrink-0 text-xs text-muted-foreground">{p.author_name}</span></Link></li>)}</ul>
      ) : <p className="text-muted-foreground">Nothing found for “{q}” yet. <Link to="/discussions" className="font-semibold text-primary">See all discussions</Link></p>}
    </div>
  );
}

export function SymptomSearch() {
  const s = useStore((s) => s);
  const docs = visibleDoctors(s);
  const [text, setText] = useState("");
  const [target, setTarget] = useState<Target>("doctors");
  const [postQuery, setPostQuery] = useState<{ kind: PostKind; q: string } | null>(null);
  const run = useServerFn(suggestDoctors);
  const navigate = useNavigate();
  const m = useMutation({
    mutationFn: (symptoms: string) => run({ data: { symptoms, doctors: docs.map((d) => ({ id: d.userId, specialization: d.specialization })) } }),
    onSuccess: (res, symptoms) => {
      if (res.error || res.urgent || (!res.specializations.length && !res.doctorIds.length)) return;
      void navigate({ to: "/patient/doctors", search: { problem: symptoms, need: res.specializations.join("|"), ids: res.doctorIds.join("|"), advice: res.advice ?? "" } });
    },
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim(); if (t.length < 3) return;
    if (target === "doctors") { setPostQuery(null); m.mutate(t); } else { m.reset(); setPostQuery({ kind: target, q: t }); }
  };
  const r = m.data;
  const matched = r ? docs.filter((d) => r.doctorIds.includes(d.userId)).slice(0, 6) : [];
  return (
    <div className="mt-7 rounded-[18px] border bg-card p-4 shadow-soft">
      <p className="flex items-center gap-2 text-sm font-bold text-secondary-foreground"><Sparkles className="h-4 w-4 text-primary" />Describe your problem — what would you like to see?</p>
      <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="What to show">
        {TARGETS.map((t) => (
          <button key={t.v} type="button" role="radio" aria-checked={target === t.v} onClick={() => setTarget(t.v)} className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition ${target === t.v ? "border-primary bg-sidebar text-primary-foreground" : "hover:border-primary hover:text-primary"}`}><t.icon className="h-3.5 w-3.5" />{t.label}</button>
        ))}
      </div>
      <form onSubmit={submit} className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <Input aria-label="Describe your illness" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="e.g. sir dard aur bukhar, skin rash, knee pain…" className="h-11 min-w-0" />
        <Button type="submit" disabled={m.isPending || text.trim().length < 3} className="h-11 shrink-0"><Search className="h-4 w-4" /><span className="hidden sm:inline">Search</span></Button>
      </form>
      {m.isPending && <PremiumLoader label="Finding the right doctors for you…" />}
      {postQuery && <PostResults kind={postQuery.kind} q={postQuery.q} />}
      {r?.error && <p className="mt-3 text-sm text-destructive">{r.error}</p>}
      {r && !r.error && !m.isPending && (
        <div className="mt-3 space-y-2 text-sm">
          {r.urgent && <p className="flex gap-2 rounded-lg bg-destructive/10 p-2 font-semibold text-destructive"><AlertTriangle className="h-4 w-4 shrink-0" />This may be an emergency. Please go to the nearest hospital now.</p>}
          {r.advice && <p className="text-muted-foreground">{r.advice}</p>}
          {r.specializations.length > 0 && <p><span className="font-semibold">Suggested:</span> {r.specializations.join(", ")}</p>}
          {matched.length > 0 ? (
            <ul className="grid gap-1">
              {matched.map((d) => { const u = s.users.find((x) => x.id === d.userId); return (
                <li key={d.userId}><Link to="/patient/doctors/$id" params={{ id: d.userId }} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border px-3 py-2 hover:border-primary"><span className="min-w-0 truncate font-semibold">{u?.name ?? "Doctor"}</span><span className="shrink-0 text-xs text-muted-foreground">{d.specialization}</span></Link></li>
              ); })}
            </ul>
          ) : <p className="text-muted-foreground">No matching doctor is listed yet. <Link to="/patient/doctors" className="font-semibold text-primary">Browse all doctors</Link></p>}
          <p className="text-[11px] text-muted-foreground">This is a suggestion, not a diagnosis.</p>
        </div>
      )}
    </div>
  );
}
