import { MedicineReservation } from "./MedicineReservation";
import { ProviderActions } from "./ProviderActions";
import { useState } from "react";
import { MapPin, Phone, Search, Store, MessageCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { searchMedicines, useStore, type Pharmacy } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { saveCareItem } from "@/lib/store";
import { fmtPrice } from "@/lib/utils";

export const mapsUrl = (p: Pharmacy) =>
  p.lat != null && p.lng != null
    ? `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.storeName} ${p.address} ${p.city}`)}`;
const wa = (phone: string) => `https://wa.me/${phone.replace(/[^\d]/g, "").replace(/^0/, "92")}`;

/** Search medicines listed by medical stores; shows store contact and map location. */
export function MedicineFinder() {
  const st = useStore((s) => s);
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const results = searchMedicines(st, q, city);
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
        <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Medicine name or formula, e.g. Panadol or Paracetamol" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Input placeholder="City (optional)" value={city} onChange={(e) => setCity(e.target.value)} />
      </div>
      <div className="mt-6 space-y-3">
        {q.trim().length < 2 && <p className="text-sm text-muted-foreground">Type at least 2 letters to search {st.medicines.length} listed medicines across {st.pharmacies.length} medical stores.</p>}
        {q.trim().length >= 2 && results.length === 0 && <p className="text-sm text-muted-foreground">No medical store has listed this medicine yet.</p>}
        {results.map(({ m, p }) => (
          <div key={m.id} className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border bg-card p-4 shadow-soft">
            <div className="min-w-0 space-y-1">
              <p className="font-semibold">{m.name} <span className="font-normal text-muted-foreground">{m.strength}</span></p>
              <p className="text-xs text-muted-foreground">{[m.formula, m.form, m.packSize].filter(Boolean).join(" · ")}</p>
              <ProviderActions providerId={p.userId} name={p.storeName} />
              <p className="flex items-center gap-1 pt-1 text-sm"><Store className="h-4 w-4 text-primary" />{p.storeName}</p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{p.address}, {p.city}{p.hours ? ` · ${p.hours}` : ""}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge variant="secondary" className="text-sm">{fmtPrice(m.price)}</Badge><p className="text-xs text-muted-foreground">Stock updated: {new Date(m.updatedAt).toLocaleDateString()}</p>{m.prescriptionRequired && <p className="text-xs">Prescription required at pickup</p>}<MedicineReservation medicine={m} />
              <div className="flex flex-wrap justify-end gap-2 text-sm">
                <a href={`tel:${p.phone}`} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-primary"><Phone className="h-3.5 w-3.5" />Call</a>
                <a href={wa(p.phone)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-primary"><MessageCircle className="h-3.5 w-3.5" />WhatsApp</a>
                <a href={mapsUrl(p)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-primary"><MapPin className="h-3.5 w-3.5" />Location</a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
