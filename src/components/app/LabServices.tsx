import { useEffect,useState } from 'react';
import { loadCareItems } from '@/lib/store';
import type { CareItem } from '@/lib/care';
import { fmtPrice, fmtTime } from '@/lib/utils';
export function LabServices({labId}:{labId:string}) {
 const [items,setItems]=useState<CareItem[]>([]); useEffect(()=>{void loadCareItems().then(xs=>setItems(xs.filter(x=>x.ownerId===labId&&x.kind==='home_collection'&&x.data.status!=='Archived'&&x.data.published)))},[labId]);
 return <div className="space-y-3">{items.map(item=><div key={item.id} className="border-t pt-3 text-sm"><h3 className="font-semibold">{String(item.data.title)} · {fmtPrice(Number(item.data.price))}</h3><p>{String(item.data.details)}</p><p>Areas: {String(item.data.areas??'')}</p><p>{String(item.data.weekdays??'').split(',').filter(Boolean).map(d=>['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][Number(d)]).join(', ')} · {fmtTime(String(item.data.start??'09:00'))}–{fmtTime(String(item.data.end??'17:00'))}</p><p>Rider fee: {Number(item.data.riderFee??0)===0?'Free':fmtPrice(Number(item.data.riderFee))}</p>{item.data.contact&&<a className="text-primary underline" href={`tel:${String(item.data.contact)}`}>Contact: {String(item.data.contact)}</a>}</div>)}</div>;
}
