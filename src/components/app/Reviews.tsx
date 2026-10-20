import { useState } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addReview, doctorRating, useStore } from "@/lib/store";
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

export function ReviewForm({ appointmentId }: { appointmentId: string }) {
  const existing = useStore((s) => s.reviews.find((r) => r.appointmentId === appointmentId));
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  if (existing) return (
    <div className="rounded-2xl border bg-card p-5"><h2 className="font-semibold">Your review</h2><div className="mt-2"><Stars value={existing.rating} /></div>{existing.comment && <p className="mt-2 text-sm text-muted-foreground">{existing.comment}</p>}</div>
  );
  return (
    <div className="rounded-2xl border bg-card p-5">
      <h2 className="font-semibold">Rate your visit</h2>
      <div className="mt-2"><Stars value={rating} onChange={setRating} size="h-6 w-6" /></div>
      <Textarea className="mt-3" rows={3} placeholder="Share your experience (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
      <Button className="mt-3" disabled={!rating} onClick={() => { try { addReview({ appointmentId, rating, comment }); toast.success("Thanks for your review"); } catch (e) { toast.error((e as Error).message); } }}>Submit review</Button>
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
            {r.comment && <p className="mt-1 text-muted-foreground">{r.comment}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
