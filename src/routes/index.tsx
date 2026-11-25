import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CalendarCheck, ClipboardList, ListOrdered, Stethoscope, Video, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedTabs } from "@/components/feed/FeedTabs";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sahoolat — Book doctors online or in-clinic" },
      { name: "description", content: "Find a doctor, book online or in-clinic, follow your live queue and keep every prescription in one place." },
      { property: "og:title", content: "Sahoolat — Book doctors online or in-clinic" },
      { property: "og:description", content: "Find a doctor, book online or in-clinic, follow your live queue and keep every prescription in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: CalendarCheck, title: "Book your place", body: "Choose your day and receive your queue number and estimated time." },
  { icon: ListOrdered, title: "Live queue", body: "See your number, who's being seen and how many are ahead of you." },
  { icon: Video, title: "Video consultations", body: "Join from your dashboard when the doctor is ready." },
  { icon: ClipboardList, title: "Health records", body: "Notes, prescriptions and reports saved after every visit." },
];

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link to="/" className="flex items-center gap-2 font-display text-2xl font-semibold"><Stethoscope className="h-7 w-7 text-primary" /> Sahoolat</Link>
        <nav className="flex items-center gap-2">
          <Button variant="ghost" asChild><Link to="/discussions">Discussions</Link></Button>
          <Button variant="ghost" asChild><Link to="/checkin">Clinic check-in</Link></Button>
          <Button variant="ghost" asChild><Link to="/login">Sign in</Link></Button>
          <Button asChild><Link to="/register">Get started</Link></Button>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-16 pt-10">
        <div className="grid items-center gap-12 md:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="mb-4 inline-block rounded-full bg-secondary px-3 py-1 text-sm font-medium text-secondary-foreground">Online & in-clinic care</p>
            <h1 className="text-5xl font-semibold leading-[1.05] md:text-6xl">See the right doctor <em className="text-primary">without the waiting room guesswork.</em></h1>
            <p className="mt-6 max-w-lg text-lg text-muted-foreground">Book a time that works, check in from your phone, follow the queue live, and keep every consultation in your health record.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild><Link to="/register">I'm a patient <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
              <Button size="lg" variant="outline" asChild><Link to="/register" search={{ role: "doctor" }}>I'm a doctor</Link></Button>
            </div>
          </div>
          <div className="relative rounded-3xl bg-hero p-8 text-primary-foreground shadow-soft">
            <p className="text-sm uppercase tracking-widest opacity-75">Now serving</p>
            <p className="font-display text-8xl font-semibold">07</p>
            <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-primary-foreground/10 p-3"><p className="opacity-75">Your number</p><p className="font-display text-3xl">09</p></div>
              <div className="rounded-xl bg-primary-foreground/10 p-3"><p className="opacity-75">Ahead of you</p><p className="font-display text-3xl">2</p></div>
            </div>
            <div className="mt-4 flex gap-4 text-sm opacity-90"><span className="flex items-center gap-1"><Video className="h-4 w-4" /> Online</span><span className="flex items-center gap-1"><Building2 className="h-4 w-4" /> In-clinic</span></div>
          </div>
        </div>
      </section>

      <section className="border-t bg-card">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-16 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title}>
              <f.icon className="h-6 w-6 text-primary" />
              <h3 className="mt-3 text-lg font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-3xl px-6 py-12">
        <h2 className="mb-1 font-display text-3xl font-semibold">From our doctors & community</h2>
        <p className="mb-6 text-muted-foreground">Blogs, pictures, videos and open discussions. <Link to="/discussions" className="text-primary underline">Join a discussion</Link></p>
        <FeedTabs />
      </section>
      <footer className="mx-auto max-w-6xl px-6 py-8 text-sm text-muted-foreground">© {new Date().getFullYear()} Sahoolat</footer>
    </div>
  );
}
