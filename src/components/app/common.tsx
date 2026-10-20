import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AppointmentStatus, DocFile } from "@/lib/store";
import { FileText, Download, Video, Building2 } from "lucide-react";

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
  if (!docs.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-2">
      {docs.map((d) => (
        <li key={d.id} className="flex items-center gap-3 rounded-lg border bg-card p-2.5 text-sm">
          <FileText className="h-4 w-4 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{d.name}</p>
            <p className="text-xs text-muted-foreground">{d.kind} · by {d.uploadedBy} · {(d.size / 1024).toFixed(0)} KB</p>
          </div>
          <a href={d.url} download={d.name} target="_blank" rel="noreferrer" className="text-primary hover:text-primary-glow" aria-label={`Download ${d.name}`}>
            <Download className="h-4 w-4" />
          </a>
        </li>
      ))}
    </ul>
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
