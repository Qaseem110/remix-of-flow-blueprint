import { createFileRoute } from '@tanstack/react-router';
import { CareWorkspace } from '@/components/app/CareWorkspace';
import { meta } from '@/lib/meta';
export const Route = createFileRoute('/admin/care')({head:()=>meta('Admin care services','Manage admin care services, requests and account activity.'),component:CareWorkspace});
