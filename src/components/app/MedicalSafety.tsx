import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { emptySafety, type MedicalSafety as Safety } from '@/lib/care';
import { loadMedicalSafety, saveMedicalSafety, useActiveMember, useSession } from '@/lib/store';
export function MedicalSafety({ patientId, memberId, readonly = false }: { patientId?: string; memberId?: string; readonly?: boolean }) {
 const user=useSession(); const active=useActiveMember(); const id=patientId ?? user?.id; const member=memberId ?? active ?? '';
 const [data,setData]=useState<Safety>(emptySafety); const [loaded,setLoaded]=useState(false);
 useEffect(()=>{setLoaded(false); if(id) void loadMedicalSafety(id,member).then((d)=>{setData(d);setLoaded(true)},()=>setLoaded(false));},[id,member]);
 if(!loaded) return <p className="text-sm text-muted-foreground">Medical safety information unavailable.</p>;
 if(readonly) return <section className="space-y-2 border-l-4 border-warning p-3 text-sm"><h3 className="font-semibold">Medical safety · patient reported</h3><p><b>Allergies:</b> {data.allergies || 'Not provided'}</p><p><b>Conditions:</b> {data.conditions || 'Not provided'}</p><p><b>Current medicines:</b> {data.medicines || 'Not provided'}</p><p><b>Emergency:</b> {data.emergencyName} {data.emergencyPhone}</p></section>;
 return <section className="mt-6 space-y-4 border-t pt-6"><h2 className="text-xl font-semibold">Medical safety & emergency contact</h2><form className="grid gap-4 sm:grid-cols-2" onSubmit={(e)=>{e.preventDefault();void saveMedicalSafety(member,data).then(()=>toast.success('Medical details saved'),(e:Error)=>toast.error(e.message));}}>
 {(['allergies','conditions','medicines','emergencyName','emergencyPhone'] as const).map((k)=><div key={k} className={['allergies','conditions','medicines'].includes(k)?'sm:col-span-2':''}><Label htmlFor={`s-${k}`}>{({allergies:'Allergies',conditions:'Medical conditions',medicines:'Current medicines',emergencyName:'Emergency contact name',emergencyPhone:'Emergency contact phone'})[k]}</Label>{['allergies','conditions','medicines'].includes(k)?<Textarea id={`s-${k}`} value={data[k]} onChange={(e)=>setData({...data,[k]:e.target.value})}/>:<Input id={`s-${k}`} value={data[k]} onChange={(e)=>setData({...data,[k]:e.target.value})}/>}</div>)}
 <label className="flex items-center gap-2 text-sm sm:col-span-2"><Switch checked={data.sharing} onCheckedChange={(sharing)=>setData({...data,sharing})}/>Allow PIN-authorized doctors to view this member's safety information</label><Button className="sm:col-span-2">Save medical details</Button></form></section>;
}
