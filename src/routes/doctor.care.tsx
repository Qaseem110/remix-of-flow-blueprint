import { createFileRoute } from '@tanstack/react-router';
import { CareWorkspace } from '@/components/app/CareWorkspace';
import { meta } from '@/lib/meta';
export const Route = createFileRoute('/doctor/care')({head:()=>meta('Doctor care services','Manage doctor care services, requests and account activity.'),component:CareWorkspace});
