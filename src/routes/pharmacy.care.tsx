import { createFileRoute } from '@tanstack/react-router';
import { CareWorkspace } from '@/components/app/CareWorkspace';
import { meta } from '@/lib/meta';
export const Route = createFileRoute('/pharmacy/care')({head:()=>meta('Pharmacy care services','Manage pharmacy care services, requests and account activity.'),component:CareWorkspace});
