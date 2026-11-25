/** Minutes since midnight in clinic (Asia/Karachi) wall-clock time. */
export function clinicMinutesNow(now = new Date()): number {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return g("hour") * 60 + g("minute");
}

/** Clinic patients who never arrived and whose token time + one check-up duration has passed. */
export function overdueAbsent<T extends { type: string; status: string; time: string }>(day: T[], graceMinutes: number, nowMinutes: number): T[] {
  return day.filter((a) => {
    if (a.type !== "clinic" || a.status !== "Confirmed" || !a.time) return false;
    const [h, m] = a.time.split(":").map(Number);
    return nowMinutes >= h * 60 + m + Math.max(1, graceMinutes);
  });
}
