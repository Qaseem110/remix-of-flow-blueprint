import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createCallPeer } from "@/lib/call-peer";
import { addDays, format, parse } from "date-fns";
import { toast } from "sonner";
import { Mic, MicOff, PhoneOff, Video, VideoOff, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn, fmtTime } from "@/lib/utils";
import { cancelAppointment, nextBooking, queueInfo, rescheduleAppointment, useStore, type Appointment, type Role } from "@/lib/store";

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

/** Free peer-to-peer video; signaling stays on the appointment's shared room. */
/** Free, no-account relays so calls can connect across strict networks. */
const STUN_ONLY: RTCConfiguration = { iceServers: [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  { urls: ["turn:freestun.net:3478", "turn:freestun.net:3478?transport=tcp"], username: "free", credential: "free" },
  { urls: ["turn:openrelay.metered.ca:80", "turn:openrelay.metered.ca:443", "turn:openrelay.metered.ca:443?transport=tcp"], username: "openrelayproject", credential: "openrelayproject" },
] };
let iceCache: Promise<RTCConfiguration> | null = null;
/** Fetches relay (TURN) servers once per session so strict networks can still connect. */
function loadIce(): Promise<RTCConfiguration> {
  if (!iceCache) {
    iceCache = import("@/lib/turn.functions")
      .then(({ getIceServers }) => getIceServers())
      .then((r) => ({ iceServers: r.iceServers as RTCIceServer[] }))
      .catch(() => { iceCache = null; return STUN_ONLY; });
  }
  return iceCache;
}

