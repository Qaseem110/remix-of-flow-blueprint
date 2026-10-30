import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AppointmentStatus, DocFile } from "@/lib/store";
import { FileText, Download, Video, Building2, Eye, Trash2 } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStore, deleteDocument } from "@/lib/store";
import { toast } from "sonner";

const statusStyle: Record<AppointmentStatus, string> = {
  Pending: "bg-muted text-muted-foreground",
  Confirmed: "bg-secondary text-secondary-foreground",
  "Checked-In": "bg-info/15 text-info",
  Waiting: "bg-warning/25 text-warning-foreground",
  "Ready to Join": "bg-accent text-accent-foreground",
  "In Consultation": "bg-primary text-primary-foreground",
  Completed: "bg-success/15 text-success",
  Cancelled: "bg-destructive/12 text-destructive",
  "No Show": "bg-destructive/12 text-destructive",
  Rescheduled: "bg-muted text-muted-foreground line-through",
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  return <Badge variant="outline" className={cn("border-transparent font-medium", statusStyle[status])}>{status}</Badge>;
}

export function TypeBadge({ type }: { type: "online" | "clinic" }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
      {type === "online" ? <Video className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
      {type === "online" ? "Online" : "In-Clinic"}
    </span>
  );
}

export function Initials({ name, className }: { name: string; className?: string }) {
  const init = name.replace(/^Dr\.?\s*/, "").split(" ").map((p) => p[0]).slice(0, 2).join("");
  return <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary font-display text-lg font-semibold text-secondary-foreground", className)}>{init}</div>;
}

export function Avatar({ name, src, className }: { name: string; src?: string; className?: string }) {
  if (src) return <img src={src} alt={name} className={cn("h-12 w-12 shrink-0 rounded-full object-cover", className)} />;
  return <Initials name={name} className={className} />;
}

export function DocList({ docs, empty = "No documents" }: { docs: DocFile[]; empty?: string }) {
  const s = useStore((s) => s);
  const [preview, setPreview] = useState<DocFile | null>(null);
  if (!docs.length) return empty ? <p className="text-sm text-muted-foreground">{empty}</p> : null;
  const info = (d: DocFile) => {
    const c = s.consultations.find((c) => c.documents.some((x) => x.id === d.id));
    const a = s.appointments.find((a) => a.id === c?.appointmentId || a.documents.some((x) => x.id === d.id));
    const doctor = s.users.find((u) => u.id === (c?.doctorId ?? a?.doctorId));
    return { a, doctor, diagnosis: c?.diagnosis };
  };
  const me = s.users.find((u) => u.id === s.sessionUserId);
  const del = (d: DocFile) => {
    if (!confirm(`Delete "${d.title || d.name}"? This cannot be undone.`)) return;
    try { deleteDocument(d.id); toast.success("Report deleted"); } catch (e) { toast.error((e as Error).message); }
  };
  const isImg = (d: DocFile) => d.mime.startsWith("image/");
  const isPdf = (d: DocFile) => d.mime === "application/pdf" || d.name.toLowerCase().endsWith(".pdf");
  return (
    <>
      <ul className="space-y-2">
        {docs.map((d) => {
          const { a, doctor, diagnosis } = info(d);
          return (
            <li key={d.id} className="flex items-start gap-3 rounded-lg border bg-card p-3 text-sm">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="truncate font-medium">{d.title || d.name}</p>
                {d.title && <p className="truncate text-xs text-muted-foreground">{d.name}</p>}
                {d.reportDate && <p className="text-xs"><span className="text-muted-foreground">Report date:</span> {format(new Date(d.reportDate + "T00:00:00"), "d MMM yyyy")}</p>}
                <p className="text-xs text-muted-foreground">
                  <Badge variant="outline" className="mr-1 px-1.5 py-0 text-[10px]">{d.kind}</Badge>
                  Uploaded by {d.uploadedBy === "patient" ? "patient" : d.uploadedBy === "doctor" ? "doctor" : d.uploadedBy}
                  {d.uploadedAt && <> · {format(new Date(d.uploadedAt), "d MMM yyyy, h:mm a")}</>} · {(d.size / 1024).toFixed(0)} KB
                </p>
                {doctor && <p className="text-xs"><span className="text-muted-foreground">Doctor:</span> {doctor.name}{a && <span className="text-muted-foreground"> · Visit {a.date} {a.time} ({a.id})</span>}</p>}
                {a?.reason && <p className="text-xs"><span className="text-muted-foreground">Reason:</span> {a.reason}</p>}
                {diagnosis && <p className="text-xs"><span className="text-muted-foreground">Diagnosis:</span> {diagnosis}</p>}
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => setPreview(d)} className="text-primary hover:text-primary-glow" aria-label={`Preview ${d.name}`}><Eye className="h-4 w-4" /></button>
                <a href={d.url} download={d.name} target="_blank" rel="noreferrer" className="text-primary hover:text-primary-glow" aria-label={`Download ${d.name}`}><Download className="h-4 w-4" /></a>
                {me?.role === d.uploadedBy && <button type="button" onClick={() => del(d)} className="text-destructive hover:opacity-80" aria-label={`Delete ${d.name}`}><Trash2 className="h-4 w-4" /></button>}
              </div>
            </li>
          );
        })}
      </ul>
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle className="truncate pr-6">{preview?.name}</DialogTitle></DialogHeader>
          {preview && (isImg(preview) ? <img src={preview.url} alt={preview.name} className="max-h-[75vh] w-full rounded-md object-contain" />
            : isPdf(preview) ? <iframe src={preview.url} title={preview.name} className="h-[75vh] w-full rounded-md border" />
            : <p className="text-sm text-muted-foreground">Preview is not available for this file type.</p>)}
          {preview && <a href={preview.url} target="_blank" rel="noreferrer" className="text-sm text-primary underline">Open in new tab</a>}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-soft">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-3xl font-semibold">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
