import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

export const createClient = () => {
  if (!supabaseUrl || !supabaseKey) {
    // Return a no-op client if env vars are missing (e.g. during build)
    return null as any;
  }
  return createBrowserClient(supabaseUrl, supabaseKey);
};
