import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Single-user personal tool — uses publishable key with permissive RLS
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

function getClient() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

// GET — fetch all vocab corrections (used by recorder to merge into additional_vocab)
export async function GET() {
  const supabase = getClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("vocab_corrections")
    .select("correct_text, sounds_like, wrong_text")
    .order("last_confirmed_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ corrections: data || [] });
}

// POST — upsert a vocab correction
// If correct_text already exists, append new sounds_like variant,
// increment times_confirmed, bump last_confirmed_at.
export async function POST(req: NextRequest) {
  const supabase = getClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const body = await req.json();
  const { wrong_text, correct_text, source_date, source_slot } = body;

  if (!wrong_text || !correct_text) {
    return NextResponse.json(
      { error: "wrong_text and correct_text are required" },
      { status: 400 }
    );
  }

  // Derive sounds_like from wrong_text — the ASR's own output IS the phonetic hint
  const newSoundsLike = [wrong_text.toLowerCase()];

  // Check if correct_text already exists
  const { data: existing, error: fetchError } = await supabase
    .from("vocab_corrections")
    .select("*")
    .eq("correct_text", correct_text)
    .single();

  if (fetchError && fetchError.code !== "PGRST116") {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (existing) {
    // Upsert: merge sounds_like arrays, increment confirmation count
    const existingSounds = existing.sounds_like || [];
    const mergedSounds = [...new Set([...existingSounds, ...newSoundsLike])];

    const { data: updated, error: updateError } = await supabase
      .from("vocab_corrections")
      .update({
        sounds_like: mergedSounds,
        times_confirmed: existing.times_confirmed + 1,
        last_confirmed_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ correction: updated });
  }

  // Insert new correction
  const { data: inserted, error: insertError } = await supabase
    .from("vocab_corrections")
    .insert({
      wrong_text,
      correct_text,
      sounds_like: newSoundsLike,
      source_date: source_date || null,
      source_slot: source_slot || null,
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ correction: inserted });
}
