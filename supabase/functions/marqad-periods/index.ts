// Supabase Edge Function: marqad-periods
// CRUD for class periods — used for automatic session naming.
// GET    /          → list all periods (ordered by period_number)
// POST   /          → upsert a period (insert or update by period_number)
// DELETE /{id}      → delete a period by id

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const USER_ID = "marqad-user";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!supabaseUrl || !supabaseKey) {
    return new Response(
      JSON.stringify({ error: "Supabase not configured" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const supabase = createClient(supabaseUrl, supabaseKey);

  const url = new URL(req.url);
  const path = url.pathname.split("/").filter(Boolean);

  try {
    // GET — list all periods
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("marqad_class_periods")
        .select("*")
        .eq("user_id", USER_ID)
        .order("period_number", { ascending: true });

      if (error) throw error;

      return new Response(
        JSON.stringify({ periods: data || [] }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // POST — upsert a period
    if (req.method === "POST") {
      const body = await req.json();
      const { period_number, class_name, start_time, end_time } = body;

      if (!period_number || !class_name || !start_time || !end_time) {
        return new Response(
          JSON.stringify({ error: "period_number, class_name, start_time, end_time are required" }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      // Validate period_number is a positive integer
      if (typeof period_number !== "number" || period_number < 1 || !Number.isInteger(period_number)) {
        return new Response(
          JSON.stringify({ error: "period_number must be a positive integer" }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      // Validate time format (HH:MM or HH:MM:SS)
      const timeRegex = /^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
      if (!timeRegex.test(start_time) || !timeRegex.test(end_time)) {
        return new Response(
          JSON.stringify({ error: "start_time and end_time must be in HH:MM format" }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      // Validate end_time is after start_time
      const toMin = (t: string) => {
        const [h, m] = t.split(":").map(Number);
        return h * 60 + m;
      };
      if (toMin(end_time) <= toMin(start_time)) {
        return new Response(
          JSON.stringify({ error: "end_time must be after start_time" }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      const { data, error } = await supabase
        .from("marqad_class_periods")
        .upsert({
          user_id: USER_ID,
          period_number,
          class_name,
          start_time,
          end_time,
        }, { onConflict: "user_id,period_number" })
        .select()
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify({ period: data }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // DELETE — delete a period by id
    if (req.method === "DELETE") {
      const id = path[path.length - 1];
      if (!id) {
        return new Response(
          JSON.stringify({ error: "Period id is required" }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      const { error } = await supabase
        .from("marqad_class_periods")
        .delete()
        .eq("id", parseInt(id, 10));

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Request failed", detail: String(err) }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
