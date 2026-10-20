import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { DocList, StatusBadge } from "@/components/app/common";
import { VideoRoom } from "@/components/app/widgets";
import { addAppointmentDocs, canJoin, joinOnline, makeDocs, useSession, useStore } from "@/lib/store";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/patient/consultation/$id")({
  head: () => meta("Video consultation", "Your appointment-linked video consultation room."),
  component: PatientRoom,
});

function PatientRoom() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const user = useSession()!;
  const a = useStore((s) => s.appointments.find((x) => x.id === id));
  const doc = useStore((s) => s.users.find((x) => x.id === a?.doctorId));
  useEffect(() => { if (a && canJoin(a) && a.patientId === user.id) joinOnline(a.id); }, [a?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (a?.status === "Completed") { toast.success("Consultation completed"); navigate({ to: "/patient/records" }); }
  }, [a?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!a || !doc || a.patientId !== user.id) return <p>Consultation not found.</p>;
  if (a.type !== "online") return <p>This is an in-clinic appointment.</p>;
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center justify-between"><h1 className="text-2xl font-semibold">Consultation with {doc.name}</h1><StatusBadge status={a.status} /></div>
      <VideoRoom roomId={a.id} selfName={user.name} otherName={doc.name} onLeave={() => navigate({ to: "/patient/appointments/$id", params: { id: a.id } })} />
      <div className="mt-4 rounded-2xl border bg-card p-5">
        <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Share reports with the doctor</h2>
          <label className="flex cursor-pointer items-center gap-1 text-sm text-primary"><Upload className="h-4 w-4" />Upload<input type="file" multiple className="hidden" onChange={(e) => { try { addAppointmentDocs(a.id, makeDocs(e.target.files ?? [], "patient")); } catch (err) { toast.error((err as Error).message); } }} /></label>
        </div>
        <DocList docs={a.documents} />
      </div>
    </div>
  );
}
