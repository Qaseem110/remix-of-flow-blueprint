import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ readReport: vi.fn() }));
vi.mock("@/lib/read-report.functions", () => ({ readReport: mocks.readReport }));
import { getState, login, persistPatientDocs, readAndMakeDocs } from "@/lib/store";

beforeEach(async () => {
  await login("patient@demo.com", "demo123");
  vi.stubGlobal("URL", { createObjectURL: () => "blob:test" });
  mocks.readReport.mockReset();
});
describe("patient consultation reports", () => {
  it("reads the internal report name instead of the uploaded filename and saves it to the visit", async () => {
    mocks.readReport.mockResolvedValue({ title: "MRI Brain", reportDate: "2026-11-02", kind: "Radiology" });
    const docs = await readAndMakeDocs([new File(["MRI Brain"], "random-upload.pdf", { type: "application/pdf" })], "patient", true);
    expect(docs[0].name).toBe("MRI Brain 2026-11-02.pdf");
    expect(docs[0].title).toBe("MRI Brain");
    await persistPatientDocs("APT-1003", docs);
    expect(getState().appointments.find((a) => a.id === "APT-1003")?.documents.some((d) => d.name === "MRI Brain 2026-11-02.pdf")).toBe(true);
  });
  it("does not silently upload under the original filename when reading fails", async () => {
    mocks.readReport.mockResolvedValue(null);
    await expect(readAndMakeDocs([new File(["unreadable"], "random-upload.pdf", { type: "application/pdf" })], "patient", true)).rejects.toThrow("Could not read the report heading");
  });
});