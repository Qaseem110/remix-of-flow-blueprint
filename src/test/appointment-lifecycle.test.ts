import { describe, expect, it } from "vitest";
import { appointmentStatus, clinicDate } from "@/lib/appointment-lifecycle";
import { bookAppointment, cancelAppointment, getState, trackingNumber } from "@/lib/store";

describe("appointment tracking and expiration", () => {
  it("uses digits only for newly booked tracking numbers", async () => {
    const state = getState();
    const a = await bookAppointment({ doctorId: state.availability[0].doctorId, patientId: state.patients[0].userId, date: "2027-03-01", type: "online", reason: "Check-up", documents: [] });
    try { expect(trackingNumber(a)).toMatch(/^[0-9]+$/); }
    finally { cancelAppointment(a.id, "patient"); }
  });
  it("closes active appointments after their date, not today", () => {
    for (const status of ["Pending", "Confirmed", "Checked-In", "Waiting", "Ready to Join", "In Consultation"]) {
      expect(appointmentStatus("2026-11-15", status, "2026-11-16")).toBe("Expired");
      expect(appointmentStatus("2026-11-16", status, "2026-11-16")).toBe(status);
      expect(appointmentStatus("2026-11-17", status, "2026-11-16")).toBe(status);
    }
  });
  it("keeps finished medical history unchanged", () => {
    for (const status of ["Completed", "Cancelled", "Rescheduled", "No Show"]) expect(appointmentStatus("2026-11-15", status, "2026-11-16")).toBe(status);
  });
  it("uses the clinic date even before UTC midnight", () => {
    expect(clinicDate(new Date("2026-11-16T22:30:00Z"))).toBe("2026-11-17");
  });
  it("closes missed lab bookings but preserves collected samples and completed reports", () => {
    expect(appointmentStatus("2026-11-15", "Requested", "2026-11-16")).toBe("Expired");
    expect(appointmentStatus("2026-11-15", "Sample collected", "2026-11-16")).toBe("Sample collected");
    expect(appointmentStatus("2026-11-15", "Completed", "2026-11-16")).toBe("Completed");
  });
});