import { useEffect, useMemo, useState } from "react";
import { addDays, format, parse } from "date-fns";
import { toast } from "sonner";
import { PhoneOff, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn, fmtTime } from "@/lib/utils";
import { cancelAppointment, nextBooking, queueInfo, rescheduleAppointment, uploadCallRecording, useStore, type Appointment, type Role } from "@/lib/store";

/** Date strip + auto-generated slots. Only available slots are selectable. */
export function BookingDatePicker({ doctorId, date, onDate, excludeId }: { doctorId: string; date: string; onDate: (d: string) => void; excludeId?: string }) {
  const days = Array.from({ length: 14 }, (_, i) => format(addDays(new Date(), i), "yyyy-MM-dd"));
  const state = useStore((s) => s);
  const s = excludeId ? { ...state, appointments: state.appointments.filter((a) => a.id !== excludeId) } : state;
  const allocation = nextBooking(doctorId, date, s);
  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {days.map((d) => {
          const dt = parse(d, "yyyy-MM-dd", new Date());
          const has = !!nextBooking(doctorId, d, s);
          return (
            <Button key={d} type="button" variant="outline" disabled={!has} onClick={() => onDate(d)}
              className={cn("flex h-auto w-16 shrink-0 flex-col items-center rounded-lg border px-2 py-2 text-sm transition", d === date ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary", !has && "cursor-not-allowed opacity-40")}>
              <span className="text-xs uppercase">{format(dt, "EEE")}</span>
              <span className="font-display text-xl font-semibold">{format(dt, "d")}</span>
              <span className="text-[10px]">{format(dt, "MMM")}</span>
            </Button>
          );
        })}
      </div>
      <div className="mt-4 border-t pt-4">
        {allocation ? <dl className="grid grid-cols-2 gap-3"><div><dt className="text-xs text-muted-foreground">Next queue number</dt><dd className="text-xl font-semibold">#{allocation.queueNumber}</dd></div><div><dt className="text-xs text-muted-foreground">Estimated time</dt><dd className="text-xl font-semibold">{fmtTime(allocation.time)}</dd></div></dl> : <p className="text-sm text-muted-foreground">No places available on this day.</p>}
      </div>
    </div>
  );
}

export function RescheduleDialog({ appt, onDone, trigger }: { appt: Appointment; onDone?: (id: string) => void; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(appt.date);
  const [busy, setBusy] = useState(false);
  const available = useStore((s) => !!nextBooking(appt.doctorId, date, { ...s, appointments: s.appointments.filter((a) => a.id !== appt.id) }));
  const confirm = async () => {
    setBusy(true);
    try {
      const n = await rescheduleAppointment(appt.id, date);
      toast.success(`Rescheduled — new ID ${n.id}`);
      setOpen(false);
      onDone?.(n.id);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Reschedule {appt.id}</DialogTitle><DialogDescription>Current appointment: {appt.date} at {fmtTime(appt.time)}.</DialogDescription></DialogHeader>
        <BookingDatePicker doctorId={appt.doctorId} date={date} onDate={setDate} excludeId={appt.id} />
        <DialogFooter><Button disabled={!available || busy} onClick={confirm}>{busy ? "Saving…" : "Confirm new date"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CancelDialog({ appt, by, trigger }: { appt: Appointment; by: Role; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Cancel {appt.id}?</DialogTitle><DialogDescription>The slot on {appt.date} at {fmtTime(appt.time)} will become available to others.</DialogDescription></DialogHeader>
        <Textarea placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Keep</Button>
          <Button variant="destructive" onClick={() => { cancelAppointment(appt.id, by, reason); toast.success("Appointment cancelled"); setOpen(false); }}>Cancel appointment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function QueueCard({ appointmentId }: { appointmentId: string }) {
  const q = useStore((s) => queueInfo(appointmentId, s));
  const a = useStore((s) => s.appointments.find((x) => x.id === appointmentId));
  if (!q || !a) return null;
  const awaitingCheckIn = a.type === "clinic" && a.status === "Confirmed";
  return (
    <div className="rounded-2xl bg-hero p-5 text-primary-foreground">
      <div className="flex items-center gap-2 text-sm opacity-80"><ListOrdered className="h-4 w-4" /> {q.queueActive ? "Queue active" : `Queue opens on ${a.date}`}</div>
      <div className="mt-3 grid grid-cols-3 gap-3 text-center">
        <div><p className="text-xs opacity-75">Your number</p><p className="font-display text-4xl font-semibold">{q.myNumber}</p></div>
        <div><p className="text-xs opacity-75">Now serving</p><p className="font-display text-4xl font-semibold">{q.queueActive ? q.currentNumber || "—" : "—"}</p></div>
        <div><p className="text-xs opacity-75">Ahead</p><p className="font-display text-4xl font-semibold">{q.queueActive && !awaitingCheckIn ? q.ahead : "—"}</p></div>
      </div>
      {awaitingCheckIn && q.queueActive && <p className="mt-3 rounded-lg bg-primary-foreground/10 p-2 text-center text-sm">Check in at the clinic to enter the active queue.</p>}
      {a.status === "In Consultation" && <p className="mt-3 rounded-lg bg-accent p-2 text-center text-sm font-medium text-accent-foreground">It's your turn — you're in consultation.</p>}
    </div>
  );
}

/** Video consultation via VDO.Ninja (free, no account, own relay servers). Each side's voice is recorded for the admin case file. */
export function VideoRoom({ roomId, selfName, onLeave }: { roomId: string; selfName: string; otherName: string; onLeave: () => void }) {
  const src = useMemo(() => {
    const room = `sahoolat${roomId.replace(/[^a-zA-Z0-9]/g, "")}`.slice(0, 40);
    const pw = room.split("").reverse().join("");
    return `https://vdo.ninja/?room=${room}&password=${pw}&label=${encodeURIComponent(selfName)}&webcam&autostart&quality=1&maxvideobitrate=800`;
    // Fixed per room: changing src would reload the call and drop it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);
  const recording = useCallRecorder(roomId);
  return (
    <div className="space-y-2">
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-sidebar">
        <iframe key={roomId} title="Video consultation" src={src} allow="camera; microphone; autoplay; fullscreen; display-capture; speaker-selection" className="absolute inset-0 h-full w-full border-0" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{recording ? "● This consultation's audio is being recorded for the medical case file." : "Audio recording unavailable (microphone not allowed)."}</p>
        <Button variant="destructive" size="sm" onClick={onLeave}><PhoneOff className="mr-1 h-4 w-4" />Leave</Button>
      </div>
    </div>
  );
}

/** Records this participant's microphone in 2-minute segments and uploads each, so a dropped tab loses little. */
function useCallRecorder(appointmentId: string) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let rec: MediaRecorder | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    const segment = () => {
      if (!stream || stopped) return;
      const chunks: Blob[] = [];
      const startedAt = new Date().toISOString();
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      r.onstop = () => {
        const blob = new Blob(chunks, { type: r.mimeType || "audio/webm" });
        void uploadCallRecording(appointmentId, blob, startedAt).catch(() => {});
      };
      r.start(1000);
      rec = r;
    };
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        setActive(true);
        segment();
        timer = setInterval(() => { rec?.stop(); segment(); }, 120000);
      } catch { setActive(false); }
    })();
    const flush = () => { if (rec?.state === "recording") rec.stop(); };
    window.addEventListener("pagehide", flush);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("pagehide", flush);
      flush();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [appointmentId]);
  return active;
}
