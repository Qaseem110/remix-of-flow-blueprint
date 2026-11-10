import { useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { postLabMessage, useSession, useStore } from "@/lib/store";

/** Patient ↔ doctor conversation under a lab report. */
export function LabDiscussion({ orderId }: { orderId: string }) {
  const me = useSession();
  const msgs = useStore((s) => s.labMessages.filter((m) => m.orderId === orderId)).sort((a, b) => a.at.localeCompare(b.at));
  const users = useStore((s) => s.users);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try { await postLabMessage(orderId, text); setText(""); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="w-full space-y-2 rounded-xl bg-muted/60 p-3">
      <p className="flex items-center gap-1 text-sm font-medium"><MessageSquare className="h-4 w-4" />Discussion</p>
      {msgs.length === 0 && <p className="text-xs text-muted-foreground">No messages yet.</p>}
      {msgs.map((m) => {
        const u = users.find((x) => x.id === m.authorId);
        const mine = m.authorId === me?.id;
        return (
          <div key={m.id} className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${mine ? "ml-auto bg-primary text-primary-foreground" : "bg-card"}`}>
            <p className="text-xs opacity-75">{mine ? "You" : u?.name ?? "User"} · {format(new Date(m.at), "d MMM, h:mm a")}</p>
            <p className="whitespace-pre-wrap">{m.body}</p>
          </div>
        );
      })}
      <div className="flex gap-2">
        <Textarea rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask a question or add a note…" className="min-h-9 bg-card" />
        <Button size="sm" disabled={busy || !text.trim()} onClick={send}>Send</Button>
      </div>
    </div>
  );
}