export function VideoRoom({ roomId, selfName, otherName, onLeave }: { roomId: string; selfName: string; otherName: string; onLeave: () => void }) {
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("Starting camera and microphone…");
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let failed = false;
    let local: MediaStream | null = null;
    let pc: RTCPeerConnection | null = null;
    let ice: RTCConfiguration = STUN_ONLY;
    let channel: RealtimeChannel | null = null;
    let handshake: ReturnType<typeof createCallPeer> | null = null;
    let remoteId: string | null = null;
    let helloTimer: ReturnType<typeof setInterval> | undefined;
    let connectionTimer: ReturnType<typeof setTimeout> | undefined;
    const me = crypto.randomUUID();
    const fail = (message: string) => {
      if (cancelled) return;
      failed = true;
      setConnected(false);
      setError(true);
      setStatus(message);
      clearInterval(helloTimer);
      clearTimeout(connectionTimer);
    };
    const send = (event: string, payload: Record<string, unknown> = {}) => {
      if (!channel) return;
      void channel.send({ type: "broadcast", event, payload: { ...payload, from: me, to: remoteId } })
        .then((result) => { if (!cancelled && result !== "ok") fail("Call messages could not be delivered. Please retry."); });
    };
    const run = (promise: Promise<void> | undefined) => {
      void promise?.catch(() => fail("The video connection could not be established. Please retry."));
    };
    const ensurePeer = () => {
      if (handshake) return handshake;
      const p = new RTCPeerConnection(ice);
      const media = local;
      if (media) media.getTracks().forEach((track) => p.addTrack(track, media));
      else { p.addTransceiver("audio", { direction: "recvonly" }); p.addTransceiver("video", { direction: "recvonly" }); }
      const incoming = new MediaStream();
      p.onicecandidate = (event) => { if (event.candidate) send("ice", { candidate: event.candidate.toJSON() }); };
      p.ontrack = (event) => {
        incoming.addTrack(event.track);
        if (remoteRef.current) {
          remoteRef.current.srcObject = incoming;
          void remoteRef.current.play().catch(() => {});
        }
      };
      p.onconnectionstatechange = () => {
        if (cancelled) return;
        if (p.connectionState === "connected") {
          clearTimeout(connectionTimer);
          setConnected(true);
          setError(false);
          setStatus("Connected");
        } else if (p.connectionState === "failed") {
          fail("The video connection failed. Please tap Retry connection.");
        } else if (p.connectionState === "disconnected") {
          setConnected(false);
          setStatus("Connection interrupted — reconnecting…");
        }
      };
      pc = p;
      handshake = createCallPeer(p, send);
      setStatus("Connecting video and audio…");
      connectionTimer = setTimeout(() => fail("The connection timed out. Try another network, then retry."), 30000);
      return handshake;
    };
    const accepts = (payload: { from?: string; to?: string | null }) =>
      !cancelled && !failed && payload.from && payload.from !== me && (!payload.to || payload.to === me) && (!remoteId || remoteId === payload.from);

    setConnected(false);
    setError(false);
    setStatus("Starting camera and microphone…");
    void (async () => {
      try {
        try { local = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); }
        catch { toast.info("Camera/mic unavailable — allow access to speak and share video."); }
        if (cancelled) { local?.getTracks().forEach((track) => track.stop()); return; }
        setStream(local);
        if (localRef.current) localRef.current.srcObject = local;
        ice = await loadIce();
        const { supabase } = await import("@/lib/supabase");
        if (cancelled) return;
        channel = supabase.channel(`call-${roomId}`, { config: { broadcast: { self: false, ack: true } } });
        channel.on("broadcast", { event: "hello" }, ({ payload }) => {
          if (!accepts(payload)) return;
          const first = !remoteId;
          remoteId = payload.from;
          if (first) send("hello");
          // Exactly one caller offers, regardless of who joined first.
          if (me < payload.from) run(ensurePeer().offer());
        });
        channel.on("broadcast", { event: "offer" }, ({ payload }) => {
          if (!accepts(payload)) return;
          remoteId = payload.from;
          run(ensurePeer().receiveOffer(payload.sdp));
        });
        channel.on("broadcast", { event: "answer" }, ({ payload }) => {
          if (accepts(payload)) run(handshake?.receiveAnswer(payload.sdp));
        });
        channel.on("broadcast", { event: "ice" }, ({ payload }) => {
          if (!accepts(payload)) return;
          remoteId = payload.from;
          run(ensurePeer().receiveIce(payload.candidate));
        });
        channel.on("broadcast", { event: "bye" }, ({ payload }) => {
          if (!accepts(payload)) return;
          pc?.close(); pc = null; handshake = null; remoteId = null;
          clearTimeout(connectionTimer);
          setConnected(false);
          if (remoteRef.current) remoteRef.current.srcObject = null;
          setStatus("The other person left the call. Waiting for them to rejoin…");
        });
        channel.subscribe((state) => {
          if (cancelled) return;
          if (state === "SUBSCRIBED") {
            setStatus("Waiting for the other person to join…");
            send("hello");
            clearInterval(helloTimer);
            helloTimer = setInterval(() => send("hello"), 3000);
          } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") {
            fail("The call service is unavailable. Check your internet connection and retry.");
          }
        });
      } catch { fail("The call could not start. Please retry."); }
    })();
    return () => {
      send("bye");
      cancelled = true;
      clearInterval(helloTimer);
      clearTimeout(connectionTimer);
      pc?.close();
      local?.getTracks().forEach((track) => track.stop());
      if (channel) void channel.unsubscribe();
    };
  }, [roomId, attempt]);

  useEffect(() => { stream?.getAudioTracks().forEach((t) => (t.enabled = mic)); }, [mic, stream]);
  useEffect(() => { stream?.getVideoTracks().forEach((t) => (t.enabled = cam)); }, [cam, stream]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-sidebar">
      <video ref={remoteRef} autoPlay playsInline className={cn("absolute inset-0 h-full w-full object-cover", !connected && "hidden")} />
      {!connected && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-sidebar-foreground">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-sidebar-accent font-display text-3xl">{otherName.replace(/^Dr\.?\s*/, "")[0]}</div>
          <p className="mt-3 font-medium">{otherName}</p>
          <p role="status" className="mt-1 max-w-sm px-4 text-center text-xs opacity-80">{status}</p>
          {error && <Button variant="secondary" className="mt-3" onClick={() => setAttempt((value) => value + 1)}>Retry connection</Button>}
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
