import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";

export const Route = createFileRoute("/pharmacy")({
  component: () => <AppShell role="pharmacy"><Outlet /></AppShell>,
});
