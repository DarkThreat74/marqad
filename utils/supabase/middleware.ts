import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export async function updateSession(request: NextRequest) {
  // If Supabase env vars aren't configured (e.g. not yet set on Vercel),
  // skip the middleware entirely rather than crashing the whole site.
  // The transcription tool doesn't require auth — this middleware only
  // exists for future session-refresh use.
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next({
      request: {
        headers: request.headers,
      },
    });
  }

  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  try {
    const supabase = createServerClient(
      supabaseUrl,
      supabaseKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet: Array<{ name: string; value: string; options: Record<string, unknown> }>) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            supabaseResponse = NextResponse.next({
              request,
            })
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options as any)
            )
          },
        },
      },
    );

    // IMPORTANT: Do not run any code between createServerClient and
    // supabase.auth.getUser(). This will enforce session refresh.
    await supabase.auth.getUser();

    // No auth-gating on any route for now — the transcription tool is a
    // single-user personal app with no login wall (per BUILD_SPEC Section 2.2).
    // If auth-gating is added later, protect routes here by redirecting
    // unauthenticated users to a login page.
    // if (!user && !request.nextUrl.pathname.startsWith("/login")) {
    //   return NextResponse.redirect(new URL("/login", request.url));
    // }
  } catch {
    // If Supabase is unreachable or errors, don't block the request —
    // the transcription tool works without auth.
  }

  return supabaseResponse;
}
