export interface Shift { start: string; end: string; capacity: number }
export interface Schedule {
  days: number[]; start: string; end: string; duration: number; dailyLimit?: number;
  /** Minutes the doctor spends per patient; when set, queue times are spaced by this value. */
  consultMinutes?: number;
  /** Patients the doctor sees together at one time (group visits); all share the same time. */
  patientsPerSlot?: number;
  weeklyShifts?: Record<string, Shift[]>;
  dateOverrides?: Record<string, Shift[]>;
}
export const timeMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export function weekdayShifts(av: Schedule, day: number): Shift[] {
  if (av.weeklyShifts) return av.weeklyShifts[String(day)] ?? [];
  return av.days.includes(day) ? [{ start: av.start, end: av.end, capacity: av.dailyLimit ?? Math.max(1, Math.floor((timeMinutes(av.end) - timeMinutes(av.start)) / av.duration)) }] : [];
}
export function scheduleShifts(av: Schedule, date: string): Shift[] {
  return [...(av.dateOverrides?.[date] ?? weekdayShifts(av, new Date(date + "T00:00:00").getDay()))].sort((a, b) => a.start.localeCompare(b.start));
}
export function validateShifts(shifts: Shift[]) {
  const sorted = [...shifts].sort((a, b) => a.start.localeCompare(b.start));
  sorted.forEach((shift, i) => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(shift.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(shift.end) || shift.end <= shift.start) throw new Error("Each shift needs an end time after its start time");
    if (!Number.isInteger(shift.capacity) || shift.capacity < 1 || shift.capacity > timeMinutes(shift.end) - timeMinutes(shift.start)) throw new Error("Patient limit must be a positive whole number within the shift's working minutes");
    const previous = sorted[i - 1];
    if (previous && previous.end > shift.start) throw new Error("Shifts cannot overlap");
  });
}
/** Minutes between time slots in a shift, how many patients share each time, and how many fit in total. */
export function shiftTiming(av: Pick<Schedule, "consultMinutes" | "patientsPerSlot">, shift: Shift) {
  const span = timeMinutes(shift.end) - timeMinutes(shift.start);
  const perSlot = Math.max(1, Math.floor(av.patientsPerSlot ?? 1));
  if (av.consultMinutes && av.consultMinutes > 0) {
    const capacity = Math.min(shift.capacity, Math.max(1, Math.floor(span / av.consultMinutes)) * perSlot);
    return { step: av.consultMinutes, capacity, perSlot, slots: Math.ceil(capacity / perSlot) };
  }
  const slots = Math.ceil(shift.capacity / perSlot);
  return { step: Math.max(1, Math.floor(span / slots)), capacity: shift.capacity, perSlot, slots };
}
