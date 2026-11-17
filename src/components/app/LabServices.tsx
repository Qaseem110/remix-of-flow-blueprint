import { useEffect,useState } from 'react';
import { loadCareItems,saveCareItem } from '@/lib/store';
import type { CareItem } from '@/lib/care';
import { fmtPrice } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
export function LabServices({labId}:{labId:string}){const [items,setItems]=useState<CareItem[]>([]);useEffect(()=>{void loadCareItems().then(xs=>setItems(xs.filter(x=>x.ownerId===labId&&['package','home_collection'].includes(x.kind)&&x.data.status!=='Archived'&&x.data.published)))},[labId]);return <div className="space-y-3">{items.map(item=><div key={item.id} className="border-t pt-3 text-sm"><h3 className="font-semibold">{String(item.data.title)} · {fmtPrice(Number(item.data.price))}</h3><p>{String(item.data.details)}</p>{item.kind==='home_collection'&&<Button size="sm" variant="outline" className="mt-2" onClick={()=>void saveCareItem('complaint',{title:`Home collection request: ${item.data.title}`,details:'Please contact me to confirm the area, visit time and prescription requirements.',status:'Requested'},labId).then(()=>toast.success('Collection request sent — appointment not yet booked'),(e:Error)=>toast.error(e.message))}>Request collection contact</Button>}</div>)}</div>}
