import { describe, expect, it } from "vitest";
import { appointmentTimeReached } from "@/lib/store";

describe("doctor cannot attend before the appointment time", () => {
  it("blocks before the time and allows at the exact time", () => {
    expect(appointmentTimeReached({ date: "2026-11-27", time: "10:30" }, "2026-11-27", 10 * 60 + 29)).toBe(false);
    expect(appointmentTimeReached({ date: "2026-11-27", time: "10:30" }, "2026-11-27", 10 * 60 + 30)).toBe(true);
    expect(appointmentTimeReached({ date: "2026-11-28", time: "09:00" }, "2026-11-27", 23 * 60)).toBe(false);
  });
});
