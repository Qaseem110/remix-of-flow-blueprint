import { createFileRoute, Link } from '@tanstack/react-router';
import { useStore } from '@/lib/store';
import { meta } from '@/lib/meta';
import { fmtPrice } from '@/lib/utils';
import { labTestCatalogue } from '@/lib/lab-tests';
import { PageHeader } from '@/components/app/common';
import { LabServices } from '@/components/app/LabServices';
import { ProviderActions } from '@/components/app/ProviderActions';
import { Button } from '@/components/ui/button';
export const Route = createFileRoute('/patient/laboratories/$id')({ head:()=>meta('Laboratory profile','Laboratory contact, available tests, prices and home sample collection.'), component: LabProfile });
function LabProfile() {
 const {id}=Route.useParams(); const lab=useStore(s=>s.labs.find(l=>l.userId===id));
 if(!lab)return <p>Laboratory not found.</p>;
 return <div className="mx-auto max-w-4xl space-y-5"><PageHeader title={lab.labName}/><p>{lab.address}, {lab.city}</p><a className="text-primary underline" href={`tel:${lab.phone}`}>{lab.phone}</a><p>{lab.hours}</p><ProviderActions providerId={id} name={lab.labName}/><section className="space-y-3 border-y py-5"><h2 className="text-lg font-semibold">Tests & packages</h2>{labTestCatalogue(lab).map(t=><article key={t.name} className="border-b py-3"><h3 className="font-semibold">{t.name} · {fmtPrice(t.price)}</h3><p>{t.details}</p><p>Report ready in: {t.turnaround}</p>{t.sample&&<p>Sample: {t.sample}</p>}{t.preparation&&<p>Preparation: {t.preparation}</p>}</article>)}</section><LabServices labId={id}/><Button asChild><Link to="/patient/labs" search={{lab:id,book:true}}>Book test</Link></Button></div>;
}
