import { describe, it, expect } from "vitest";
import { distanceKm, travelMinutes } from "@/lib/geo";
describe("travel estimate", () => {
  it("measures distance and travel time", () => {
    const km = distanceKm({ lat: 31.5204, lng: 74.3587 }, { lat: 31.5497, lng: 74.3436 });
    expect(km).toBeGreaterThan(3); expect(km).toBeLessThan(4);
    expect(travelMinutes(10)).toBe(39);
  });
});
