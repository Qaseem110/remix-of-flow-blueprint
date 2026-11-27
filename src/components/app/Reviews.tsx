import { useState } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addReview, doctorRating, REVIEW_ASPECTS, REVIEW_TAGS, REVIEW_WAITS, useStore, type Review, type ReviewAspect, type ReviewWait } from "@/lib/store";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { cn } from "@/lib/utils";

export function Stars({ value, onChange, size = "h-4 w-4" }: { value: number; onChange?: (v: number) => void; size?: string }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" disabled={!onChange} onClick={() => onChange?.(i)} aria-label={`${i} stars`} className={cn(!onChange && "cursor-default")}>
          <Star className={cn(size, i <= Math.round(value) ? "fill-accent text-accent" : "text-muted-foreground/40")} />
        </button>
      ))}
    </div>
  );
}

export function RatingSummary({ doctorId, className }: { doctorId: string; className?: string }) {
  const r = useStore((s) => doctorRating(doctorId, s));
  if (!r.count) return <span className={cn("text-xs opacity-75", className)}>No reviews yet</span>;
  return <span className={cn("flex items-center gap-1 text-sm", className)}><Star className="h-4 w-4 fill-accent text-accent" />{r.avg} <span className="opacity-75">({r.count})</span></span>;
}

const chip = (on: boolean) => cn("rounded-full border px-3 py-1.5 text-xs font-semibold transition", on ? "border-primary bg-sidebar text-primary-foreground" : "hover:border-primary hover:text-primary");

function ReviewDetails({ r }: { r: Review }) {
  return (
    <div className="mt-2 space-y-1.5 text-xs">
      {r.aspects && <div className="grid gap-1 sm:grid-cols-2">{Object.entries(r.aspects).map(([k, v]) => <div key={k} className="flex items-center justify-between gap-2"><span className="text-muted-foreground">{k}</span><Stars value={v ?? 0} size="h-3 w-3" /></div>)}</div>}
      <div className="flex flex-wrap gap-1">
        {r.recommend !== undefined && <span className={cn("rounded-full px-2 py-0.5 font-semibold", r.recommend ? "bg-secondary text-success" : "bg-destructive/10 text-destructive")}>{r.recommend ? "Recommends" : "Doesn't recommend"}</span>}
        {r.waitTime && <span className="rounded-full bg-muted px-2 py-0.5">Wait: {r.waitTime}</span>}
        {r.tags?.map((t) => <span key={t} className="rounded-full border px-2 py-0.5">{t}</span>)}
      </div>
    </div>
  );
}

export function ReviewForm({ appointmentId }: { appointmentId: string }) {
  const existing = useStore((s) => s.reviews.find((r) => r.appointmentId === appointmentId));
  const [rating, setRating] = useState(0);
  const [aspects, setAspects] = useState<Partial<Record<ReviewAspect, number>>>({});
  const [waitTime, setWaitTime] = useState<ReviewWait | undefined>();
  const [recommend, setRecommend] = useState<boolean | undefined>();
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  if (existing) return (
    <div className="rounded-2xl border bg-card p-5"><h2 className="font-semibold">Your review</h2><div className="mt-2"><Stars value={existing.rating} /></div><ReviewDetails r={existing} />{existing.comment && <p className="mt-2 text-sm text-muted-foreground">{existing.comment}</p>}</div>
  );
  const answered = REVIEW_ASPECTS.every((a) => aspects[a]) && waitTime && recommend !== undefined;
  return (
    <div className="space-y-5 rounded-2xl border bg-card p-5">
      <div><h2 className="font-semibold">Rate your visit</h2><p className="text-xs text-muted-foreground">Just tap — no typing needed.</p></div>
      <div><p className="text-sm font-semibold">Overall experience</p><div className="mt-1"><Stars value={rating} onChange={setRating} size="h-7 w-7" /></div></div>
      <div className="space-y-2">
        <p className="text-sm font-semibold">How was the doctor on…</p>
        {REVIEW_ASPECTS.map((a) => <div key={a} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg bg-muted/50 px-3 py-2"><span className="min-w-0 text-sm">{a}</span><Stars value={aspects[a] ?? 0} onChange={(v) => setAspects((p) => ({ ...p, [a]: v }))} size="h-5 w-5" /></div>)}
      </div>
      <div><p className="text-sm font-semibold">How long did you wait?</p><div className="mt-2 flex flex-wrap gap-1.5">{REVIEW_WAITS.map((w) => <button key={w} type="button" className={chip(waitTime === w)} onClick={() => setWaitTime(w)}>{w}</button>)}</div></div>
      <div><p className="text-sm font-semibold">Would you recommend this doctor?</p><div className="mt-2 flex gap-2"><button type="button" className={cn(chip(recommend === true), "flex items-center gap-1")} onClick={() => setRecommend(true)}><ThumbsUp className="h-3.5 w-3.5" />Yes</button><button type="button" className={cn(chip(recommend === false), "flex items-center gap-1")} onClick={() => setRecommend(false)}><ThumbsDown className="h-3.5 w-3.5" />No</button></div></div>
      <div><p className="text-sm font-semibold">Anything that stood out? <span className="font-normal text-muted-foreground">(pick any)</span></p><div className="mt-2 flex flex-wrap gap-1.5">{REVIEW_TAGS.map((t) => <button key={t} type="button" aria-pressed={tags.includes(t)} className={chip(tags.includes(t))} onClick={() => setTags((p) => p.includes(t) ? p.filter((x) => x !== t) : [...p, t])}>{t}</button>)}</div></div>
      <Textarea rows={2} placeholder="Anything else? (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
      <Button className="w-full" disabled={!rating || !answered} onClick={() => { try { addReview({ appointmentId, rating, comment, aspects, waitTime, recommend, tags }); toast.success("Thanks for your review"); } catch (e) { toast.error((e as Error).message); } }}>{!rating || !answered ? "Answer all questions to submit" : "Submit review"}</Button>
    </div>
  );
}

export function ReviewList({ doctorId }: { doctorId: string }) {
  const s = useStore((x) => x);
  const list = s.reviews.filter((r) => r.doctorId === doctorId);
  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Patient reviews</h2><RatingSummary doctorId={doctorId} /></div>
      {list.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No reviews yet.</p>}
      <div className="mt-3 space-y-3">
        {list.map((r) => (
          <div key={r.id} className="border-t pt-3 text-sm">
            <div className="flex items-center justify-between"><span className="font-medium">{s.users.find((u) => u.id === r.patientId)?.name.split(" ")[0]}</span><span className="text-xs text-muted-foreground">{format(new Date(r.at), "d MMM yyyy")}</span></div>
            <Stars value={r.rating} />
            <ReviewDetails r={r} />
            {r.comment && <p className="mt-1 text-muted-foreground">{r.comment}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
