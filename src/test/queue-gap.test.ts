import { describe, it, expect } from "vitest";
import { getState, cancelAppointment } from "@/lib/store";
describe("queue gaps", () => {
  it("later patients take the cancelled number and time", () => {
    const before = getState().appointments.find((a) => a.id === "APT-1003")!;
    cancelAppointment("APT-1003", "patient");
    const next = getState().appointments.find((a) => a.id === "APT-1004")!;
    expect(next.queueNumber).toBe(3);
    expect(next.time).toBe(before.time);
  });
});
import { markNoShow, returnToQueue } from "@/lib/store";
describe("returning no-show", () => {
  it("gets a number no one else has", () => {
    markNoShow("APT-1002");
    returnToQueue("APT-1002", 0);
    const active = getState().appointments.filter((a) => a.doctorId === "u-doc1" && ["Confirmed", "Waiting", "Checked-In"].includes(a.status));
    const nums = active.map((a) => a.queueNumber);
    expect(new Set(nums).size).toBe(nums.length);
  });
});
