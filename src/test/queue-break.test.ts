import { describe, it, expect, vi } from "vitest";
import { getState, startBreak, endBreak, todayStr } from "@/lib/store";
describe("emergency break", () => {
  it("moves waiting patients' times later by the break length", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const before = getState().appointments.find((a) => a.id === "APT-1004")!.time;
    await startBreak("u-doc1");
    vi.setSystemTime(Date.now() + 20 * 60000);
    expect(await endBreak("u-doc1")).toBe(20);
    const after = getState().appointments.find((a) => a.id === "APT-1004")!;
    const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    expect(after.date).toBe(todayStr());
    expect(m(after.time) - m(before)).toBe(20);
    expect(getState().availability.find((a) => a.doctorId === "u-doc1")?.breakStartedAt).toBeUndefined();
    vi.useRealTimers();
  });
});
