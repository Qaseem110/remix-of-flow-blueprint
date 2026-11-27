import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Bone, Brain, CalendarCheck, Eye, FlaskConical, HeartPulse, ListOrdered, Menu, ShieldCheck, Smile, Stethoscope, Users, Video, Wind, BadgeCheck, Headphones } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { FeedTabs } from "@/components/feed/FeedTabs";
import { BrandLogo } from "@/components/app/BrandLogo";
import { QueueTracker } from "@/components/app/QueueTracker";
import { SymptomSearch } from "@/components/app/SymptomSearch";
import heroImg from "@/assets/hs/hero-doctor.jpg";
import consultImg from "@/assets/hs/consult.jpg";
import labImg from "@/assets/hs/lab.jpg";
import onlineImg from "@/assets/hs/online.jpg";
import adviceImg from "@/assets/hs/advice.jpg";
import emergencyImg from "@/assets/hs/emergency.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HealthSahoolat — Book doctors online or in-clinic" },
      { name: "description", content: "Find a doctor, book online or in-clinic, follow your live queue and keep every prescription in one place." },
      { property: "og:title", content: "HealthSahoolat — Book doctors online or in-clinic" },
      { property: "og:description", content: "Find a doctor, book online or in-clinic, follow your live queue and keep every prescription in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const navLinks = [
  { to: "/patient/doctors", label: "Doctors" },
  { to: "/patient/labs", label: "Lab Tests" },
  { to: "/patient/free-checkups", label: "Free Consultancy", highlight: true },
  { to: "/discussions", label: "Discussions" },
  { to: "/checkin", label: "Clinic check-in" },
] as const;

const carePaths = [
  { n: "01", img: onlineImg, title: "Online Consultation", body: "Video consultations with verified doctors from home.", to: "/patient/doctors" },
  { n: "02", img: consultImg, title: "In-Clinic Appointments", body: "Pick a day, get your queue number and estimated time.", to: "/patient/doctors" },
  { n: "03", img: labImg, title: "Laboratory Tests", body: "Book lab tests and home sample collection.", to: "/patient/labs" },
  { n: "04", img: emergencyImg, title: "Free Checkups", body: "Free sessions held by volunteer doctors.", to: "/patient/free-checkups" },
  { n: "05", img: adviceImg, title: "Health Discussions", body: "Ask questions and read advice from doctors.", to: "/discussions" },
] as const;

const specialties = [
  { icon: HeartPulse, title: "Heart & circulation", sub: "Cardiology · Vascular care" },
  { icon: Brain, title: "Brain & nerves", sub: "Neurology · Neurosurgery" },
  { icon: Wind, title: "Lungs & breathing", sub: "Pulmonology · Respiratory care" },
  { icon: Bone, title: "Bones & joints", sub: "Orthopedics · Spine care" },
  { icon: Eye, title: "Eyes & vision", sub: "Ophthalmology" },
  { icon: Smile, title: "Dental care", sub: "Dentistry" },
  { icon: Users, title: "Child & family", sub: "Pediatrics · General physician" },
  { icon: Stethoscope, title: "Everyday health", sub: "General physician" },
];

const features = [
  { icon: CalendarCheck, title: "Book your place", body: "Choose your day and receive your queue number and estimated time." },
  { icon: ListOrdered, title: "Live queue", body: "See your number, who's being seen and how many are ahead of you." },
  { icon: Video, title: "Video consultations", body: "Join from your dashboard when the doctor is ready." },
  { icon: ShieldCheck, title: "Health records", body: "Notes, prescriptions and reports saved after every visit." },
];

