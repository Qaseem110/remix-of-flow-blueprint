import { describe, expect, it } from "vitest";
import { validatePost, videoEmbed } from "@/lib/feed";
import { isVolunteerSessionUpcoming, type VolunteerSession } from "@/lib/store";

describe("feed rules", () => {
  const base = { title: "Fever care", body: "", summary: "", images: [] as string[] };
  it("video needs a link and a summary", () => {
    expect(() => validatePost({ ...base, kind: "video", video_url: "https://youtu.be/abc", summary: "" })).toThrow("summary");
    expect(() => validatePost({ ...base, kind: "video", video_url: "not a link", summary: "A clear summary here" })).toThrow("video link");
    expect(() => validatePost({ ...base, kind: "video", video_url: "https://vimeo.com/123", summary: "A clear summary here" })).not.toThrow();
  });
  it("photo post needs a picture", () => {
    expect(() => validatePost({ ...base, kind: "photo" })).toThrow("picture");
  });
  it("embeds YouTube links", () => {
    expect(videoEmbed("https://www.youtube.com/watch?v=xyz")).toBe("https://www.youtube.com/embed/xyz");
  });
  it("free checkup closes once its end time passes", () => {
    const v = { status: "Open", date: "2026-11-25", end: "18:00" } as VolunteerSession;
    expect(isVolunteerSessionUpcoming(v, "2026-11-25", "18:30")).toBe(false);
    expect(isVolunteerSessionUpcoming(v, "2026-11-25", "17:00")).toBe(true);
  });
});
