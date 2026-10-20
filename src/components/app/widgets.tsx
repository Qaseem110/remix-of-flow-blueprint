import { useEffect, useRef, useState } from "react";
import { addDays, format, parse } from "date-fns";
import { toast } from "sonner";
import { Mic, MicOff, PhoneOff, Video, VideoOff, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { cancelAppointment, getSlots, queueInfo, rescheduleAppointment, useStore, type Appointment, type Role } from "@/lib/store";

/** Date strip + auto-generated slots. Only available slots are selectable. */
export function SlotPicker({ doctorId, date, time, onDate, onTime }: { doctorId: string; date: string; time: string; onDate: (d: string) => void; onTime: (t: string) => void }) {
  const days = Array.from({ length: 14 }, (_, i) => format(addDays(new Date(), i), "yyyy-MM-dd"));
  const slots = useStore((s) => getSlots(doctorId, date, s));
  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {days.map((d) => {
          const dt = parse(d, "yyyy-MM-dd", new Date());
          const has = getSlots(doctorId, d).some((x) => x.available);
          return (
            <button key={d} type="button" disabled={!has} onClick={() => { onDate(d); onTime(""); }}
              className={cn("flex w-16 shrink-0 flex-col items-center rounded-xl border px-2 py-2 text-sm transition", d === date ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary", !has && "cursor-not-allowed opacity-40")}>
              <span className="text-xs uppercase">{format(dt, "EEE")}</span>
              <span className="font-display text-xl font-semibold">{format(dt, "d")}</span>
              <span className="text-[10px]">{format(dt, "MMM")}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
        {slots.length === 0 && <p className="col-span-full text-sm text-muted-foreground">No working hours on this day.</p>}
        {slots.map((s) => (
          <button key={s.time} type="button" disabled={!s.available} onClick={() => onTime(s.time)}
            className={cn("rounded-lg border py-2 text-sm font-medium transition", s.time === time ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary", !s.available && "cursor-not-allowed bg-muted text-muted-foreground line-through opacity-60")}>
            {s.time}
          </button>
        ))}
      </div>
    </div>
  );
}

export function RescheduleDialog({ appt, onDone, trigger }: { appt: Appointment; onDone?: (id: string) => void; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(appt.date);
  const [time, setTime] = useState("");
  const confirm = () => {
    try {
      const n = rescheduleAppointment(appt.id, date, time);
      toast.success(`Rescheduled — new ID ${n.id}`);
      setOpen(false);
      onDone?.(n.id);
    } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Reschedule {appt.id}</DialogTitle><DialogDescription>Only available slots are shown. Your current slot ({appt.date} {appt.time}) will be released.</DialogDescription></DialogHeader>
        <SlotPicker doctorId={appt.doctorId} date={date} time={time} onDate={setDate} onTime={setTime} />
        <DialogFooter><Button disabled={!time} onClick={confirm}>Confirm new slot</Button></DialogFooter>
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
        <DialogHeader><DialogTitle>Cancel {appt.id}?</DialogTitle><DialogDescription>The slot on {appt.date} at {appt.time} will become available to others.</DialogDescription></DialogHeader>
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

/** Appointment-linked consultation room (local camera preview; remote video is a placeholder until backend/WebRTC). */
const ICE: RTCConfiguration = { iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }] };

/**
 * Free 1:1 video call: browser-to-browser (WebRTC). Supabase Realtime is only used
 * to exchange connection details; audio/video never pass through any server.
 */
export function VideoRoom({ roomId, selfName, otherName, onLeave }: { roomId: string; selfName: string; otherName: string; onLeave: () => void }) {
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [connected, setConnected] = useState(false);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let local: MediaStream | null = null;
    let pc: RTCPeerConnection | null = null;
    let channel: { send: (m: unknown) => unknown; unsubscribe: () => unknown } | null = null;
    let sb: { removeChannel: (c: never) => unknown } | null = null;
    const me = Math.random().toString(36).slice(2);
    let repliedHello = false;
    const send = (event: string, payload: Record<string, unknown> = {}) => channel?.send({ type: "broadcast", event, payload: { ...payload, from: me } });

    const newPeer = () => {
      pc?.close();
      const p = new RTCPeerConnection(ICE);
      local?.getTracks().forEach((t) => p.addTrack(t, local!));
      if (!local) { p.addTransceiver("audio", { direction: "recvonly" }); p.addTransceiver("video", { direction: "recvonly" }); }
      p.onicecandidate = (e) => { if (e.candidate) send("ice", { candidate: e.candidate.toJSON() }); };
      p.ontrack = (e) => { if (remoteRef.current) remoteRef.current.srcObject = e.streams[0] ?? new MediaStream([e.track]); setConnected(true); };
      p.onconnectionstatechange = () => { if (["failed", "closed", "disconnected"].includes(p.connectionState)) setConnected(false); };
      pc = p;
      return p;
    };
    const makeOffer = async () => {
      const p = newPeer();
      await p.setLocalDescription(await p.createOffer());
      send("offer", { sdp: p.localDescription });
    };

    (async () => {
      try { local = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); }
      catch { toast.info("Camera/mic unavailable — you can still see and hear the other person"); }
      if (cancelled) { local?.getTracks().forEach((t) => t.stop()); return; }
      setStream(local);
      if (localRef.current && local) localRef.current.srcObject = local;

      const { supabase } = await import("@/lib/supabase");
      if (cancelled) return;
      sb = supabase as never;
      const ch = supabase.channel(`call-${roomId}`, { config: { broadcast: { self: false } } });
      ch.on("broadcast", { event: "hello" }, ({ payload }) => {
        if (payload.from > me) return void (repliedHello ? null : ((repliedHello = true), send("hello")));
        void makeOffer();
      });
      ch.on("broadcast", { event: "offer" }, async ({ payload }) => {
        const p = newPeer();
        await p.setRemoteDescription(payload.sdp);
        await p.setLocalDescription(await p.createAnswer());
        send("answer", { sdp: p.localDescription });
      });
      ch.on("broadcast", { event: "answer" }, async ({ payload }) => { if (pc && pc.signalingState === "have-local-offer") await pc.setRemoteDescription(payload.sdp); });
      ch.on("broadcast", { event: "ice" }, async ({ payload }) => { try { await pc?.addIceCandidate(payload.candidate); } catch { /* stale candidate */ } });
      ch.on("broadcast", { event: "bye" }, () => { pc?.close(); pc = null; setConnected(false); repliedHello = false; });
      ch.subscribe((status) => { if (status === "SUBSCRIBED") send("hello"); });
      channel = ch as never;
    })();

    return () => {
      cancelled = true;
      send("bye");
      pc?.close();
      local?.getTracks().forEach((t) => t.stop());
      if (channel && sb) sb.removeChannel(channel as never);
    };
  }, [roomId]);

  useEffect(() => { stream?.getAudioTracks().forEach((t) => (t.enabled = mic)); }, [mic, stream]);
  useEffect(() => { stream?.getVideoTracks().forEach((t) => (t.enabled = cam)); }, [cam, stream]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-sidebar">
      <video ref={remoteRef} autoPlay playsInline className={cn("absolute inset-0 h-full w-full object-cover", !connected && "hidden")} />
      {!connected && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-sidebar-foreground">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-sidebar-accent font-display text-3xl">{otherName.replace(/^Dr\.?\s*/, "")[0]}</div>
          <p className="mt-3 font-medium">{otherName}</p>
          <p className="text-xs opacity-60">Waiting for {otherName} to join…</p>
        </div>
      )}
      <video ref={localRef} autoPlay muted playsInline aria-label={selfName} className={cn("absolute bottom-4 right-4 h-28 w-40 rounded-xl bg-sidebar-accent object-cover", (!cam || !stream) && "opacity-0")} />
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
        <Button size="icon" variant="secondary" onClick={() => setMic(!mic)} aria-label="Toggle mic">{mic ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}</Button>
        <Button size="icon" variant="secondary" onClick={() => setCam(!cam)} aria-label="Toggle camera">{cam ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}</Button>
        <Button size="icon" variant="destructive" onClick={onLeave} aria-label="Leave"><PhoneOff className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}
