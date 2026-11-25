import { describe, expect, it } from "vitest";
import { labSlots, validateLabSchedule, type LabSchedule } from "@/lib/lab-schedule";

const schedule: LabSchedule = { slotMinutes: 30, weeklyShifts: { "2": [{ start: "09:00", end: "10:00", capacity: 1 }, { start: "14:00", end: "15:00", capacity: 2 }] }, dateOverrides: {} };
const now = new Date("2026-11-16T16:52:00Z");
describe("lab appointment availability", () => {
  it("offers date/time appointments inside lab shifts, not during breaks", () => {
    expect(labSlots(schedule, "2026-12-01", [], now).map((s) => s.time)).toEqual(["09:00", "09:30", "14:00", "14:30"]);
  });
  it("enforces the laboratory's patients-per-time-slot capacity", () => {
    const orders = [{ date: "2026-12-01", time: "09:00", status: "Requested" }, { date: "2026-12-01", time: "14:00", status: "Requested" }];
    const slots = labSlots(schedule, "2026-12-01", orders, now);
    expect(slots.find((s) => s.time === "09:00")?.available).toBe(false);
    expect(slots.find((s) => s.time === "14:00")?.available).toBe(true);
  });
  it("cancellation frees the booked time", () => {
    expect(labSlots(schedule, "2026-12-01", [{ date: "2026-12-01", time: "09:00", status: "Cancelled" }], now)[0]?.available).toBe(true);
  });
  it("a closed date override replaces weekly hours", () => {
    expect(labSlots({ ...schedule, dateOverrides: { "2026-12-01": [] } }, "2026-12-01", [], now)).toEqual([]);
  });
  it("does not offer past times in clinic time even on the same UTC day", () => {
    const todaySchedule = { ...schedule, weeklyShifts: { "1": [{ start: "21:00", end: "23:00", capacity: 1 }] } };
    expect(labSlots(todaySchedule, "2026-11-16", [], now).filter((s) => s.available).map((s) => s.time)).toEqual(["22:00", "22:30"]);
  });
  it("existing booking duration blocks overlapping slots after a schedule change", () => {
    const slots = labSlots(schedule, "2026-12-01", [{ date: "2026-12-01", time: "09:00", slotMinutes: 60, status: "Requested" }], now);
    expect(slots.filter((s) => s.time < "10:00").map((s) => s.available)).toEqual([false, false]);
  });
  it("refuses overlapping lab shifts", () => {
    expect(() => validateLabSchedule({ ...schedule, weeklyShifts: { "2": [{ start: "09:00", end: "12:00", capacity: 1 }, { start: "11:00", end: "13:00", capacity: 1 }] } })).toThrow("overlap");
  });
});