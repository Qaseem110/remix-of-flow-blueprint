import { describe, expect, it } from "vitest";
import { testsNeedingPrescription, type LabTest } from "@/lib/lab-tests";

const cat: LabTest[] = [
  { name: "CBC", price: 800, details: "Blood count", turnaround: "24h" },
  { name: "Hormone panel", price: 4000, details: "Hormones", turnaround: "48h", prescriptionRequired: true },
];
describe("lab prescription rule", () => {
  it("does not need a prescription for tests the lab left open", () => {
    expect(testsNeedingPrescription(cat, "CBC")).toEqual([]);
  });
  it("needs a prescription only for tests the lab marked", () => {
    expect(testsNeedingPrescription(cat, "cbc, hormone panel")).toEqual(["Hormone panel"]);
  });
});
