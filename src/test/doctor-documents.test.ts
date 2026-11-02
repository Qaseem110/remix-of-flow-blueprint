import { describe, expect, it } from "vitest";
import { addConsultationDocs, getState, login, type DocFile } from "@/lib/store";

const document: DocFile = { id: "doctor-test-document", name: "Referral.pdf", mime: "application/pdf", size: 100, url: "", kind: "Referral", uploadedBy: "doctor", uploadedAt: new Date().toISOString() };

describe("doctor document uploads", () => {
  it("saves doctor documents on a completed visit without changing completion", async () => {
    await login("doctor@demo.com", "demo123");
    const record = await addConsultationDocs("APT-1001", [document]);
    expect(record.documents).toContainEqual(document);
    expect(getState().consultations.find((c) => c.appointmentId === "APT-1001")?.documents).toContainEqual(document);
    expect(getState().appointments.find((a) => a.id === "APT-1001")?.status).toBe("Completed");
  });
  it("rejects uploads from a doctor not assigned to the visit", async () => {
    await login("mariam@demo.com", "demo123");
    await expect(addConsultationDocs("APT-1001", [{ ...document, id: "unassigned-document" }])).rejects.toThrow("Only the appointment's doctor");
    expect(getState().consultations.find((c) => c.appointmentId === "APT-1001")?.documents.some((d) => d.id === "unassigned-document")).toBe(false);
  });
});