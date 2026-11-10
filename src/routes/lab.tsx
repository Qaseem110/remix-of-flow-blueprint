import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";

export const Route = createFileRoute("/lab")({
  component: () => <AppShell role="lab"><Outlet /></AppShell>,
});
