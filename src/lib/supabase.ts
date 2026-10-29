// Temporarily backed by Lovable Cloud while testing. To switch back to the self-hosted
// server, replace this with a createClient(URL, ANON_KEY) call.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as cloud } from "@/integrations/supabase/client";

export const supabase = cloud as unknown as SupabaseClient;
