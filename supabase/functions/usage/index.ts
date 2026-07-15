// Marqad — Usage tracking edge function
// Stores monthly usage seconds in Supabase database (not localStorage)
// Single-user personal tool, no auth — uses a fixed user_id

const USER_ID = "marqad-user";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!supabaseUrl || !supabaseKey) {
    return new Response(
      JSON.stringify({ error: "Supabase not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // We need to use the service role key to bypass RLS
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const supabase = createClient(supabaseUrl, supabaseKey);

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  try {
    if (req.method === "GET") {
      // Get current month's usage
      const { data, error } = await supabase
        .from("marqad_usage")
        .select("seconds")
        .eq("user_id", USER_ID)
        .eq("month_key", monthKey)
        .single();

      if (error && error.code !== "PGRST116") {
        // PGRST116 = no rows found, which is fine
        throw error;
      }

      const seconds = data?.seconds || 0;
      return new Response(
        JSON.stringify({ seconds, monthKey }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "POST") {
      // Add seconds to current month's usage
      const body = await req.json();
      const addSeconds = body.seconds || 0;

      if (addSeconds <= 0) {
        return new Response(
          JSON.stringify({ error: "seconds must be positive" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Atomic increment via SQL function — avoids race conditions
      const { data: newSeconds, error: rpcError } = await supabase
        .rpc("add_usage_seconds", {
          p_user_id: USER_ID,
          p_month_key: monthKey,
          p_seconds: addSeconds,
        });

      if (rpcError) throw rpcError;

      return new Response(
        JSON.stringify({ seconds: newSeconds || addSeconds, monthKey }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
