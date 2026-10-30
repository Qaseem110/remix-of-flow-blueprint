import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, CalendarDays, ClipboardList, HeartPulse, LayoutDashboard, LogOut, Search, Settings, ShieldCheck, Stethoscope, User, Users, Clock, Menu } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { setActiveMember, useActiveMember, logout, markAllRead, runReminders, useReady, useSession, useStore, type Role } from "@/lib/store";
import { formatDistanceToNow } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function AccountSwitcher({ userId, name }: { userId: string; name: string }) {
  const members = useStore((s) => s.patients.find((p) => p.userId === userId)?.members) ?? [];
  const active = useActiveMember();
  return (
    <Select value={active ?? "main"} onValueChange={(v) => setActiveMember(v === "main" ? null : v)}>
      <SelectTrigger className="h-9 w-48" aria-label="Switch account"><Users className="mr-1 h-4 w-4 text-primary" /><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="main">{name} (Me)</SelectItem>
        {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name} ({m.relation})</SelectItem>)}
        {members.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">Add family in Profile</div>}
      </SelectContent>
    </Select>
  );
}

const NAV: Record<Role, { to: string; label: string; icon: typeof LayoutDashboard }[]> = {
  patient: [
    { to: "/patient", label: "Dashboard", icon: LayoutDashboard },
    { to: "/patient/doctors", label: "Find Doctor", icon: Search },
    { to: "/patient/appointments", label: "My Appointments", icon: CalendarDays },
    { to: "/patient/records", label: "Health Records", icon: ClipboardList },
    { to: "/patient/profile", label: "Profile", icon: User },
  ],
  doctor: [
    { to: "/doctor", label: "Dashboard", icon: LayoutDashboard },
    { to: "/doctor/appointments", label: "Appointments", icon: CalendarDays },
    { to: "/doctor/availability", label: "Availability", icon: Clock },
    { to: "/doctor/profile", label: "Profile", icon: User },
  ],
  admin: [
    { to: "/admin", label: "Verification", icon: ShieldCheck },
    { to: "/admin/users", label: "Users & Doctors", icon: Users },
    { to: "/admin/appointments", label: "Appointments", icon: CalendarDays },
    { to: "/admin/settings", label: "Settings", icon: Settings },
  ],
};

function Notifications({ userId }: { userId: string }) {
  const items = useStore((s) => s.notifications.filter((n) => n.userId === userId));
  const unread = items.filter((n) => !n.read).length;
  return (
    <Popover onOpenChange={(o) => !o && markAllRead(userId)}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">{unread}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-4 py-3 font-display font-semibold">Notifications</div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 && <p className="p-4 text-sm text-muted-foreground">You're all caught up.</p>}
          {items.map((n) => (
            <Link key={n.id} to={n.link ?? "/"} className={`block border-b px-4 py-3 text-sm hover:bg-muted ${n.read ? "" : "bg-secondary/50"}`}>
              <p className="font-medium">{n.title}</p>
              <p className="text-muted-foreground">{n.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">{formatDistanceToNow(new Date(n.at))} ago</p>
            </Link>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SideNav({ role }: { role: Role }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV[role].map((n) => (
        <Link key={n.to} to={n.to} activeOptions={{ exact: n.to.split("/").length === 2 }}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          activeProps={{ className: "bg-sidebar-accent !text-sidebar-primary font-semibold" }}>
          <n.icon className="h-4 w-4" />{n.label}
        </Link>
      ))}
    </nav>
  );
}

export function AppShell({ role, children }: { role: Role; children: ReactNode }) {
  const user = useSession();
  const navigate = useNavigate();
  const ready = useReady();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (user?.role === "patient") runReminders(user.id);
  }, [user?.id, user?.role]);

  if (!mounted) return null;
  if (!ready) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  if (!user || user.role !== role) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <HeartPulse className="mx-auto h-10 w-10 text-primary" />
          <h1 className="mt-4 text-2xl font-semibold">Please sign in</h1>
          <p className="mt-2 text-muted-foreground">This area is for {role} accounts.</p>
          <Button asChild className="mt-6"><Link to="/login">Go to sign in</Link></Button>
        </div>
      </div>
    );
  }

  const brand = (
    <Link to="/" className="flex items-center gap-2 px-3 font-display text-xl font-semibold text-sidebar-foreground">
      <Stethoscope className="h-6 w-6 text-sidebar-primary" /> Sahoolat
    </Link>
  );
  const footer = (
    <div className="mt-auto border-t border-sidebar-border pt-4">
      <p className="px-3 text-sm font-medium text-sidebar-foreground">{user.name}</p>
      <p className="px-3 text-xs capitalize text-sidebar-foreground/60">{user.role}</p>
      <button onClick={() => { logout(); navigate({ to: "/login" }); }} className="mt-3 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent">
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 flex-col gap-6 bg-sidebar p-4 md:flex">{brand}<SideNav role={role} />{footer}</aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/85 px-4 backdrop-blur md:px-8">
          <Sheet>
            <SheetTrigger asChild><Button variant="ghost" size="icon" className="md:hidden" aria-label="Menu"><Menu className="h-5 w-5" /></Button></SheetTrigger>
            <SheetContent side="left" className="flex w-64 flex-col gap-6 bg-sidebar p-4">{brand}<SideNav role={role} />{footer}</SheetContent>
          </Sheet>
          <div className="hidden text-sm text-muted-foreground md:block">Welcome back, <span className="font-medium text-foreground">{user.name}</span></div>
          <div className="flex items-center gap-2">{role === "patient" && <AccountSwitcher userId={user.id} name={user.name} />}<Notifications userId={user.id} /></div>
        </header>
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
