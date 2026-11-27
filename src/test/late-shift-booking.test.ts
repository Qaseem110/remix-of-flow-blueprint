import { describe, it, expect, vi, afterEach } from "vitest";
import { getSlots } from "@/lib/store";
type State = NonNullable<Parameters<typeof getSlots>[2]>;

afterEach(() => vi.useRealTimers());
describe("same-day booking while shift is open", () => {
  it("offers a time after all planned slots passed but the shift still runs", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-27T18:12:00Z")); // 23:12 Pakistan
    const s = { appointments: [], availability: [{ doctorId: "d", start: "09:00", end: "23:59", duration: 30, days: [5], blocked: [], blockedDays: [], weeklyShifts: { "5": [{ start: "09:00", end: "23:59", capacity: 10 }] } }] } as unknown as State;
    const open = getSlots("d", "2026-11-27", s).filter((x) => x.available);
    expect(open.map((x) => x.time)).toEqual(["23:13"]);
  });
});
