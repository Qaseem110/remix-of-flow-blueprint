import { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { MedicineInput } from './MedicineInput';
import { saveCareItem, type PrescriptionItem } from '@/lib/store';
import type { CareItem } from '@/lib/care';
const empty = (): PrescriptionItem => ({ medicine: '', dosage: '', frequency: '', duration: '', instructions: '', times: [] });
export function templatePrescription(data: CareItem['data']): PrescriptionItem[] {
 try { const parsed: unknown = JSON.parse(String(data.prescription ?? '[]')); return Array.isArray(parsed) ? parsed.filter((x): x is PrescriptionItem => typeof x === 'object' && x !== null && typeof x.medicine === 'string' && typeof x.dosage === 'string' && typeof x.frequency === 'string' && typeof x.duration === 'string' && typeof x.instructions === 'string').map(x => ({ ...x, times: x.times ? [...x.times] : [] })) : []; } catch { return []; }
}
export function TemplateEditor({ onSaved, existing }: { onSaved: () => void; existing?: CareItem }) {
 const [title, setTitle] = useState(''); const [symptoms,setSymptoms] = useState(''); const [diagnosis,setDiagnosis] = useState(''); const [notes,setNotes] = useState(''); const [summary,setSummary] = useState(''); const [labTests,setLabTests] = useState(''); const [rx,setRx] = useState<PrescriptionItem[]>([]); const [busy,setBusy] = useState(false);
 useEffect(() => { setTitle(String(existing?.data.title ?? '')); setSymptoms(String(existing?.data.symptoms ?? '')); setDiagnosis(String(existing?.data.diagnosis ?? '')); setNotes(String(existing?.data.details ?? '')); setSummary(String(existing?.data.summary ?? '')); setLabTests(String(existing?.data.labTests ?? '')); setRx(existing ? templatePrescription(existing.data) : []); }, [existing]);
 const change = (i: number, patch: Partial<PrescriptionItem>) => setRx(xs => xs.map((x,j) => j === i ? { ...x,...patch } : x));
 return <form className="space-y-4 border-y py-5" onSubmit={async e => { e.preventDefault(); setBusy(true); try { await saveCareItem('template', { title, symptoms, diagnosis, details: notes, summary, labTests, prescription: JSON.stringify(rx.filter(x => x.medicine.trim())), status: 'Saved' }, undefined, existing?.id); onSaved(); toast.success('Consultation template saved'); } catch(e) { toast.error((e as Error).message); } finally { setBusy(false); } }}>
 <div><Label>Template name *</Label><Input aria-label="Template name" required value={title} onChange={e=>setTitle(e.target.value)} /></div>
 <div><Label>Symptoms / chief complaint</Label><Textarea aria-label="Template symptoms" value={symptoms} onChange={e=>setSymptoms(e.target.value)} /></div>
 <div><Label>Diagnosis</Label><Input aria-label="Template diagnosis" value={diagnosis} onChange={e=>setDiagnosis(e.target.value)} /></div>
 <div><Label>Clinical / consultation notes (private)</Label><Textarea aria-label="Template clinical notes" value={notes} onChange={e=>setNotes(e.target.value)} /></div>
 <div><Label>Patient-visible consultation summary</Label><Textarea aria-label="Template summary" value={summary} onChange={e=>setSummary(e.target.value)} /></div>
 <div className="flex justify-between"><Label>Prescription</Label><Button type="button" size="sm" variant="outline" onClick={()=>setRx(xs=>[...xs,empty()])}><Plus/>Add medicine</Button></div>
 {rx.map((r,i)=><div key={i} className="grid gap-2 border-b pb-3 sm:grid-cols-2"><MedicineInput value={r.medicine} onChange={v=>change(i,{medicine:v})}/>{(['dosage','frequency','duration','instructions'] as const).map(k=><Input key={k} aria-label={`Template ${k} ${i+1}`} placeholder={k} value={r[k]} onChange={e=>change(i,{[k]:e.target.value})}/>)}<div><Label>Dose alert times</Label><Input aria-label={`Template alert times ${i+1}`} placeholder="08:00, 20:00" value={(r.times??[]).join(', ')} onChange={e=>change(i,{times:e.target.value.split(',').map(x=>x.trim()).filter(x=>/^([01]\d|2[0-3]):[0-5]\d$/.test(x))})}/></div><Button type="button" variant="ghost" size="icon" aria-label={`Remove medicine ${i+1}`} onClick={()=>setRx(xs=>xs.filter((_,j)=>i!==j))}><Trash2/></Button></div>)}
 <div><Label>Lab tests</Label><Input aria-label="Template lab tests" value={labTests} onChange={e=>setLabTests(e.target.value)}/></div><Button disabled={busy}>{existing?<Pencil/>:<Plus/>}{busy?'Saving…':existing?'Update template':'Save template'}</Button></form>;
}
