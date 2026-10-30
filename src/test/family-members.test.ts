import { describe, expect, it } from "vitest";
import { addDays, format } from "date-fns";
import { bookAppointment, ensureFamilyMember, getSlots, getState, memberOf } from "@/lib/store";

function openSlot() {
  for (const av of getState().availability) for (let i = 1; i < 14; i++) {
    const date = format(addDays(new Date(), i), "yyyy-MM-dd");
    const s = getSlots(av.doctorId, date).find((x) => x.available);
    if (s) return { doctorId: av.doctorId, date, time: s.time };
  }
  throw new Error("no slot");
}

describe("linked family accounts", () => {
  it("booking for a new name auto-creates one linked account and reuses it", () => {
    const pid = getState().patients[0].userId;
    const a = ensureFamilyMember(pid, "Shazal", "Sister");
    const b = ensureFamilyMember(pid, "shazal");
    expect(b.id).toBe(a.id);
    expect(getState().patients[0].members?.filter((m) => m.name === "Shazal")).toHaveLength(1);
  });
  it("a member's appointment does not show under the main account", () => {
    const pid = getState().patients[0].userId;
    const m = ensureFamilyMember(pid, "Shazal", "Sister");
    const appt = bookAppointment({ ...openSlot(), patientId: pid, memberId: m.id, memberName: m.name, type: "clinic", reason: "Fever", documents: [] });
    expect(memberOf(appt)).toBe(m.id);
    const mainList = getState().appointments.filter((x) => x.patientId === pid && memberOf(x) === null);
    expect(mainList.some((x) => x.id === appt.id)).toBe(false);
  });
});
