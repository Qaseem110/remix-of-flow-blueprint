import { createClient } from "@supabase/supabase-js";

// Self-hosted Supabase. The anon key is a public (publishable) key; security is enforced by RLS.
export const SUPABASE_URL = "https://supabase.healthsahoolat.com";
export const SUPABASE_ANON_KEY =
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc5MDg4MzMwMCwiZXhwIjo0OTQ2NTU2OTAwLCJyb2xlIjoiYW5vbiJ9.zB-cioGqiQzdN_7BQUzUpbi4ca_XNBss3nngQ27IKoo";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: typeof window !== "undefined", autoRefreshToken: typeof window !== "undefined" },
});
