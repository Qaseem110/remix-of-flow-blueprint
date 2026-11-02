import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("@/lib/store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/store")>("@/lib/store");
  return { ...actual, useSession: () => mocks.user, useStore: (sel: (state: ReturnType<typeof actual.getState>) => unknown) => sel(actual.getState()) };
});
vi.mock("@/components/app/common", () => ({ PageHeader: () => null, Avatar: () => null }));
import { Route as ProfileRoute } from "@/routes/doctor.profile";
import { Route as AppointmentsRoute } from "@/routes/doctor.appointments";

afterEach(cleanup);
describe("doctor navigation with incomplete session data", () => {
  it("does not crash when the session disappears during a transition", () => {
    mocks.user = null;
    const Profile = ProfileRoute.options.component;
    const Appointments = AppointmentsRoute.options.component;
    if (!Profile || !Appointments) throw new Error("Doctor pages missing");
    expect(() => render(<Profile />)).not.toThrow();
    expect(() => render(<Appointments />)).not.toThrow();
  });
  it("does not crash when a signed-in doctor profile is missing", () => {
    mocks.user = { id: "missing-doctor" };
    const Profile = ProfileRoute.options.component;
    if (!Profile) throw new Error("Doctor profile page missing");
    expect(() => render(<Profile />)).not.toThrow();
  });
});