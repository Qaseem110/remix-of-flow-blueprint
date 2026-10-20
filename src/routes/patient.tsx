import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";

export const Route = createFileRoute("/patient")({
  component: () => <AppShell role="patient"><Outlet /></AppShell>,
});
