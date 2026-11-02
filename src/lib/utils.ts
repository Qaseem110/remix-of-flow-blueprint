import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parse } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formats a stored 24h "HH:mm" time for display, e.g. "2:30 PM". Falls back to the raw value. */
export function fmtTime(t: string) {
  const d = parse(t, "HH:mm", new Date());
  return isNaN(d.getTime()) ? t : format(d, "h:mm a");
}
