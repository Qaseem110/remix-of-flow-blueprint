export interface LabTest {
  name: string;
  price: number;
  details: string;
  turnaround: string;
  sample?: string;
  preparation?: string;
}

export function validateLabTests(tests: LabTest[]) {
  const names = new Set<string>();
  for (const test of tests) {
    if (!test.name.trim()) throw new Error("Test name is required");
    if (!Number.isFinite(test.price) || test.price <= 0) throw new Error("Enter a price greater than zero");
    if (!test.details.trim()) throw new Error("Test details are required");
    if (!test.turnaround.trim()) throw new Error("Report turnaround time is required");
    const name = test.name.trim().toLowerCase();
    if (names.has(name)) throw new Error("This test is already listed");
    names.add(name);
  }
}

export function labTestCatalogue(lab: { testCatalogue?: LabTest[]; tests?: string }): LabTest[] {
  return lab.testCatalogue ?? (lab.tests ?? "").split(/[,\n]/).map((name) => name.trim()).filter(Boolean).map((name) => ({ name, price: 0, details: "", turnaround: "" }));
}