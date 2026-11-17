import { createFileRoute } from '@tanstack/react-router';
import { useStore } from '@/lib/store';
import { meta } from '@/lib/meta';
import { fmtPrice } from '@/lib/utils';
import { stockAvailable } from '@/lib/care';
import { todayStr } from '@/lib/store';
import { PageHeader } from '@/components/app/common';
import { MedicineReservation } from '@/components/app/MedicineReservation';
import { ProviderActions } from '@/components/app/ProviderActions';
export const Route=createFileRoute('/patient/stores/$id')({head:()=>meta('Medical store profile','Medical store location, contact and available medicine prices.'),component:StoreProfile});
function StoreProfile(){const {id}=Route.useParams();const s=useStore(s=>s);const p=s.pharmacies.find(p=>p.userId===id);if(!p)return <p>Medical store not found.</p>;return <div className="mx-auto max-w-4xl space-y-5"><PageHeader title={p.storeName}/><p>{p.address}, {p.city}</p><a className="text-primary underline" href={`tel:${p.phone}`}>{p.phone}</a><p>{p.hours}</p><ProviderActions providerId={id} name={p.storeName}/><section className="divide-y">{s.medicines.filter(m=>m.pharmacyId===id&&stockAvailable(m,todayStr())).map(m=><article key={m.id} className="flex flex-wrap justify-between gap-4 py-4"><div><h2 className="font-semibold">{m.name} · {m.strength}</h2><p>{m.formula} · {m.form}</p><p>{fmtPrice(m.price)}</p></div><MedicineReservation medicine={m}/></article>)}</section></div>}
