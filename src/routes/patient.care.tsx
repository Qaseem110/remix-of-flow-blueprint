import { createFileRoute } from '@tanstack/react-router';
import { CareWorkspace } from '@/components/app/CareWorkspace';
import { meta } from '@/lib/meta';
export const Route = createFileRoute('/patient/care')({head:()=>meta('Patient care services','Manage patient care services, requests and account activity.'),component:CareWorkspace});
