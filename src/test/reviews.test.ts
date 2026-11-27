import { describe, expect, it } from "vitest";
import { addReview, getState } from "@/lib/store";

describe("reviews", () => {
  it("rejects reviews for visits that are not completed", () => {
    const a = getState().appointments.find((x) => x.status !== "Completed");
    if (!a) return;
    expect(() => addReview({ appointmentId: a.id, rating: 5, comment: "" })).toThrow();
  });
  it("allows only one review per completed visit", () => {
    const a = getState().appointments.find((x) => x.status === "Completed");
    if (!a) return;
    addReview({ appointmentId: a.id, rating: 4, comment: "Good" });
    expect(() => addReview({ appointmentId: a.id, rating: 5, comment: "" })).toThrow();
  });
  it("rejects detailed answers outside 1 to 5", () => {
    const a = getState().appointments.filter((x) => x.status === "Completed" && !getState().reviews.some((r) => r.appointmentId === x.id))[0];
    if (!a) return;
    expect(() => addReview({ appointmentId: a.id, rating: 5, comment: "", aspects: { Listening: 6 } })).toThrow();
    const r = addReview({ appointmentId: a.id, rating: 5, comment: "", aspects: { Listening: 5 }, waitTime: "On time", recommend: true, tags: ["Polite staff", "made up"] });
    expect(r.tags).toEqual(["Polite staff"]);
  });
});
