import { createClient } from "@supabase/supabase-js";

// Flag to temporarily disable Supabase connection
export const isSupabaseDisabled = true; // Hardcoded to true as requested to lock connection

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "placeholder";

// Only create client if not disabled to avoid potential initialization errors with placeholders
export const supabase = isSupabaseDisabled 
  ? ({
      from: () => ({
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }), not: () => ({ select: () => Promise.resolve({ data: null, error: null }) }) }), upsert: () => Promise.resolve({ error: null }), delete: () => ({ eq: () => Promise.resolve({ error: null }) }), update: () => ({ eq: () => Promise.resolve({ error: null }), gte: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) }) }),
      }),
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      }
    } as any)
  : createClient(supabaseUrl, supabaseAnonKey);

export default supabase;
