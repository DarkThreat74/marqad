// Supabase Edge Function: gemini-transcribe
// Proxies audio transcription requests to the Gemini API.
// Holds the GEMINI_API_KEY server-side (never exposed to the browser).
// Supports two modes:
//   1. "transcribe" — send audio + get a transcript back (AI reasoning pass)
//   2. "reconcile"  — send audio + two transcripts + vocab list → merged transcript
//
// The audio is sent as base64 inline data. For very large files (>20MB),
// the Gemini Files API should be used instead, but most class recordings
// compressed as webm/opus fit within the inline limit.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
// Confirmed against live docs (2026-07-16): gemini-3.1-pro-preview is the
// exact current API model string. 1M token context window, supports audio input.
const GEMINI_MODEL = "gemini-3.1-pro-preview";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  if (!GEMINI_API_KEY || GEMINI_API_KEY === "your-key-from-ai.google.dev" || GEMINI_API_KEY.startsWith("your-")) {
    return new Response(
      JSON.stringify({
        error: "Gemini API key not configured",
        detail: "The GEMINI_API_KEY secret is missing or still set to a placeholder. Get a real key from https://aistudio.google.com/apikey, then run: supabase secrets set GEMINI_API_KEY=<your-real-key>, and redeploy the gemini-transcribe function."
      }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const { mode, audioBase64, audioMimeType, transcriptA, transcriptB, vocabCorrections } = body;

    if (!audioBase64) {
      return new Response(
        JSON.stringify({ error: "audioBase64 is required" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    let promptText = "";

    if (mode === "reconcile") {
      // Reconciliation mode — audio + two transcripts + vocab corrections
      if (!transcriptA || !transcriptB) {
        return new Response(
          JSON.stringify({ error: "Both transcriptA and transcriptB are required for reconcile mode" }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      const vocabList = (vocabCorrections || [])
        .map((v: { wrongText: string; correctText: string }) => `${v.wrongText} -> ${v.correctText}`)
        .join("\n");

      promptText = `You are given an audio recording and two independent transcriptions of it: Transcript A (from a speech recognition system) and Transcript B (your own prior listen). You are also given a list of known names and terms that recur in this speaker's recordings.

Listen to the audio directly and produce a single best transcript. Where Transcript A and Transcript B disagree, use the audio itself to judge which is correct -- do not simply prefer one source by default. Where a word matches or closely resembles an entry in the known-terms list, prefer that term if the audio is consistent with it.

If, after listening, you remain genuinely uncertain about a word or phrase, transcribe it phonetically as heard rather than silently choosing one of the two candidates or inventing a third option. Do not introduce any change neither transcript nor the audio supports.

Known terms:
${vocabList}

Transcript A:
${transcriptA}

Transcript B:
${transcriptB}

Output only the reconciled transcript.`;
    } else {
      // Transcribe mode — AI reasoning pass (independent transcription from audio)
      promptText = `Listen to this audio recording and produce a complete, accurate transcript. This is an Islamic sciences class in Arabic and English (code-switched). Transcribe everything you hear, preserving the original language of each word (Arabic or English). Include speaker labels if you can distinguish speakers. Output only the transcript.`;
    }

    // Build the Gemini generateContent request with inline audio data
    const geminiBody = {
      contents: [{
        parts: [
          { text: promptText },
          {
            inline_data: {
              mime_type: audioMimeType || "audio/webm",
              data: audioBase64,
            },
          },
        ],
      }],
      generationConfig: {
        // High output limit for full class transcripts
        maxOutputTokens: 65536,
        temperature: 0.1, // low temperature for faithful transcription
      },
    };

    const geminiResp = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
    });

    if (!geminiResp.ok) {
      const errText = await geminiResp.text();
      console.error("[gemini-transcribe] Gemini API error:", geminiResp.status, errText);

      // Provide user-friendly messages for common auth errors
      let friendlyError = "Gemini API request failed";
      if (geminiResp.status === 401 || geminiResp.status === 403) {
        friendlyError = "Gemini API key is invalid or expired. Get a new key from https://aistudio.google.com/apikey and update it with: supabase secrets set GEMINI_API_KEY=<your-key>";
      } else if (geminiResp.status === 429) {
        friendlyError = "Gemini API rate limit reached. Wait a moment and try again.";
      }

      return new Response(
        JSON.stringify({ error: friendlyError, detail: errText, status: geminiResp.status }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const geminiData = await geminiResp.json();
    const transcript = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!transcript.trim()) {
      return new Response(
        JSON.stringify({ error: "Gemini returned an empty transcript" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Extract usage metadata for cost tracking
    const usage = geminiData?.usageMetadata || {};

    return new Response(
      JSON.stringify({ transcript, usage }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[gemini-transcribe] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Unexpected error", detail: String(err) }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
