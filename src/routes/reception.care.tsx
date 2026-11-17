import { createFileRoute } from '@tanstack/react-router';
import { CareWorkspace } from '@/components/app/CareWorkspace';
import { meta } from '@/lib/meta';
export const Route = createFileRoute('/reception/care')({head:()=>meta('Reception care services','Manage reception care services, requests and account activity.'),component:CareWorkspace});
