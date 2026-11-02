import { afterEach, describe, expect, it } from "vitest";
import { addDays, format } from "date-fns";
import { bookAppointment, cancelAppointment, getSlots, getState, saveAvailability, dailyCapacity, scheduleShifts } from "@/lib/store";
const original = { ...getState().availability[0] };
const date = format(addDays(new Date(), 40), "yyyy-MM-dd");
const day = new Date(date + "T00:00:00").getDay();
const shifts = [{ start: "09:00", end: "10:00", capacity: 2 }, { start: "17:00", end: "18:00", capacity: 2 }];
const ids: string[] = [];
const config = () => ({ ...original, weeklyShifts: { [day]: shifts }, dateOverrides: {}, blocked: [], blockedDays: [] });
afterEach(() => { ids.splice(0).forEach((id) => cancelAppointment(id, "patient")); saveAvailability(original); });
describe("custom clinic shifts", () => {
  it("creates morning and evening places without slots during the break", () => {
    saveAvailability(config());
    expect(getSlots(original.doctorId, date).map((s) => s.time)).toEqual(["09:00", "09:30", "17:00", "17:30"]);
  });
  it("allocates across two shifts and refuses a fifth patient", async () => {
    saveAvailability(config());
    const input = { doctorId: original.doctorId, patientId: getState().patients[0].userId, date, type: "clinic" as const, reason: "Check-up", documents: [] };
    const times: string[] = [];
    for (let i = 0; i < 4; i++) { const a = await bookAppointment(input); ids.push(a.id); times.push(a.time); }
    expect(times).toEqual(["09:00", "09:30", "17:00", "17:30"]);
    await expect(bookAppointment(input)).rejects.toThrow("No places available");
  });
  it("uses special-date shifts instead of the weekly schedule", () => {
    const av = { ...config(), dateOverrides: { [date]: [{ start: "12:00", end: "13:00", capacity: 1 }] } };
    saveAvailability(av);
    expect(getSlots(original.doctorId, date).map((s) => s.time)).toEqual(["12:00"]);
    expect(dailyCapacity(av, date)).toBe(1);
  });
  it("an empty date override closes a working day", () => {
    saveAvailability({ ...config(), dateOverrides: { [date]: [] } });
    expect(getSlots(original.doctorId, date)).toEqual([]);
  });
  it("different weekdays have independent shifts", () => {
    const av = config();
    expect(scheduleShifts(av, format(addDays(new Date(date + "T00:00:00"), 1), "yyyy-MM-dd"))).toEqual([]);
  });
  it("rejects overlapping shifts", () => {
    expect(() => saveAvailability({ ...config(), weeklyShifts: { [day]: [shifts[0], { start: "09:30", end: "11:00", capacity: 2 }] } })).toThrow("overlap");
  });
  it("rejects zero shift capacity", () => {
    expect(() => saveAvailability({ ...config(), weeklyShifts: { [day]: [{ ...shifts[0], capacity: 0 }] } })).toThrow("positive whole number");
  });
});