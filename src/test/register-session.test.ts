import { describe, it, expect } from "vitest";
import { registerPatient, getState } from "@/lib/store";

// The register page decides where to send a new account by checking whether a
// session exists: signed in -> role dashboard, not signed in -> sign-in page
// with a "confirm your email" notice.
describe("registration session signal", () => {
  it("signs the new patient in when no email confirmation is required", async () => {
    const id = await registerPatient({
      name: "Rina Test",
      email: `rp${Date.now()}@test.local`,
      phone: "03001234567",
      password: "testing123",
      dob: "1990-01-01",
      gender: "Female",
    });
    expect(getState().sessionUserId).toBe(id);
  });

  it("refuses a second account on the same email", async () => {
    const email = `dup${Date.now()}@test.local`;
    await registerPatient({ name: "First", email, phone: "03001234567", password: "testing123", dob: "1990-01-01", gender: "Male" });
    await expect(
      registerPatient({ name: "Second", email, phone: "03001234567", password: "testing123", dob: "1990-01-01", gender: "Male" }),
    ).rejects.toThrow("Email already registered");
  });
});
