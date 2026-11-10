import { describe, it, expect } from "vitest";
import { shiftTiming } from "@/lib/schedule";
describe("time per patient", () => {
  it("spaces queue times by the doctor's minutes per patient", () => {
    expect(shiftTiming({ consultMinutes: 15 }, { start: "09:00", end: "12:00", capacity: 10 })).toMatchObject({ step: 15, capacity: 10 });
  });
  it("limits patients to what fits in the shift", () => {
    expect(shiftTiming({ consultMinutes: 30 }, { start: "09:00", end: "11:00", capacity: 10 })).toMatchObject({ step: 30, capacity: 4 });
  });
  it("falls back to spreading evenly when unset", () => {
    expect(shiftTiming({}, { start: "09:00", end: "12:00", capacity: 6 })).toMatchObject({ step: 30, capacity: 6 });
  });
});
describe("group visits", () => {
  it("3 patients share each 30-minute time", () => {
    expect(shiftTiming({ consultMinutes: 30, patientsPerSlot: 3 }, { start: "09:00", end: "10:00", capacity: 10 })).toEqual({ step: 30, capacity: 6, perSlot: 3, slots: 2 });
  });
});
