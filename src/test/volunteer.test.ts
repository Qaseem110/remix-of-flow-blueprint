import { describe, expect, it } from "vitest";
import { bookVolunteer, getState, login, saveVolunteerSession, todayStr } from "@/lib/store";

const asDoctor = async () => { const d = getState().users.find((u) => u.role === "doctor")!; await login(d.email, "demo123"); };
const input = { date: todayStr(), start: "10:00", end: "12:00", mode: "clinic" as const, location: "Free camp, Main road", city: "Lahore", capacity: 2 };

describe("volunteer free checkups", () => {
  it("in-clinic sessions require an address", async () => {
    await asDoctor();
    await expect(saveVolunteerSession({ ...input, location: "" })).rejects.toThrow("clinic address");
  });
  it("patients get tokens in order and cannot exceed the free spots", async () => {
    await asDoctor();
    const v = await saveVolunteerSession(input);
    await login("patient@demo.com", "demo123");
    expect((await bookVolunteer(v.id, "Fever")).token).toBe(1);
    expect((await bookVolunteer(v.id, "Cough", "Ali")).token).toBe(2);
    await expect(bookVolunteer(v.id, "Again", "Sara")).rejects.toThrow("free spots");
  });
});
