const activeStatuses = ["Pending", "Confirmed", "Checked-In", "Waiting", "Ready to Join", "In Consultation"];

export function clinicDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tripoli", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Expiration is derived without deleting the appointment or its medical records. */
export function appointmentStatus<T extends string>(date: string, status: T, today = clinicDate()): T | "Expired" {
  return date < today && activeStatuses.includes(status) ? "Expired" : status;
}