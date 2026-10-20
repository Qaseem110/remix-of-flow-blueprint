import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/common";
import { PatientHistory } from "@/components/app/PatientHistory";
import { useStore } from "@/lib/store";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/doctor/patients/$id")({
  head: () => meta("Patient history", "Patient details, consultation history and documents."),
  component: () => {
    const { id } = Route.useParams();
    const u = useStore((s) => s.users.find((x) => x.id === id));
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title={u?.name ?? "Patient"} subtitle="Patient details & history" />
        <div className="rounded-2xl border bg-card p-6"><PatientHistory patientId={id} /></div>
      </div>
    );
  },
});
