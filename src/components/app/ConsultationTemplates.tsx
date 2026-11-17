import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from '@/components/ui/select';
import { loadCareItems, useSession, type Consultation } from '@/lib/store';
import type { CareItem } from '@/lib/care';
import { templatePrescription } from './TemplateEditor';
export function ConsultationTemplates({onApply}:{onApply:(patch:Partial<Consultation>)=>void}) {
 const user=useSession(); const [items,setItems]=useState<CareItem[]>([]); const [pick,setPick]=useState('none');
 useEffect(()=>{void loadCareItems().then(xs=>setItems(xs.filter(x=>x.ownerId===user?.id&&x.kind==='template'&&x.data.status!=='Archived')))},[user?.id]);
 return <div className="flex flex-wrap gap-2"><Select value={pick} onValueChange={setPick}><SelectTrigger className="w-56" aria-label="Consultation template"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Select template</SelectItem>{items.map(i=><SelectItem key={i.id} value={i.id}>{String(i.data.title)}</SelectItem>)}</SelectContent></Select><Button variant="outline" disabled={pick==='none'} onClick={()=>{const item=items.find(i=>i.id===pick); if(item)onApply({symptoms:String(item.data.symptoms??''),diagnosis:String(item.data.diagnosis??''),privateNotes:String(item.data.details??''),summary:String(item.data.summary??''),labTests:String(item.data.labTests??''),prescription:templatePrescription(item.data)});}}>Apply consultation template</Button></div>;
}
