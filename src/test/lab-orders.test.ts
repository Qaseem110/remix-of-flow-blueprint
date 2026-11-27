import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLabOrder, deleteDocument, getState, login, registerLab, saveLabSchedule, uploadLabResults } from "@/lib/store";

let labId = "";
beforeEach(async () => {
  vi.stubGlobal("URL", { createObjectURL: () => "blob:test" });
  labId = await registerLab({ name: "Lab Owner", email: `lab${Math.random()}@t.test`, phone: "0300", password: "secret1", labName: "City Lab", address: "Main road", city: "Lahore" });
  await saveLabSchedule(labId, { slotMinutes: 30, weeklyShifts: {}, dateOverrides: { "2026-12-01": [{ start: "09:00", end: "12:00", capacity: 10 }] } });
});
const asPatient = async () => {
  await login("patient@demo.com", "demo123");
  return getState().sessionUserId!;
};

describe("laboratory tests", () => {
  it("patient cannot attach an appointment that has no prescription", async () => {
    const me = await asPatient();
    const noRx = getState().appointments.find((a) => a.patientId === me && !getState().consultations.some((c) => c.appointmentId === a.id))!;
    await expect(createLabOrder({ labId, appointmentId: noRx.id, tests: "CBC", date: "2026-12-01" })).rejects.toThrow("Prescription not found");
  });
  it("lab reports uploaded by the lab cannot be deleted and reach the patient", async () => {
    const me = await asPatient();
    const rx = getState().consultations.find((c) => c.patientId === me && c.prescription.length > 0)!;
    const o = await createLabOrder({ labId, appointmentId: rx.appointmentId, tests: "CBC", date: "2026-12-01", time: "09:00" });
    const lab = getState().users.find((u) => u.id === labId)!;
    await login(lab.email, "secret1");
    await uploadLabResults(o.id, [new File(["x"], "cbc.pdf", { type: "application/pdf" })]);
    const saved = getState().labOrders.find((x) => x.id === o.id)!;
    expect(saved.status).toBe("Completed");
    expect(saved.patientId).toBe(me);
    expect(() => deleteDocument(saved.documents[0].id)).toThrow("cannot be deleted");
  });
});

describe("lab tokens", () => {
  it("each booking on the same lab day gets the next token number", async () => {
    const me = await asPatient();
    const rx = getState().consultations.find((c) => c.patientId === me && c.prescription.length > 0)!;
    const a = await createLabOrder({ labId, appointmentId: rx.appointmentId, tests: "CBC", date: "2026-12-01", time: "09:00" });
    const b = await createLabOrder({ labId, appointmentId: rx.appointmentId, tests: "LFT", date: "2026-12-01", time: "09:30" });
    expect([a.token, b.token]).toEqual([1, 2]);
  });
});

describe("lab report discussion", () => {
  it("patient and prescribing doctor can discuss; the lab cannot", async () => {
    const { postLabMessage } = await import("@/lib/store");
    const me = await asPatient();
    const rx = getState().consultations.find((c) => c.patientId === me && c.prescription.length > 0)!;
    const o = await createLabOrder({ labId, appointmentId: rx.appointmentId, tests: "LFT", date: "2026-12-01", time: "09:00" });
    await postLabMessage(o.id, "Is this normal?");
    expect(getState().labMessages.filter((m) => m.orderId === o.id)).toHaveLength(1);
    const lab = getState().users.find((u) => u.id === labId)!;
    await login(lab.email, "secret1");
    await expect(postLabMessage(o.id, "hi")).rejects.toThrow("Only the patient and doctor");
  });
});
