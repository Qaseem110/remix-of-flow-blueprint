import { useState } from 'react';
import { Heart, ListPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { saveCareItem,todayStr } from '@/lib/store';
import { toast } from 'sonner';
export function ProviderActions({providerId,name,doctor=false}:{providerId:string;name:string;doctor?:boolean}){const [date,setDate]=useState(todayStr());const save=(kind:'favorite'|'waitlist')=>void saveCareItem(kind,{title:name,details:kind==='favorite'?'Saved provider':'Please notify me when a place is available.',date,status:kind==='favorite'?'Saved':'Waiting'},providerId).then(()=>toast.success(kind==='favorite'?'Provider saved':'Added to waitlist — no appointment reserved'),(e:Error)=>toast.error(e.message));return <div className="my-3 flex flex-wrap items-end gap-2"><Button size="sm" variant="outline" onClick={()=>save('favorite')}><Heart/>Save provider</Button>{doctor&&<><div><Label htmlFor={`wait-${providerId}`}>Waitlist day</Label><Input id={`wait-${providerId}`} type="date" min={todayStr()} value={date} onChange={(e)=>setDate(e.target.value)}/></div><Button variant="outline" size="sm" onClick={()=>save('waitlist')}><ListPlus/>Join waitlist</Button></>}</div>}
