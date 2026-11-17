import { describe, expect, it } from "vitest";
import { overdueAbsent } from "@/lib/no-show-grace";
const a = (time: string, status = "Confirmed", type = "clinic") => ({ time, status, type });
describe("no-show grace", () => {
  it("waits one check-up duration after token time", () => {
    expect(overdueAbsent([a("09:00")], 15, 9 * 60 + 14)).toHaveLength(0);
    expect(overdueAbsent([a("09:00")], 15, 9 * 60 + 15)).toHaveLength(1);
  });
  it("never skips arrived or online patients", () => {
    expect(overdueAbsent([a("09:00", "Checked-In"), a("09:00", "Confirmed", "online")], 15, 600)).toHaveLength(0);
  });
});
