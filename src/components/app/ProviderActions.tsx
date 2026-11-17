import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { saveCareItem } from '@/lib/store';
import { toast } from 'sonner';
export function ProviderActions({providerId,name}:{providerId:string;name:string;doctor?:boolean}) { return <div className="my-3"><Button size="sm" variant="outline" onClick={()=>void saveCareItem('favorite',{title:name,details:'Saved provider',status:'Saved'},providerId).then(()=>toast.success('Provider saved'),(e:Error)=>toast.error(e.message))}><Heart/>Save provider</Button></div>; }
