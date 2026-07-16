// Supabase Edge Function: mints a short-lived Speechmatics JWT for
// browser-based real-time transcription. This is the ONLY server-side
// logic this project needs. CORS is open since this is a single-user
// personal tool with no sensitive data behind this endpoint beyond the
// Speechmatics account itself, gated by TTL.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const SPEECHMATICS_KEY = Deno.env.get("SPEECHMATICS_API_KEY");
const TOKEN_ENDPOINT = "https://mp.speechmatics.com/v1/api_keys?type=rt";
const TTL_SECONDS = 60 * 60 * 2; // 2 hours — allows for a full 1-hour class + overhead
// Region must match the region the Speechmatics API key was created in.
// The minted JWT is region-scoped, so an EU token will NOT authenticate
// against the US realtime endpoint (and vice versa). Valid rt values:
// "eu" (default) or "usa".
const REGION = "usa";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (!SPEECHMATICS_KEY) {
    return new Response(
      JSON.stringify({ error: "Server missing SPEECHMATICS_API_KEY secret" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  try {
    const resp = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SPEECHMATICS_KEY}`,
      },
      body: JSON.stringify({ ttl: TTL_SECONDS, region: REGION }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return new Response(
        JSON.stringify({ error: "Speechmatics token request failed", detail: errText }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const data = await resp.json();
    return new Response(
      JSON.stringify({ jwt: data.key_value, expires_in: TTL_SECONDS }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Unexpected error", detail: String(err) }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
