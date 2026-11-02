import { describe, expect, it } from "vitest";
import { dayAppointments, getState, markNoShow, moveInQueue, returnToQueue, todayStr, waitingQueue } from "@/lib/store";

const doctor = "u-doc1";
const queue = () => waitingQueue(dayAppointments(doctor, todayStr())).map((a) => a.id);

describe("absent patients in the queue", () => {
  it("an absent patient can be returned at a chosen position", () => {
    const before = queue();
    expect(before.length).toBeGreaterThan(0);
    const absentId = before[0];
    markNoShow(absentId);
    expect(queue()).not.toContain(absentId);
    const rest = queue();
    returnToQueue(absentId, 1);
    expect(getState().appointments.find((a) => a.id === absentId)?.status).toBe("Waiting");
    expect(queue()).toEqual([rest[0], absentId, ...rest.slice(1)]);
    markNoShow(absentId);
    returnToQueue(absentId, 0);
    expect(queue()[0]).toBe(absentId);
  });

  it("a waiting patient can be moved down one place", () => {
    const q = queue();
    if (q.length < 2) return;
    moveInQueue(q[0], 1);
    expect(queue().slice(0, 2)).toEqual([q[1], q[0]]);
  });
});