function Eyebrow({ children, light = false }: { children: string; light?: boolean }) {
  return <p className={`mb-3 text-xs font-bold uppercase tracking-[0.12em] ${light ? "text-primary-foreground/75" : "text-primary"}`}>{children}</p>;
}

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <div className="bg-sidebar text-xs text-sidebar-foreground">
        <div className="mx-auto flex h-9 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <span className="truncate">Verified healthcare professionals • Secure consultations</span>
          <Link to="/login" className="hidden shrink-0 hover:underline sm:inline">Sign in</Link>
        </div>
      </div>

      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" aria-label="HealthSahoolat home"><BrandLogo className="h-8 sm:h-9" /></Link>
          <nav className="hidden items-center gap-6 text-sm font-semibold lg:flex">
            {navLinks.map((l) => (
              <Link key={l.to} to={l.to} className={"highlight" in l ? "text-success hover:text-primary" : "text-foreground/80 hover:text-primary"}>{l.label}</Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild className="hidden rounded-[11px] font-bold sm:inline-flex"><Link to="/register" search={{ role: "doctor" }}>For Doctors</Link></Button>
            <Button size="sm" asChild className="rounded-[11px] bg-sidebar font-bold text-primary-foreground hover:bg-primary"><Link to="/register">For Patient</Link></Button>
            <Sheet>
              <SheetTrigger asChild><Button variant="ghost" size="icon" className="lg:hidden" aria-label="Menu"><Menu className="h-5 w-5" /></Button></SheetTrigger>
              <SheetContent side="right" className="flex w-72 flex-col gap-2 p-6">
                <BrandLogo className="mb-4 h-8" />
                {navLinks.map((l) => <Link key={l.to} to={l.to} className="rounded-lg px-3 py-2 font-semibold hover:bg-secondary">{l.label}</Link>)}
                <Link to="/register" search={{ role: "doctor" }} className="rounded-lg px-3 py-2 font-semibold hover:bg-secondary">For Doctors</Link>
                <Link to="/login" className="rounded-lg px-3 py-2 font-semibold hover:bg-secondary">Sign in</Link>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-linear-to-br from-secondary via-background to-muted">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 md:py-16 lg:grid-cols-[1.02fr_0.98fr] lg:py-20">
          <div className="min-w-0">
            <Eyebrow>Healthcare, thoughtfully connected</Eyebrow>
            <h1 className="text-4xl font-medium leading-[1.08] tracking-tight text-secondary-foreground sm:text-5xl lg:text-[52px]">Find the right doctor.<br /><span className="text-primary">Feel better sooner.</span></h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-[17px]">HealthSahoolat brings trusted doctors, video consultations, in-clinic appointments, laboratory testing and personal health records together in one place.</p>
            <SymptomSearch />
            <div className="mt-4 rounded-[18px] border bg-card p-4 shadow-soft">
              <div className="grid gap-2 sm:grid-cols-3">
                <Link to="/patient/doctors" className="flex items-center gap-2 rounded-[11px] border px-3 py-3 text-sm font-semibold hover:border-primary hover:text-primary"><Stethoscope className="h-4 w-4 shrink-0 text-primary" />Find doctors</Link>
                <Link to="/patient/labs" search={{ lab: undefined, book: false }} className="flex items-center gap-2 rounded-[11px] border px-3 py-3 text-sm font-semibold hover:border-primary hover:text-primary"><FlaskConical className="h-4 w-4 shrink-0 text-primary" />Lab tests</Link>
                <Link to="/patient/free-checkups" className="flex items-center gap-2 rounded-[11px] border px-3 py-3 text-sm font-semibold hover:border-primary hover:text-primary"><HeartPulse className="h-4 w-4 shrink-0 text-primary" />Free checkups</Link>
              </div>
              <Button asChild className="mt-3 h-12 w-full rounded-[11px] bg-sidebar text-base font-bold text-primary-foreground hover:bg-primary"><Link to="/register">Get started <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><BadgeCheck className="h-3.5 w-3.5 text-primary" />Verified professionals</span>
              <span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-primary" />Secure patient data</span>
              <span className="flex items-center gap-1"><Headphones className="h-3.5 w-3.5 text-primary" />Patient support</span>
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <img src={heroImg} alt="Doctor in a white coat" width={504} height={504} className="ml-auto aspect-[4/5] w-full max-w-[410px] rounded-[35px_35px_18px_18px] object-cover shadow-soft" />
            <div className="absolute left-0 top-10 hidden rounded-[14px] border bg-card p-3 shadow-soft sm:block">
              <p className="text-sm font-bold text-secondary-foreground">Verified doctors</p>
              <p className="text-xs text-muted-foreground">Online & in-clinic</p>
              <span className="mt-1 inline-block rounded-md bg-secondary px-2 py-0.5 text-[10px] font-bold text-success">● Available now</span>
            </div>
            <div className="absolute bottom-6 right-0 rounded-[14px] border bg-card p-3 shadow-soft">
              <p className="text-[11px] uppercase text-muted-foreground">Live queue</p>
              <p className="text-2xl font-bold text-secondary-foreground">#12</p>
              <p className="text-xs text-muted-foreground">Track your turn</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid items-center gap-8 rounded-[28px] border bg-linear-to-br from-secondary to-card p-6 shadow-soft sm:p-10 md:grid-cols-2">
          <div className="min-w-0">
            <Eyebrow>Live queue</Eyebrow>
            <h2 className="text-3xl font-bold text-secondary-foreground sm:text-4xl">Track your appointment queue</h2>
            <p className="mt-3 text-muted-foreground">Already booked? Enter your tracking number or phone right here to check in and see your live queue position.</p>
            <div className="mt-6 rounded-[18px] border bg-card p-5 shadow-soft"><QueueTracker /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {features.map((f) => (
              <div key={f.title} className="rounded-[14px] border bg-card p-4">
                <f.icon className="h-5 w-5 text-primary" />
                <h3 className="mt-2 text-sm font-bold text-secondary-foreground">{f.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-hero text-primary-foreground">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 md:py-16">
          <h2 className="text-3xl font-semibold sm:text-4xl">Healthcare at your fingertips</h2>
          <p className="mt-2 text-primary-foreground/80">Choose the care path that fits your needs — online, in person, diagnostic or community.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {carePaths.map((c) => (
              <Link key={c.title} to={c.to} className="group overflow-hidden rounded-[18px] bg-card text-card-foreground shadow-soft transition hover:-translate-y-1">
                <div className="relative">
                  <img src={c.img} alt={c.title} loading="lazy" width={504} height={504} className="h-44 w-full object-cover" />
                  <span className="absolute left-3 top-3 rounded-md bg-card px-2 py-1 text-[11px] font-bold text-secondary-foreground">{c.n}</span>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-secondary-foreground group-hover:text-primary">{c.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{c.body}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <Eyebrow>Explore care by specialty</Eyebrow>
            <h2 className="text-3xl font-semibold text-secondary-foreground sm:text-4xl">Find care for every part of you.</h2>
            <p className="mt-2 text-sm text-muted-foreground">Start with a body system or health concern and find the right specialist.</p>
          </div>
          <Link to="/patient/doctors" className="text-sm font-bold text-primary hover:underline">Browse all doctors</Link>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {specialties.map((s) => (
            <Link key={s.title} to="/patient/doctors" className="rounded-[18px] border bg-card p-5 transition hover:border-primary hover:shadow-soft">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-secondary text-primary"><s.icon className="h-6 w-6" /></span>
              <h3 className="mt-4 font-semibold text-secondary-foreground">{s.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{s.sub}</p>
            </Link>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">These categories help you discover relevant care; they are not a diagnosis.</p>
        <div className="mt-8 grid gap-6 rounded-[18px] bg-hero p-6 text-primary-foreground sm:p-8 md:grid-cols-[1fr_auto] md:items-center">
          <div className="min-w-0">
            <Eyebrow light>A clearer way to understand your health</Eyebrow>
            <h3 className="text-2xl font-semibold">Explore the body. Understand the care.</h3>
            <p className="mt-2 max-w-2xl text-sm text-primary-foreground/80">Select a category to continue to relevant doctors, book a visit and keep every record in one place.</p>
          </div>
          <ul className="space-y-2 text-sm font-semibold"><li>Organ-led discovery</li><li>Relevant specialists</li><li>Clear next steps</li></ul>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6">
        <Eyebrow>The HealthSahoolat experience</Eyebrow>
        <h2 className="text-3xl font-semibold text-secondary-foreground sm:text-4xl">Care that feels more human.</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">From the first search to the consultation, every step is designed to feel clear, calm and trustworthy.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[{ img: consultImg, t: "In-person visits", s: "Your queue number and time before you arrive." }, { img: onlineImg, t: "Online consultations", s: "Talk to your doctor by video from home." }, { img: adviceImg, t: "Healthy living advice", s: "Blogs and videos from our doctors." }].map((c) => (
            <article key={c.t} className="relative overflow-hidden rounded-[18px]">
              <img src={c.img} alt={c.t} loading="lazy" width={504} height={504} className="aspect-[4/3] w-full object-cover" />
              <div className="absolute inset-x-3 bottom-3 rounded-[14px] bg-card/95 p-3 backdrop-blur">
                <p className="font-semibold text-secondary-foreground">{c.t}</p>
                <p className="text-xs text-muted-foreground">{c.s}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t bg-card">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
          <Eyebrow>Community</Eyebrow>
          <h2 className="mb-1 text-3xl font-semibold text-secondary-foreground">From our doctors & community</h2>
          <p className="mb-6 text-muted-foreground">Blogs, pictures, videos and open discussions. <Link to="/discussions" className="font-semibold text-primary underline">Join a discussion</Link></p>
          <FeedTabs compact />
        </div>
      </section>

      <footer className="bg-sidebar text-sidebar-foreground">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          <div><div className="inline-block rounded-lg bg-card p-2"><BrandLogo className="h-7" /></div><p className="mt-3 text-sm opacity-80">Live Better, Feel Better.</p></div>
          <div className="space-y-2 text-sm"><p className="font-bold">Patients</p><Link to="/patient/doctors" className="block opacity-80 hover:opacity-100">Find doctors</Link><Link to="/patient/labs" search={{ lab: undefined, book: false }} className="block opacity-80 hover:opacity-100">Lab tests</Link><Link to="/checkin" className="block opacity-80 hover:opacity-100">Clinic check-in</Link></div>
          <div className="space-y-2 text-sm"><p className="font-bold">Providers</p><Link to="/register" search={{ role: "doctor" }} className="block opacity-80 hover:opacity-100">For doctors</Link><Link to="/register" search={{ role: "lab" }} className="block opacity-80 hover:opacity-100">For laboratories</Link><Link to="/register" search={{ role: "pharmacy" }} className="block opacity-80 hover:opacity-100">For pharmacies</Link></div>
          <div className="space-y-2 text-sm"><p className="font-bold">Community</p><Link to="/discussions" className="block opacity-80 hover:opacity-100">Discussions</Link><Link to="/login" className="block opacity-80 hover:opacity-100">Sign in</Link></div>
        </div>
        <p className="border-t border-sidebar-border px-4 py-4 text-center text-xs opacity-70">© {new Date().getFullYear()} HealthSahoolat</p>
      </footer>
    </div>
  );
}
