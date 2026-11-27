import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { saveCareItem, useCareItems, useSession } from '@/lib/store';
import { toast } from 'sonner';
export function ProviderActions({providerId,name}:{providerId:string;name:string;doctor?:boolean}) { const user=useSession();const items=useCareItems();const [busy,setBusy]=useState(false);const saved=items.some(i=>i.ownerId===user?.id&&i.kind==='favorite'&&i.recipientId===providerId&&i.data.status!=='Archived');if(!user) return null;return <div className="my-3"><Button size="sm" variant={saved?'secondary':'outline'} disabled={saved||busy} aria-pressed={saved} onClick={async()=>{setBusy(true);try{await saveCareItem('favorite',{title:name,details:'Saved provider',status:'Saved'},providerId);toast.success('Provider saved');}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}}}><Heart/>{saved?'Saved':busy?'Saving…':'Save provider'}</Button></div>; }
