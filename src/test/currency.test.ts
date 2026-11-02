import { describe, expect, it } from "vitest";
import { CURRENCY, fmtPrice } from "../lib/utils";

describe("website currency", () => {
  it("uses PKR and preserves existing price amounts", () => {
    expect(CURRENCY).toBe("PKR");
    expect(fmtPrice(1250)).toBe("PKR 1,250");
    expect(fmtPrice(99.5)).toBe("PKR 99.5");
    expect(fmtPrice(0)).toBe("PKR 0");
  });
});