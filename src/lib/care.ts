export type CareKind = "favorite" | "waitlist" | "template" | "referral" | "branch" | "complaint" | "credential" | "reservation" | "home_collection" | "package" | "consent";
export interface CareItem { id: string; ownerId: string; recipientId?: string; kind: CareKind; data: Record<string, string | number | boolean>; createdAt: string }
export interface MedicalSafety { allergies: string; conditions: string; medicines: string; emergencyName: string; emergencyPhone: string; sharing: boolean }
export const emptySafety: MedicalSafety = { allergies: "", conditions: "", medicines: "", emergencyName: "", emergencyPhone: "", sharing: true };
export function validateCare(kind: CareKind, data: CareItem["data"]) {
  if (!String(data.title ?? "").trim()) throw new Error("Name / title is required");
  if (["branch", "home_collection", "package"].includes(kind) && (!Number.isFinite(Number(data.price)) || Number(data.price) < 0)) throw new Error("Enter a valid price");
  if (kind === "waitlist" && !/^\d{4}-\d{2}-\d{2}$/.test(String(data.date ?? ""))) throw new Error("Choose a date");
  if (kind === "reservation" && (!Number.isInteger(Number(data.quantity)) || Number(data.quantity) < 1)) throw new Error("Enter a positive quantity");
}
export function stockAvailable(m: { inStock: boolean; quantity?: number; expiry?: string }, today: string) { return m.inStock && (m.quantity === undefined || m.quantity > 0) && (!m.expiry || m.expiry >= today); }