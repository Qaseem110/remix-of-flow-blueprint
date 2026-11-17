import { beforeEach, describe, expect, it, vi } from "vitest";
import { cancelDoctorDay, getState, receptionAttendance, todayStr, saveDoctorAlertSettings } from "@/lib/store";

beforeEach(() => vi.resetModules());
describe("clinic controls", () => {
  it("reception can mark arrival with check-in permission", async () => {
    const s = getState(); s.sessionUserId = "u-rec1";
    const a = s.appointments.find((a) => a.id === "APT-1003");
    if (!a) throw new Error("Missing fixture");
    a.date = todayStr(); a.type = "clinic"; a.status = "Confirmed";
    await receptionAttendance(a.id, true);
    expect(getState().appointments.find((x) => x.id === a.id)?.status).toBe("Waiting");
    expect(getState().appointments.find((x) => x.id === a.id)?.checkedInAt).toBeTruthy();
  });
  it("reception can mark absence and close the queue gap", async () => {
    const s = getState(); s.sessionUserId = "u-rec1";
    const a = s.appointments.find((a) => a.id === "APT-1003");
    if (!a) throw new Error("Missing fixture");
    await receptionAttendance(a.id, false);
    expect(getState().appointments.find((x) => x.id === a.id)?.status).toBe("No Show");
    expect(getState().appointments.find((x) => x.id === "APT-1004")?.queueNumber).toBe(3);
  });
  it("attendance is denied when doctor disables check-in permission", async () => {
    const s = getState(); s.sessionUserId = "u-rec1";
    const r = s.receptionists.find((r) => r.id === "u-rec1");
    if (!r) throw new Error("Missing fixture");
    r.permissions.checkIn = false;
    await expect(receptionAttendance("APT-1004", false)).rejects.toThrow("permission");
    r.permissions.checkIn = true;
  });
  it("bulk cancellation requires a reason", async () => {
    getState().sessionUserId = "u-doc1";
    await expect(cancelDoctorDay(todayStr(), " ")).rejects.toThrow("reason");
  });
  it("bulk cancellation notifies patients with the reason and preserves completed visits", async () => {
    const s = getState(); s.sessionUserId = "u-doc1";
    const completed = s.appointments.find((a) => a.id === "APT-1001");
    if (!completed) throw new Error("Missing fixture");
    completed.status = "Completed";
    const n = await cancelDoctorDay(todayStr(), "Clinic emergency");
    expect(n).toBeGreaterThan(0);
    expect(getState().appointments.find((a) => a.id === completed.id)?.status).toBe("Completed");
    expect(getState().notifications.some((n) => n.title === "Appointment cancelled" && n.body.includes("Clinic emergency"))).toBe(true);
  });
  it("daily summary requires a valid time and international WhatsApp number", async () => {
    getState().sessionUserId = "u-doc1";
    await expect(saveDoctorAlertSettings({ enabled: true, dailyTime: "25:00", phone: "+923001234567", discussionAlerts: true })).rejects.toThrow("time");
    await expect(saveDoctorAlertSettings({ enabled: true, dailyTime: "08:00", phone: "0300", discussionAlerts: true })).rejects.toThrow("country code");
    await expect(saveDoctorAlertSettings({ enabled: true, dailyTime: "08:00", phone: "+923001234567", discussionAlerts: true })).resolves.toBeUndefined();
  });
});