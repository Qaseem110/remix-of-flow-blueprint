import { useState } from 'react';
import { Bell, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { setPrescriptionAlerts, useCareItems } from '@/lib/store';
import { fmtTime } from '@/lib/utils';
export function PrescriptionAlerts({appointmentId,index,times}:{appointmentId:string;index:number;times:string[]}){
 const items=useCareItems();const override=items.find(x=>x.kind==='consent'&&x.data.alertAppointment===appointmentId&&Number(x.data.alertIndex)===index);const current=override?String(override.data.alertTimes??'').split(',').filter(Boolean):times;const [editing,setEditing]=useState(false);const [draft,setDraft]=useState<string[]>([]);const [time,setTime]=useState('');const [busy,setBusy]=useState(false);
 const save=async()=>{setBusy(true);try{await setPrescriptionAlerts(appointmentId,index,draft);setEditing(false);toast.success('Medicine alerts saved');}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}};
 return <div className="min-w-40 space-y-2"><p className="text-xs">{current.map(fmtTime).join(', ')||'No alerts'}</p><Button size="sm" variant="outline" onClick={()=>{setDraft(current);setEditing(!editing);}}><Bell/>Set alerts</Button>{editing&&<div className="space-y-2">{draft.map(t=><div key={t} className="flex items-center gap-1 text-sm">{fmtTime(t)}<Button size="icon" variant="ghost" aria-label={`Remove ${fmtTime(t)} alert`} onClick={()=>setDraft(xs=>xs.filter(x=>x!==t))}><X/></Button></div>)}<Input aria-label="Medicine alert time" type="time" value={time} onChange={e=>setTime(e.target.value)}/><Button size="sm" variant="secondary" disabled={!time||draft.includes(time)} onClick={()=>{setDraft(xs=>[...xs,time].sort());setTime('');}}>Add time</Button><Button size="sm" disabled={busy} onClick={()=>void save()}>Save alerts</Button></div>}</div>;
}