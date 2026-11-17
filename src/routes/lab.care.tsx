import { createFileRoute } from '@tanstack/react-router';
import { CareWorkspace } from '@/components/app/CareWorkspace';
import { meta } from '@/lib/meta';
export const Route = createFileRoute('/lab/care')({head:()=>meta('Lab care services','Manage lab care services, requests and account activity.'),component:CareWorkspace});
