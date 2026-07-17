// Supabase Edge Function: marqad-sessions
// Handles saving, loading, and deleting transcription sessions.
// Audio files are uploaded directly to Supabase Storage from the browser
// (using the publishable key with permissive RLS), not through this function.
// This function only manages the database records.

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
  // Expected paths:
  //   GET  /sessions          → list all sessions
  //   POST /sessions          → upsert a session
  //   DELETE /sessions/{id}   → delete a session (and its audio from storage)

  try {
    // GET — list all sessions (newest first)
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("marqad_sessions")
        .select("*")
        .eq("user_id", USER_ID)
        .order("date", { ascending: false })
        .limit(200);

      if (error) throw error;

      return new Response(
        JSON.stringify({ sessions: data || [] }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // POST — upsert a session
    if (req.method === "POST") {
      const body = await req.json();
      const {
        id,
        date,
        duration_sec,
        segment_count,
        preview,
        export_text,
        audio_path,
        audio_size,
        audio_format,
        batch_model,
        batch_words,
        ai_reasoning_transcript,
        ai_reasoning_at,
        reconciled_transcript,
        reconciled_at,
        title,
      } = body;

      if (!id) {
        return new Response(
          JSON.stringify({ error: "id is required" }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      const record: Record<string, any> = {
        id,
        user_id: USER_ID,
        date: date || new Date().toISOString(),
        duration_sec: duration_sec || 0,
        segment_count: segment_count || 0,
        preview: preview || "",
        export_text: export_text || "",
        audio_path: audio_path || null,
        audio_size: audio_size || null,
        audio_format: audio_format || "webm",
      };

      // Phase 1 & 2 optional fields — only set if provided (nullable columns)
      if (batch_model !== undefined) record.batch_model = batch_model;
      if (batch_words !== undefined) record.batch_words = batch_words;
      if (ai_reasoning_transcript !== undefined) record.ai_reasoning_transcript = ai_reasoning_transcript;
      if (ai_reasoning_at !== undefined) record.ai_reasoning_at = ai_reasoning_at;
      if (reconciled_transcript !== undefined) record.reconciled_transcript = reconciled_transcript;
      if (reconciled_at !== undefined) record.reconciled_at = reconciled_at;
      if (title !== undefined) record.title = title;

      const { data, error } = await supabase
        .from("marqad_sessions")
        .upsert(record, { onConflict: "id" })
        .select()
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify({ session: data }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // DELETE — delete a session and its audio file
    if (req.method === "DELETE") {
      const sessionId = path[path.length - 1];
      if (!sessionId) {
        return new Response(
          JSON.stringify({ error: "session id is required" }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      // Get the session to find audio_path
      const { data: session } = await supabase
        .from("marqad_sessions")
        .select("audio_path")
        .eq("id", sessionId)
        .eq("user_id", USER_ID)
        .single();

      // Delete audio from storage if it exists (best-effort — don't block
      // DB deletion if storage fails, as that would leave orphaned DB records)
      if (session?.audio_path) {
        const { error: storageErr } = await supabase.storage
          .from("marqad-audio")
          .remove([session.audio_path]);
        if (storageErr) {
          console.warn("[marqad-sessions] Storage deletion failed:", storageErr.message);
        }
      }

      // Delete the session record
      const { error } = await supabase
        .from("marqad_sessions")
        .delete()
        .eq("id", sessionId)
        .eq("user_id", USER_ID);

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
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
