import { describe, it, expect } from "vitest";
import { searchMedicines, type Medicine, type Pharmacy } from "@/lib/store";

const p: Pharmacy[] = [
  { userId: "s1", storeName: "City Pharmacy", phone: "03001234567", address: "Main Rd", city: "Lahore" },
  { userId: "s2", storeName: "Care Medical", phone: "03007654321", address: "Mall Rd", city: "Karachi" },
];
const m = (o: Partial<Medicine>): Medicine => ({ id: Math.random().toString(), pharmacyId: "s1", name: "Panadol", formula: "Paracetamol", strength: "500mg", form: "Tablet", price: 100, inStock: true, updatedAt: "", ...o });

describe("medicine search", () => {
  it("finds by formula as well as name", () => {
    expect(searchMedicines({ pharmacies: p, medicines: [m({})] }, "paracet")).toHaveLength(1);
  });
  it("hides out-of-stock medicines", () => {
    expect(searchMedicines({ pharmacies: p, medicines: [m({ inStock: false })] }, "panadol")).toHaveLength(0);
  });
  it("filters by city and sorts cheapest first", () => {
    const meds = [m({ price: 150 }), m({ price: 90 }), m({ pharmacyId: "s2", price: 50 })];
    const r = searchMedicines({ pharmacies: p, medicines: meds }, "panadol", "lahore");
    expect(r.map((x) => x.m.price)).toEqual([90, 150]);
  });
});
