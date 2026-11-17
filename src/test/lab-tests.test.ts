import { describe, expect, it } from "vitest";
import { labTestCatalogue, validateLabTests, type LabTest } from "../lib/lab-tests";

const complete: LabTest = { name: "CBC", price: 1500, details: "Complete blood cell count", turnaround: "24 hours" };
describe("required lab test details", () => {
  it("requires a test name", () => expect(() => validateLabTests([{ ...complete, name: " " }])).toThrow("Test name"));
  it("requires a positive price", () => {
    for (const price of [0, -1, NaN, Infinity]) expect(() => validateLabTests([{ ...complete, price }])).toThrow("price");
    expect(() => validateLabTests([complete])).not.toThrow();
  });
  it("requires test details", () => expect(() => validateLabTests([{ ...complete, details: " " }])).toThrow("details"));
  it("requires report turnaround", () => expect(() => validateLabTests([{ ...complete, turnaround: " " }])).toThrow("turnaround"));
  it("rejects duplicate names", () => expect(() => validateLabTests([complete, { ...complete, name: "cbc" }])).toThrow("already listed"));
  it("retains old names for completion without fabricating prices", () => {
    expect(labTestCatalogue({ tests: "CBC, MRI" }).map((t) => [t.name, t.price])).toEqual([["CBC", 0], ["MRI", 0]]);
  });
});