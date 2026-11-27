import { useLocation, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

/** Floating "Back" control shown on every page except the homepage. */
export function BackButton() {
  const router = useRouter();
  const pathname = useLocation({ select: (l) => l.pathname });
  if (pathname === "/") return null;
  const back = () => {
    if (window.history.length > 1) router.history.back();
    else void router.navigate({ to: "/" });
  };
  return (
    <button type="button" onClick={back} aria-label="Go back" className="fixed bottom-4 left-4 z-40 flex items-center gap-1.5 rounded-full border bg-card/95 px-4 py-2 text-sm font-semibold text-secondary-foreground shadow-lg backdrop-blur transition hover:border-primary hover:text-primary">
      <ArrowLeft className="h-4 w-4" />Back
    </button>
  );
}
