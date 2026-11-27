import { MedicineReservation } from "./MedicineReservation";
import { ProviderActions } from "./ProviderActions";
import { useEffect, useState } from "react";
import { MapPin, Phone, Search, Store, MessageCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { recordMedicineSearch, popularMedicineSearches, searchMedicines, useStore, type Pharmacy } from "@/lib/store";
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
  const [popular,setPopular]=useState<string[]>([]);
  useEffect(()=>{void popularMedicineSearches().then(setPopular).catch(()=>{});},[]);
  useEffect(()=>{if(q.trim().length<2)return;const timer=setTimeout(()=>{void recordMedicineSearch(q).then(()=>popularMedicineSearches()).then(setPopular).catch(()=>{});},1000);return()=>clearTimeout(timer);},[q]);
  const results = searchMedicines(st, q, city);
  return (
    <div>
      <div className="-mt-12 relative grid gap-2 rounded-2xl border bg-card p-2 shadow-soft sm:mx-4 sm:grid-cols-[1fr_200px]">
        <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="h-11 border-0 pl-9 shadow-none" placeholder="Medicine name or formula, e.g. Panadol or Paracetamol" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Input className="h-11" placeholder="City (optional)" value={city} onChange={(e) => setCity(e.target.value)} />
      </div>
      <div className="mt-6 grid gap-3">
        {q.trim().length < 2 && <><div className="rounded-2xl border bg-card p-5 shadow-soft"><h2 className="font-semibold">Available medicines</h2><p className="text-sm text-muted-foreground">Type at least 2 letters to search all medical stores.</p>{popular.length>0&&<div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Popular</span>{popular.map(term=><button type="button" key={term} className="rounded-full border bg-secondary/60 px-3 py-1.5 text-sm font-medium hover:bg-secondary" onClick={()=>setQ(term)}>{term}</button>)}</div>}</div></>}
        {q.trim().length >= 2 && results.length === 0 && <p className="text-sm text-muted-foreground">No medical store has listed this medicine yet.</p>}
        {results.map(({ m, p }) => (
          <div key={m.id} className="relative flex flex-wrap items-start justify-between gap-4 overflow-hidden rounded-2xl border bg-card p-5 pl-6 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg before:absolute before:inset-y-0 before:left-0 before:w-1.5 before:bg-linear-to-b before:from-primary before:to-accent">
            <div className="min-w-0 space-y-1">
              <p className="font-display text-lg font-semibold">{m.name} <span className="font-normal text-muted-foreground">{m.strength}</span></p>
              <p className="text-xs text-muted-foreground">{[m.formula, m.form, m.packSize].filter(Boolean).join(" · ")}</p>
              <ProviderActions providerId={p.userId} name={p.storeName} />
              <p className="flex items-center gap-1 pt-1 text-sm"><Store className="h-4 w-4 text-primary" />{p.storeName}</p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{p.address}, {p.city}{p.hours ? ` · ${p.hours}` : ""}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge className="rounded-full bg-accent px-3 py-1 text-base font-bold text-accent-foreground">{fmtPrice(m.price)}</Badge><p className="text-xs text-muted-foreground">Stock updated: {new Date(m.updatedAt).toLocaleDateString()}</p>{m.prescriptionRequired && <p className="text-xs">Prescription required at pickup</p>}<MedicineReservation medicine={m} />
              <div className="flex flex-wrap justify-end gap-2 text-sm">
                <a href={`tel:${p.phone}`} className="inline-flex items-center gap-1 rounded-full border bg-secondary/50 px-3 py-1 font-medium text-primary hover:bg-secondary"><Phone className="h-3.5 w-3.5" />Call</a>
                <a href={wa(p.phone)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border bg-secondary/50 px-3 py-1 font-medium text-primary hover:bg-secondary"><MessageCircle className="h-3.5 w-3.5" />WhatsApp</a>
                <a href={mapsUrl(p)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border bg-secondary/50 px-3 py-1 font-medium text-primary hover:bg-secondary"><MapPin className="h-3.5 w-3.5" />Location</a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
