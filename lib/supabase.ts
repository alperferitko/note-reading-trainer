import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const communityConfigured = Boolean(url && publishableKey);

export const supabase = communityConfigured
  ? createClient(url!, publishableKey!, {
      auth: {
        detectSessionInUrl: true,
        flowType: "implicit",
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;
