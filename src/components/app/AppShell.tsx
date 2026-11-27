import { BrandLogo } from "@/components/app/BrandLogo";
import { MessagesSquare } from "lucide-react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Bell, CalendarDays, ClipboardList, HeartPulse, LayoutDashboard, LogOut, Search, Settings, ShieldCheck, Stethoscope, User, Users, Clock, Menu, Pill, Store , FolderOpen, FlaskConical, HeartHandshake } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { setActiveMember, useActiveMember, logout, markAllRead, runReminders, runMedicineReminders, useReady, useSession, useStore, type Role } from "@/lib/store";
import { formatDistanceToNow } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { navUrdu } from "./AccountPreferences";

function AccountSwitcher({ userId, name }: { userId: string; name: string }) {
  const members = useStore((s) => s.patients.find((p) => p.userId === userId)?.members) ?? [];
  const active = useActiveMember();
  return (
    <Select value={active ?? "main"} onValueChange={(v) => setActiveMember(v === "main" ? null : v)}>
      <SelectTrigger className="h-9 w-36 sm:w-44 lg:w-48" aria-label="Switch account"><Users className="mr-1 h-4 w-4 text-primary" /><SelectValue /></SelectTrigger>
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
    { to: "/patient/care", label: "Care services", icon: HeartPulse },
    { to: "/patient", label: "Dashboard", icon: LayoutDashboard },
    { to: "/patient/doctors", label: "Find Doctor", icon: Search },
    { to: "/patient/appointments", label: "My Appointments", icon: CalendarDays },
    { to: "/patient/records", label: "Health Records", icon: ClipboardList },
    { to: "/patient/medicines", label: "Find Medicine", icon: Pill },
    { to: "/patient/labs", label: "Lab Tests", icon: FlaskConical },
    { to: "/patient/free-checkups", label: "Free Checkups", icon: HeartHandshake },
    { to: "/discussions", label: "Discussions", icon: MessagesSquare },
    { to: "/patient/profile", label: "Profile", icon: User },
  ],
  doctor: [
    { to: "/doctor/care", label: "Care services", icon: HeartPulse },
    { to: "/doctor", label: "Dashboard", icon: LayoutDashboard },
    { to: "/doctor/appointments", label: "Appointments", icon: CalendarDays },
    { to: "/doctor/availability", label: "Availability", icon: Clock },
    { to: "/doctor/labs", label: "Lab Reports", icon: FlaskConical },
    { to: "/doctor/reception", label: "Reception", icon: Users },
    { to: "/doctor/volunteer", label: "Volunteer", icon: HeartHandshake },
    { to: "/discussions", label: "Discussions", icon: MessagesSquare },
    { to: "/doctor/profile", label: "Profile", icon: User },
  ],
  receptionist: [
    { to: "/reception/care", label: "Help & activity", icon: HeartPulse },
    { to: "/reception", label: "Book & Queue", icon: CalendarDays },
  ],
  pharmacy: [
    { to: "/pharmacy/care", label: "Requests & credentials", icon: HeartPulse },
    { to: "/pharmacy", label: "My Medicines", icon: Pill },
    { to: "/pharmacy/store", label: "Store Details", icon: Store },
  ],
  lab: [
    { to: "/lab/care", label: "Services & credentials", icon: HeartPulse },
    { to: "/lab", label: "Test Requests", icon: FlaskConical },
    { to: "/lab/availability", label: "Availability", icon: Clock },
    { to: "/lab/details", label: "Lab Details", icon: Store },
  ],
  admin: [
    { to: "/admin/operations", label: "Operations & privacy", icon: ClipboardList },
    { to: "/admin/care", label: "Care management", icon: HeartPulse },
    { to: "/admin", label: "Verification", icon: ShieldCheck },
    { to: "/admin/users", label: "Users & Doctors", icon: Users },
    { to: "/admin/appointments", label: "Appointments", icon: CalendarDays },
    { to: "/admin/cases", label: "Case files", icon: FolderOpen },
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
  const [language, setLanguage] = useState("en");
  useEffect(() => { const read = () => setLanguage(localStorage.getItem("sahoolat-language") ?? "en"); read(); window.addEventListener("sahoolat-preferences", read); return () => window.removeEventListener("sahoolat-preferences", read); }, []);
  return (
    <nav className="flex flex-col gap-1 md:flex-row md:flex-nowrap md:items-center md:gap-0 md:overflow-x-auto md:[scrollbar-width:none]">
      {NAV[role].map((n) => (
        <Link key={n.to} to={n.to} activeOptions={{ exact: n.to.split("/").length === 2 }}
          className="flex items-center gap-3 whitespace-nowrap rounded-[10px] px-3 py-2 text-sm font-semibold text-foreground/75 transition hover:bg-secondary hover:text-primary md:shrink-0 md:gap-1.5 md:px-2 md:py-1.5 md:text-[13px]"
          activeProps={{ className: "bg-secondary !text-primary" }}>
          <n.icon className="h-4 w-4 shrink-0 md:hidden xl:block" />{language === "ur" ? navUrdu[n.label] ?? n.label : n.label}
        </Link>
      ))}
    </nav>
  );
}

export const dashboardPath = (role: Role) => role === "patient" ? "/patient" : role === "doctor" ? "/doctor" : role === "pharmacy" ? "/pharmacy" : role === "receptionist" ? "/reception" : role === "lab" ? "/lab" : "/admin";

/** Patient pages that visitors may browse without signing in; booking still needs an account. */
const PUBLIC_PATIENT_PAGES = [/^\/patient\/doctors(\/[^/]+)?\/?$/, /^\/patient\/labs\/?$/, /^\/patient\/laboratories\/[^/]+\/?$/, /^\/patient\/free-checkups\/?$/, /^\/patient\/stores\/[^/]+\/?$/];

function GuestShell({ children }: { children: ReactNode }) {
  const user = useSession();
  const links = [
    { to: "/patient/doctors", label: "Doctors" },
    { to: "/patient/labs", label: "Lab Tests" },
    { to: "/patient/free-checkups", label: "Free Consultancy" },
    { to: "/discussions", label: "Discussions" },
  ] as const;
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-card/95 shadow-soft backdrop-blur">
        <div className="bg-sidebar text-xs text-sidebar-foreground"><div className="mx-auto flex h-8 max-w-7xl items-center px-4 md:px-8"><span className="truncate">Verified healthcare professionals • Secure consultations</span></div></div>
        <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center gap-3 px-4 py-3 md:px-8">
          <Link to="/" aria-label="HealthSahoolat home"><BrandLogo className="h-8" /></Link>
          <nav className="hidden items-center gap-1 lg:flex">{links.map((l) => <Link key={l.to} to={l.to} className="rounded-[10px] px-3 py-2 text-sm font-semibold text-foreground/75 hover:bg-secondary hover:text-primary" activeProps={{ className: "bg-secondary !text-primary" }}>{l.label}</Link>)}</nav>
          <div className="ml-auto flex items-center gap-2">
            {user ? <Button size="sm" asChild className="rounded-[11px] font-semibold"><Link to={dashboardPath(user.role)}>My dashboard</Link></Button> : <>
            <Button variant="outline" size="sm" asChild className="rounded-[11px] font-semibold"><Link to="/login">Sign in</Link></Button>
            <Button size="sm" asChild className="hidden rounded-[11px] font-semibold sm:inline-flex"><Link to="/register">Register</Link></Button></>}
            <Sheet>
              <SheetTrigger asChild><Button variant="ghost" size="icon" className="lg:hidden" aria-label="Menu"><Menu className="h-5 w-5" /></Button></SheetTrigger>
              <SheetContent side="left" className="flex w-64 flex-col gap-2 bg-card p-4"><BrandLogo className="mb-4 h-8" />{links.map((l) => <Link key={l.to} to={l.to} className="rounded-lg px-3 py-2 font-semibold hover:bg-secondary">{l.label}</Link>)}{!user && <Link to="/register" className="rounded-lg px-3 py-2 font-semibold hover:bg-secondary">Register</Link>}</SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
      <main className="flex-1 p-4 md:p-8"><div className="mx-auto w-full max-w-7xl">{children}</div></main>
    </div>
  );
}

