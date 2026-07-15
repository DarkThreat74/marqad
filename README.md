# Marqad

Live classroom transcription for Arabic/English code-switched speech (Islamic
sciences classes), using Speechmatics' Arabic-English bilingual real-time model
with speaker diarization. Single-user personal tool.

## Architecture

```
Browser → Supabase Edge Function (mints short-lived JWT) → Speechmatics WebSocket
                                                              (ar_en bilingual model)
```

The browser cannot attach custom `Authorization` headers to a WebSocket
connection — this is a platform limitation, not a Speechmatics quirk. The Edge
Function holds the real API key server-side and mints a 1-hour JWT that the
browser passes as a `?jwt=` query parameter. The real API key is never in
frontend code.

## Prerequisites

- **Supabase CLI** installed: `npm install -g supabase`
- **Supabase project** created (project ref: `vnrgimvfsdgcpgfwcnlw`)
- **Speechmatics account** with a real-time API key (US region)
- **Node.js 18+** and npm

---

## Deploy steps (follow in order)

### Step 1: Deploy the Edge Function

The function is at `supabase/functions/get-speechmatics-token/index.ts`.
It mints a short-lived JWT using your Speechmatics API key.

**1a. Set the Speechmatics API key as a Supabase secret**

Create your API key in the [Speechmatics portal](https://portal.speechmatics.com/settings/api-keys),
then set it as a secret (replace `<YOUR_SPEECHMATICS_KEY>` with the real key):

```powershell
supabase secrets set SPEECHMATICS_API_KEY=<YOUR_SPEECHMATICS_KEY>
```

**1b. Deploy the function**

```powershell
supabase functions deploy get-speechmatics-token --no-verify-jwt
```

`--no-verify-jwt` is required — this endpoint has no caller auth (single-user
personal tool per spec Section 2.2).

**1c. Smoke-test the deployed function**

```powershell
curl "https://vnrgimvfsdgcpgfwcnlw.supabase.co/functions/v1/get-speechmatics-token"
```

Expected response:
```json
{"jwt":"eyJ...","expires_in":3600}
```

If you see `"Server missing SPEECHMATICS_API_KEY secret"`, re-run step 1a.
If you see a Speechmatics 401 error, your key may be EU-region — the function
is configured for US (`region: "usa"`). Edit `supabase/functions/get-speechmatics-token/index.ts`
line 17 and change `const REGION = "usa"` to `"eu"`, then redeploy.

### Step 2: Configure the frontend

The token endpoint is already set in `.env.local`:
```
NEXT_PUBLIC_SPEECHMATICS_TOKEN_ENDPOINT=https://vnrgimvfsdgcpgfwcnlw.supabase.co/functions/v1/get-speechmatics-token
```

If your Supabase project ref is different, update this value.

### Step 3: Run the app

**Development:**
```powershell
npm install
npm run dev
```
Open http://localhost:3000

**Production (deploy to Vercel):**
```powershell
npm run build
```
Then either:
- Push to GitHub and import into [Vercel](https://vercel.com) (recommended —
  automatic HTTPS, which is required for microphone access and PWA install)
- Or deploy via Vercel CLI: `npx vercel`

**Environment variables on Vercel:** Add the three variables from `.env.local`
in your Vercel project settings → Environment Variables:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SPEECHMATICS_TOKEN_ENDPOINT`

### Step 4: Install as a PWA

Once deployed to HTTPS (Vercel or similar):
- **Desktop Chrome**: click the install icon in the address bar
- **Mobile Chrome**: menu → "Add to Home screen" / "Install app"

The service worker caches the app shell for fast launch. Transcription itself
always requires network (live API call).

---

## If the Speechmatics key rotates

1. Create a new API key in the Speechmatics portal
2. Update the Supabase secret:
   ```powershell
   supabase secrets set SPEECHMATICS_API_KEY=<NEW_KEY>
   ```
3. Redeploy the function (secrets are read at deploy time):
   ```powershell
   supabase functions deploy get-speechmatics-token --no-verify-jwt
   ```
4. Smoke-test:
   ```powershell
   curl "https://vnrgimvfsdgcpgfwcnlw.supabase.co/functions/v1/get-speechmatics-token"
   ```

No frontend changes needed — the frontend fetches a fresh JWT each session.

---

## Key configuration values (verified against current Speechmatics docs)

| Setting | Value | Source |
|---|---|---|
| Bilingual model | `ar_en` | [Speechmatics languages](https://docs.speechmatics.com/speech-to-text/languages) — "Arabic & English bilingual" |
| WebSocket host (US) | `wss://us.rt.speechmatics.com/v2` | [Authentication docs](https://docs.speechmatics.com/get-started/authentication) — Realtime SaaS US1 endpoint |
| WebSocket URL format | `wss://us.rt.speechmatics.com/v2/ar_en?jwt=<jwt>` | Language is a path segment (verified via Python SDK + current docs) |
| Model field | `model: "enhanced"` | `operating_point` is deprecated; `model` is the current field |
| Diarization | `diarization: "speaker"`, no `max_speakers` | Auto-detect speaker count (spec Section 3.6) |
| JWT region | `region: "usa"` | Must match API key region; EU token won't auth against US endpoint |
| Free tier | 3,000 min/month (50 hrs), 2 concurrent sessions | Speechmatics pricing — displayed in UI as cumulative monthly usage |

---

## Project structure

```
Marqad/
├── supabase/functions/get-speechmatics-token/index.ts  # JWT-minting Edge Function
├── app/
│   ├── layout.tsx          # Root layout (Fraunces + Amiri + JetBrains Mono fonts)
│   ├── page.tsx            # Main page
│   └── globals.css         # Design system (Section 3.1 — do not restyle)
├── components/
│   └── Marqad.tsx          # Transcription component (Sections 3.3–3.8)
├── lib/
│   └── marqad.ts           # Config, types, helpers (entity detection, spacing, export)
├── utils/supabase/
│   ├── server.ts           # Supabase SSR server client
│   ├── client.ts           # Supabase SSR browser client
│   └── middleware.ts       # Session refresh middleware
├── middleware.ts           # Next.js middleware (Supabase session refresh)
├── public/
│   ├── manifest.json       # PWA manifest
│   ├── sw.js               # Service worker (app shell cache)
│   ├── icon.svg            # App icon
│   └── audio-worklet-processor.js  # AudioWorklet PCM processor
├── .env.local              # Environment variables (gitignored)
├── next.config.mjs         # Next.js config (SW headers)
├── package.json
└── tsconfig.json
```

---

## Design language (per spec Section 3.1 — do not restyle)

- **Palette**: ink `#111310`, paper `#F7F5EF`, teal `#5EEAD4`, amber `#F5A623`,
  purple `#A78BFA`, graphite `#6B7280`
- **Type**: Fraunces (transcript body), Amiri (Arabic script, RTL), JetBrains
  Mono (UI chrome)
- **Layout**: dark control rail (mic, waveform, status, format, cost, copy) +
  warm paper transcript page below
- **Entity highlighting**: teal underline (proper nouns), purple underline
  (dates), dotted amber (uncertain/phonetically-unusual terms)
- **Speaker colors**: 7-color palette mapped to `S1`–`S7+` labels

---

## Notes

- The Supabase SSR scaffolding (`utils/supabase/*`, `middleware.ts`) is set up
  for future use (e.g., a notes-archive database). The transcription tool itself
  has no auth wall — it's a single-user personal app per spec Section 2.2.
- The "Copy" button exports plain text in `[mm:ss] Speaker SN: text` format for
  pasting into a separate Claude conversation for note reorganization.
- Cost tracking shows session minutes and cumulative monthly minutes against
  the 3,000-minute free tier. Monthly usage resets automatically (stored in
  localStorage keyed by month).
