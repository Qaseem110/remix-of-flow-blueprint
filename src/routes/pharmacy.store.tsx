import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { LocateFixed, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/app/common";
import { mapsUrl } from "@/components/app/MedicineFinder";
import { updatePharmacy, updateUser, useSession, useStore } from "@/lib/store";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/pharmacy/store")({
  head: () => meta("Store details", "Your medical store's contact details and location."),
  component: StoreDetails,
});

function StoreDetails() {
  const user = useSession()!;
  const p = useStore((s) => s.pharmacies.find((x) => x.userId === user.id));
  const [loc, setLoc] = useState<{ lat?: number; lng?: number }>({ lat: p?.lat, lng: p?.lng });
  if (!p) return null;
  const locate = () => {
    if (!navigator.geolocation) return toast.error("Location isn't available on this device");
    navigator.geolocation.getCurrentPosition((pos) => { setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }); toast.success("Location captured — press Save"); }, () => toast.error("Couldn't get location. Allow location access and try again."));
  };
  const save = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    updatePharmacy(user.id, { storeName: f.storeName, phone: f.phone, address: f.address, city: f.city, hours: f.hours || undefined, ...loc });
    updateUser(user.id, { name: f.name, phone: f.phone });
    toast.success("Store details saved");
  };
  const fields: [string, string, string][] = [["storeName", "Store name", p.storeName], ["name", "Owner name", user.name], ["phone", "Phone / WhatsApp", p.phone], ["city", "City", p.city], ["hours", "Timings (optional)", p.hours ?? ""]];
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Store details" subtitle="Patients see this when they find a medicine at your store." />
      <form onSubmit={save} className="grid gap-4 rounded-2xl border bg-card p-6 shadow-soft sm:grid-cols-2">
        {fields.map(([n, l, v]) => <div key={n}><Label htmlFor={n}>{l}</Label><Input id={n} name={n} defaultValue={v} required={n !== "hours"} placeholder={n === "hours" ? "e.g. 9am – 11pm" : undefined} /></div>)}
        <div className="sm:col-span-2"><Label htmlFor="address">Full address</Label><Input id="address" name="address" defaultValue={p.address} required /></div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="button" variant="outline" onClick={locate}><LocateFixed className="mr-1 h-4 w-4" />Use my current location</Button>
          {loc.lat != null ? <span className="text-sm text-muted-foreground">Pinned: {loc.lat.toFixed(5)}, {loc.lng?.toFixed(5)}</span> : <span className="text-sm text-muted-foreground">Not pinned — address will be used for maps.</span>}
          <a href={mapsUrl({ ...p, ...loc })} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary underline"><MapPin className="h-3.5 w-3.5" />Preview on map</a>
        </div>
        <Button className="sm:col-span-2">Save</Button>
      </form>
    </div>
  );
}
