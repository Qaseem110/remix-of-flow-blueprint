import { createFileRoute } from '@tanstack/react-router';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';
import { z } from 'zod';

export const Route = createFileRoute('/api/public/jobs/recording-cleanup')({
  server: { handlers: { POST: async ({ request }) => {
    const failure = await authenticateCronRequest(request);
    if (failure) return failure;
    const body = z.object({ kind: z.literal('expired-recordings') }).safeParse(await request.json().catch(() => null));
    if (!body.success) return Response.json({ error: 'Invalid request' }, { status: 400 });
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin.from('call_recordings').select('id,path').lte('expires_at', now).order('expires_at').limit(100);
    if (error) throw error;
    if (!data?.length) return Response.json({ removed: 0 });
    const { error: fileError } = await supabaseAdmin.storage.from('recordings').remove(data.map(r => r.path));
    if (fileError) throw fileError;
    const { error: rowError } = await supabaseAdmin.from('call_recordings').delete().in('id', data.map(r => r.id)).lte('expires_at', now);
    if (rowError) throw rowError;
    return Response.json({ removed: data.length });
  } } },
});