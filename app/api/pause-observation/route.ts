import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

function getClient() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

// POST — log a pause observation (passive data collection, not self-tuning)
export async function POST(req: NextRequest) {
  const supabase = getClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const body = await req.json();
  const { class_date, slot_number, pause_ms, pause_tier } = body;

  if (pause_ms == null || !pause_tier) {
    return NextResponse.json(
      { error: "pause_ms and pause_tier are required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("pause_observations")
    .insert({
      class_date: class_date || new Date().toISOString().slice(0, 10),
      slot_number: slot_number || 0,
      pause_ms,
      pause_tier,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ observation: data });
}
