import { useEffect, useState } from 'react';
import { loadCareItems, useStore } from '@/lib/store';
import type { CareItem } from '@/lib/care';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
export function ClinicSelect({ doctorId, value, onChange }: { doctorId: string; value: string; onChange: (id: string, branch?: CareItem) => void }) {
 const [branches, setBranches] = useState<CareItem[]>([]);
 const doctor = useStore(s => s.doctors.find(d => d.userId === doctorId));
 useEffect(() => { void loadCareItems().then(xs => setBranches(xs.filter(x => x.ownerId === doctorId && x.kind === 'branch' && x.data.status !== 'Archived'))); }, [doctorId]);
 return <div className="my-4 space-y-2"><Label>Clinic</Label><Select value={value || 'main'} onValueChange={v => onChange(v === 'main' ? '' : v, branches.find(b => b.id === v))}><SelectTrigger aria-label="Clinic"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="main">{doctor?.clinicName || 'Main clinic'} / Online</SelectItem>{branches.map(b => <SelectItem key={b.id} value={b.id}>{String(b.data.title)}</SelectItem>)}</SelectContent></Select></div>;
}
