import { describe, it, expect } from "vitest";
import { bookWalkIn, getState, nextAvailableDate } from "@/lib/store";

describe("reception walk-in booking", () => {
  it("is refused for an account that isn't the doctor's reception", async () => {
    await expect(bookWalkIn({ doctorId: "u-doc1", date: "2099-01-01", reason: "x", type: "clinic", name: "Ali", phone: "03001234567" })).rejects.toThrow();
  });
  it("books a walk-in into the queue with their name and phone", async () => {
    (getState() as { sessionUserId: string | null }).sessionUserId = "u-rec1";
    const date = nextAvailableDate("u-doc1")!;
    const a = await bookWalkIn({ doctorId: "u-doc1", date, reason: "Fever", type: "clinic", name: "Ali Khan", phone: "0300 1234567" });
    expect(a.walkIn).toMatchObject({ name: "Ali Khan", phone: "03001234567" });
    expect(a.queueNumber).toBeGreaterThan(0);
    expect(getState().notifications.some((n) => n.userId === "u-rec1" && n.title.startsWith("Ali Khan"))).toBe(true);
  });
});
