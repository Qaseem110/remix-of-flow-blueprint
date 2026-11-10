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
