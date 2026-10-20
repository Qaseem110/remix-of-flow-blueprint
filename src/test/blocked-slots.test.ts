import { describe, expect, it } from "vitest";
import { addDays, format } from "date-fns";
import { getSlots, getState, toggleBlockedDay, toggleBlockedSlot } from "@/lib/store";

function futureOpenSlot() {
  for (const av of getState().availability) {
    for (let i = 1; i < 14; i++) {
      const date = format(addDays(new Date(), i), "yyyy-MM-dd");
      const s = getSlots(av.doctorId, date).find((x) => x.available);
      if (s) return { doctorId: av.doctorId, date, time: s.time };
    }
  }
  throw new Error("no open slot in sample data");
}

describe("doctor blocked times", () => {
  it("a blocked slot cannot be booked, and reopens when toggled again", () => {
    const { doctorId, date, time } = futureOpenSlot();
    toggleBlockedSlot(doctorId, date, time);
    expect(getSlots(doctorId, date).find((x) => x.time === time)?.available).toBe(false);
    toggleBlockedSlot(doctorId, date, time);
    expect(getSlots(doctorId, date).find((x) => x.time === time)?.available).toBe(true);
  });
  it("a blocked day makes every slot unavailable", () => {
    const { doctorId, date } = futureOpenSlot();
    toggleBlockedDay(doctorId, date);
    expect(getSlots(doctorId, date).every((x) => !x.available)).toBe(true);
  });
});