export function AppShell({ role, children }: { role: Role; children: ReactNode }) {
  const user = useSession();
  const pathname = useLocation({ select: (l) => l.pathname });
  const guestAllowed = role === "patient" && PUBLIC_PATIENT_PAGES.some((r) => r.test(pathname));
  const navigate = useNavigate();
  const ready = useReady();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);
  const signOut = async () => {
    setSigningOut(true);
    try {
      await queryClient.cancelQueries();
      queryClient.clear();
      await logout();
      await navigate({ to: "/login", replace: true });
    } catch { toast.error("Could not sign out. Please try again."); }
    finally { setSigningOut(false); }
  };
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => { const apply = () => { document.documentElement.classList.toggle("dark", localStorage.getItem("sahoolat-theme") === "dark"); document.documentElement.classList.toggle("large-text", localStorage.getItem("sahoolat-large") === "true"); document.documentElement.lang = localStorage.getItem("sahoolat-language") ?? "en"; }; apply(); window.addEventListener("sahoolat-preferences", apply); return () => window.removeEventListener("sahoolat-preferences", apply); }, []);
  useEffect(() => {
    if (user?.role === "patient") runReminders(user.id);
  }, [user?.id, user?.role]);
  useEffect(() => {
    if (user?.role !== "patient" || !ready) return;
    const id = user.id;
    runMedicineReminders(id);
    const t = setInterval(() => runMedicineReminders(id), 60_000);
    return () => clearInterval(t);
  }, [user?.id, user?.role, ready]);

  if (!mounted) return null;
  if (!ready) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  if (guestAllowed && (!user || user.role !== role)) return <GuestShell>{children}</GuestShell>;
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
    <Link to="/" aria-label="HealthSahoolat home"><BrandLogo className="h-8" /></Link>
  );
  const footer = (
    <div className="border-t pt-4">
      <p className="px-3 text-sm font-medium">{user.name}</p>
      <p className="px-3 text-xs capitalize text-muted-foreground">{user.role}</p>
      <Button variant="outline" disabled={signingOut} onClick={signOut} className="mt-3 w-full justify-start gap-3">
        <LogOut className="h-4 w-4" /> Sign out
      </Button>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-card/95 shadow-soft backdrop-blur">
        <div className="bg-sidebar text-xs text-sidebar-foreground"><div className="mx-auto flex h-8 max-w-7xl items-center justify-between gap-3 px-4 md:px-8"><span className="truncate">Verified healthcare professionals • Secure consultations</span><span className="hidden shrink-0 capitalize sm:inline">{user.role} dashboard</span></div></div>
        <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center gap-2 px-4 py-3 md:gap-4 md:px-8">
          <Sheet>
            <SheetTrigger asChild><Button variant="ghost" size="icon" className="md:hidden" aria-label="Menu"><Menu className="h-5 w-5" /></Button></SheetTrigger>
            <SheetContent side="left" className="flex w-64 flex-col gap-6 overflow-y-auto bg-card p-4">{brand}<SideNav role={role} />{footer}</SheetContent>
          </Sheet>
          <div className="hidden shrink-0 sm:block">{brand}</div>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            {role === "patient" && <AccountSwitcher userId={user.id} name={user.name} />}
            <Notifications userId={user.id} />
            <div className="hidden items-center gap-3 border-l pl-3 lg:flex">
              <div className="text-right">
                <p className="text-sm font-semibold text-secondary-foreground">{user.name}</p>
                <p className="text-xs capitalize text-muted-foreground">{user.role}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" disabled={signingOut} onClick={signOut} className="shrink-0 gap-2 rounded-[11px] font-semibold"><LogOut className="h-4 w-4" />{signingOut ? "Signing out…" : "Sign out"}</Button>
          </div>
        </div>
        <div className="hidden border-t md:block"><div className="mx-auto max-w-7xl px-4 py-2 md:px-8"><SideNav role={role} /></div></div>
      </header>
      <main className="flex-1 p-4 md:p-8">
        <div className="mx-auto w-full max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
