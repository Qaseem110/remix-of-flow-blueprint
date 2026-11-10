import { describe, it, expect } from "vitest";
import { suggestTimes, durationDays, dueDoses } from "@/lib/medicine-reminders";

describe("medicine reminders", () => {
  it("twice daily suggests two times", () => expect(suggestTimes("Twice daily")).toEqual(["08:00", "20:00"]));
  it("1+0+1 maps to morning and night", () => expect(suggestTimes("1+0+1")).toEqual(["08:00", "21:00"]));
  it("2 weeks is 14 days", () => expect(durationDays("2 weeks")).toBe(14));
  it("alerts when dose time arrives within course", () => {
    const rx = [{ medicine: "Panadol", dosage: "1", frequency: "", duration: "5 days", instructions: "", times: ["08:00"] }];
    const start = new Date(2026, 10, 1, 10).toISOString();
    expect(dueDoses(rx, start, new Date(2026, 10, 3, 8, 10))).toHaveLength(1);
    expect(dueDoses(rx, start, new Date(2026, 10, 3, 7, 50))).toHaveLength(0);
    expect(dueDoses(rx, start, new Date(2026, 10, 7, 8, 10))).toHaveLength(0);
  });
});
