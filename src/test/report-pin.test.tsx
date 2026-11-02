import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PatientHistory } from "@/components/app/PatientHistory";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), hydrate: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/lib/store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/store")>("@/lib/store");
  return { ...actual, hydrate: mocks.hydrate };
});
import { login } from "@/lib/store";

describe("PIN-protected patient history", () => {
  beforeEach(async () => {
    await login("doctor@demo.com", "demo123");
    mocks.rpc.mockReset(); mocks.hydrate.mockClear();
    mocks.rpc.mockImplementation(async (method: string) => ({ data: method === "has_report_pin", error: null }));
  });
  afterEach(cleanup);
  it("hides prior diagnoses and refuses an incorrect PIN", async () => {
    render(<PatientHistory patientId="u-pat1" />);
    await screen.findByRole("button", { name: "Unlock" });
    expect(screen.queryByText(/Previous consultations/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Patient's report PIN"), { target: { value: "1111" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("unlock_patient_reports", { patient: "u-pat1", pin: "1111" }));
    expect(screen.queryByText(/Previous consultations/)).not.toBeInTheDocument();
    expect(mocks.hydrate).not.toHaveBeenCalled();
  });
  it("loads history only after the server accepts the patient's PIN", async () => {
    mocks.rpc.mockImplementation(async (method: string, args: { pin?: string }) => ({ data: method === "has_report_pin" || (method === "unlock_patient_reports" && args.pin === "2468"), error: null }));
    render(<PatientHistory patientId="u-pat1" />);
    await screen.findByRole("button", { name: "Unlock" });
    fireEvent.change(screen.getByLabelText("Patient's report PIN"), { target: { value: "2468" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    await screen.findByText(/Previous consultations/);
    expect(mocks.hydrate).toHaveBeenCalledWith("u-doc1");
  });
});