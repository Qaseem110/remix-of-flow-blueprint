import { clinicDate } from "./appointment-lifecycle";
import { timeMinutes, validateShifts, type Shift } from "./schedule";

export interface LabSchedule {
  slotMinutes: number;
  weeklyShifts: Record<string, Shift[]>;
  dateOverrides: Record<string, Shift[]>;
}
export const emptyLabSchedule = (): LabSchedule => ({ slotMinutes: 30, weeklyShifts: {}, dateOverrides: {} });
export function validateLabSchedule(s: LabSchedule) {
  if (!Number.isInteger(s.slotMinutes) || s.slotMinutes < 5 || s.slotMinutes > 240) throw new Error("Test appointment duration must be between 5 and 240 minutes");
  for (const [day, shifts] of Object.entries(s.weeklyShifts)) {
    if (!/^[0-6]$/.test(day)) throw new Error("Invalid weekday");
    validateShifts(shifts);
  }
  for (const [date, shifts] of Object.entries(s.dateOverrides)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid date override");
    validateShifts(shifts);
  }
}
export function labSlots(schedule: LabSchedule | undefined, date: string, orders: { date: string; time?: string; slotMinutes?: number; status: string; count?: number }[], now = new Date()) {
  if (!schedule || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < clinicDate(now)) return [];
  const shifts = schedule.dateOverrides[date] ?? schedule.weeklyShifts[String(new Date(date + "T12:00:00Z").getUTCDay())] ?? [];
  const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Tripoli", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  return [...shifts].sort((a, b) => a.start.localeCompare(b.start)).flatMap((shift) => {
    const slots: { time: string; available: boolean }[] = [];
    for (let m = timeMinutes(shift.start); m + schedule.slotMinutes <= timeMinutes(shift.end); m += schedule.slotMinutes) {
      const time = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      const used = orders.filter((o) => o.date === date && o.time && !["Cancelled", "Expired"].includes(o.status) && timeMinutes(o.time) < m + schedule.slotMinutes && timeMinutes(o.time) + (o.slotMinutes ?? schedule.slotMinutes) > m).reduce((total, o) => total + (o.count ?? 1), 0);
      slots.push({ time, available: used < shift.capacity && (date > clinicDate(now) || time > clock) });
    }
    return slots;
  });
}