import { afterEach, describe, expect, it } from "vitest";
import { addDays, format } from "date-fns";
import { bookAppointment, cancelAppointment, dailyCapacity, getSlots, getState, rescheduleAppointment, saveAvailability, toggleBlockedDay, toggleBlockedSlot } from "@/lib/store";

const original = { ...getState().availability[0] };
const doctorId = original.doctorId;
const patientId = getState().patients[0].userId;
const date = format(addDays(new Date(), 35), "yyyy-MM-dd");
const ids: string[] = [];
const setup = () => saveAvailability({ ...original, days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "10:00", dailyLimit: 2, blocked: [], blockedDays: [] });
const book = async (day = date, time?: string) => {
  const a = await bookAppointment({ doctorId, patientId, type: "online", date: day, time, reason: "Check-up", documents: [] });
  ids.push(a.id);
  return a;
};
afterEach(() => {
  ids.splice(0).forEach((id) => cancelAppointment(id, "patient"));
  saveAvailability(original);
});

describe("automatic daily queue booking", () => {
  it("ignores a requested time and allocates automatically", async () => {
    setup();
    const a = await book(date, "09:45");
    expect(a.time).toBe("09:00");
  });
  it("allocates sequential stable numbers and divides working hours by capacity", async () => {
    setup();
    const first = await book();
    const second = await book();
    expect(second.queueNumber).toBe(first.queueNumber + 1);
    expect([first.time, second.time]).toEqual(["09:00", "09:30"]);
    cancelAppointment(first.id, "patient");
    expect(getState().appointments.find((a) => a.id === second.id)?.queueNumber).toBe(first.queueNumber);
  });
  it("rejects a third patient when the daily limit is two", async () => {
    setup();
    await book(); await book();
    await expect(book()).rejects.toThrow("No places available");
    expect(getSlots(doctorId, date).some((s) => s.available)).toBe(false);
  });
  it("skips doctor-blocked times", async () => {
    setup();
    toggleBlockedSlot(doctorId, date, "09:00");
    expect((await book()).time).toBe("09:30");
  });
  it("rejects a day the doctor marked unavailable", async () => {
    setup(); toggleBlockedDay(doctorId, date);
    await expect(book()).rejects.toThrow("No places available");
  });
  it("keeps linked patient identity when automatically rescheduling", async () => {
    setup();
    const a = await bookAppointment({ doctorId, patientId, memberId: "member-test", memberName: "Shazal", type: "clinic", date, reason: "Check-up", documents: [] });
    ids.push(a.id);
    const newDate = format(addDays(new Date(), 36), "yyyy-MM-dd");
    const fresh = await rescheduleAppointment(a.id, newDate);
    ids.push(fresh.id);
    expect(fresh.memberId).toBe("member-test");
    expect(fresh.time).toBe("09:00");
    expect(getState().appointments.find((x) => x.id === a.id)?.status).toBe("Rescheduled");
  });
  it("rejects a nonpositive daily limit", () => {
    expect(() => saveAvailability({ ...original, dailyLimit: 0 })).toThrow("positive whole number");
  });
  it("preserves legacy capacity until the doctor changes it", () => {
    expect(dailyCapacity({ doctorId, days: [1], start: "09:00", end: "17:00", duration: 30 })).toBe(16);
  });
});