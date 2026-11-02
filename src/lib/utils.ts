import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parse } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const CURRENCY = "PKR";
const priceFormat = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 });

/** Display existing price amounts in the website currency without conversion. */
export function fmtPrice(amount: number) {
  return `${CURRENCY} ${priceFormat.format(amount)}`;
}

/** Formats a stored 24h "HH:mm" time for display, e.g. "2:30 PM". Falls back to the raw value. */
export function fmtTime(t: string) {
  const d = parse(t, "HH:mm", new Date());
  return isNaN(d.getTime()) ? t : format(d, "h:mm a");
}
