import { useEffect,useState } from 'react';
import { loadCareItems } from '@/lib/store';
import type { CareItem } from '@/lib/care';
import { fmtPrice } from '@/lib/utils';
export function DoctorBranches({doctorId}:{doctorId:string}){const [items,setItems]=useState<CareItem[]>([]);useEffect(()=>{void loadCareItems().then(xs=>setItems(xs.filter(x=>x.ownerId===doctorId&&x.kind==='branch'&&x.data.status!=='Archived')))},[doctorId]);return <section className="my-4 space-y-3">{items.map(i=><article key={i.id} className="border-l-2 border-primary pl-3"><h3 className="font-semibold">{String(i.data.title)} · {fmtPrice(Number(i.data.price))}</h3><p className="whitespace-pre-wrap text-sm">{String(i.data.details)}</p></article>)}</section>}
