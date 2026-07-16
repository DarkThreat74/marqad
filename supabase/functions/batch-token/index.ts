// Supabase Edge Function: mints a short-lived Speechmatics BATCH JWT
// for browser-based batch transcription. Same pattern as get-speechmatics-token
// but for the Batch API instead of Realtime.
//
// The batch JWT allows the browser to upload audio directly to Speechmatics
// and poll job status — without exposing the long-lived API key.
// Uses client_ref to scope the token to this user's jobs only.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const SPEECHMATICS_KEY = Deno.env.get("SPEECHMATICS_API_KEY");
const TOKEN_ENDPOINT = "https://mp.speechmatics.com/v1/api_keys?type=batch";
const TTL_SECONDS = 60 * 60 * 2; // 2 hours — enough for 1-hour recording + upload + processing + polling
const REGION = "usa";
const CLIENT_REF = "marqad-user";

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
      body: JSON.stringify({
        ttl: TTL_SECONDS,
        region: REGION,
        client_ref: CLIENT_REF,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return new Response(
        JSON.stringify({ error: "Speechmatics batch token request failed", detail: errText }),
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
