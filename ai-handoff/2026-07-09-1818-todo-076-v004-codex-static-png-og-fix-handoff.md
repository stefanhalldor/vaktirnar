# TODO 076 - Static PNG Open Graph fix after blank production image

Created: 2026-07-09 18:18  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Status: Implementation done locally, not committed/pushed/deployed by Codex

## Context

The previous release (`2026-07-09-1810-todo-076-v003-claude-released.md`, commit `439782a`) still showed a blank/empty image at `https://www.teskeid.is/opengraph-image`.

Codex assessment: this is not merely Facebook cache. The direct production image route itself is blank. The likely cause is that the dynamic `next/og` `ImageResponse` did not render the inline nested SVG logo in production, even though local `npm run build` passed.

Stebbi then explicitly approved Codex to perform the necessary fix.

## What Codex changed

### 1. Added static PNG social image

Added:
- `public/opengraph-image.png`

Details:
- 1200 x 630 PNG.
- Warm Teskeið background `#fbf9f4`.
- Full Teskeið logo from `public/teskeid-logo-no-frame.svg`.
- Verified visually with Codex image inspection: logo is visible, centered, not blank.

This avoids relying on runtime SVG rendering inside `next/og`.

### 2. Changed root social metadata to use the PNG directly

Changed:
- `app/layout.tsx`

Metadata now points to:
- `openGraph.images[0].url = '/opengraph-image.png'`
- `twitter.images = ['/opengraph-image.png']`

The `metadataBase` remains `https://teskeid.is`, so production metadata should resolve to:
- `https://teskeid.is/opengraph-image.png`

### 3. Replaced dynamic ImageResponse route with PNG fallback route

Deleted:
- `app/opengraph-image.tsx`

Added:
- `app/opengraph-image/route.ts`

The route handler reads `public/opengraph-image.png` and returns it as `image/png`. This means the old test URL still works:
- `/opengraph-image`

So both should render the real logo after deploy:
- `https://teskeid.is/opengraph-image.png`
- `https://teskeid.is/opengraph-image`

## Commands Codex ran

Context/read-only:
- `Get-ChildItem -File public | Select-Object Name,Length`
- `Get-Content -Encoding UTF8 package.json`
- `rg -n "sharp|satori|resvg|opengraph-image|ImageResponse|next/og" package.json package-lock.json app components lib public`
- `git status --short`
- line-numbered read of `app/opengraph-image/route.ts`
- `git diff -- app/layout.tsx app/opengraph-image.tsx app/opengraph-image/route.ts public/opengraph-image.png`

Generation:
- `node scripts/generate-og-image.mjs`
  - Temporary generator script was added with `apply_patch`, used once, then deleted with `apply_patch`.
  - Output: PNG, 1200 x 630, size 45811 bytes.
  - Final repo does not keep the generator script.

Verification:
- Codex visually inspected `public/opengraph-image.png`.
- `npm run type-check`
  - Exit code: 0.
- `npm run build`
  - Exit code: 0.
  - Build route list now shows `/opengraph-image` as static.
  - Same existing unrelated warnings remain:
    - `app/s/[sessionId]/page.tsx` hook deps.
    - `components/landing/Avatar.tsx` raw `<img>`.
    - `components/weather/TravelAuditMap.tsx` hook deps.
    - stale Browserslist warning.

## Files changed

Expected final changed files:
- `app/layout.tsx`
- `app/opengraph-image.tsx` deleted
- `app/opengraph-image/route.ts` added
- `public/opengraph-image.png` added
- this handoff file

No SQL, Supabase, auth, RLS, secrets, env vars, billing, or user-data changes.

## Claude Code review checklist

Before commit/push/deploy, Claude Code should:

1. Confirm the diff is limited to the expected files above.
2. Confirm `public/opengraph-image.png` is included in git.
3. Open the local routes in Stebbi's running dev server:
   - `/opengraph-image.png`
   - `/opengraph-image`
4. Confirm both show the full Teskeið logo, not a blank cream page.
5. Confirm root page metadata points to `/opengraph-image.png`.
6. Run or verify:
   - `npm run type-check`
   - `npm run build`

## Release recommendation

Codex recommendation: OK to commit/push/deploy this fix after Claude Code confirms the local image routes render visibly.

Do not rely on build alone. The previous failure passed build but rendered blank in production.

After deploy, Claude Code or Stebbi must directly open:
- `https://www.teskeid.is/opengraph-image.png`
- `https://www.teskeid.is/opengraph-image`

Both should show the logo. Only then use Facebook Sharing Debugger / Messenger re-scrape.

## Localhost checks for Stebbi

With Stebbi's dev server already running:

1. Open:
   - `http://localhost:3004/opengraph-image.png`
   - `http://localhost:3004/opengraph-image`
   - If using a different localhost port, use that port.

2. Expected result for both:
   - Visible 1200 x 630 style image.
   - Warm cream background.
   - Large centered Teskeið logo.
   - `Allt í` inside the handle.
   - `Teskeið.is` inside the spoon bowl.
   - Not blank, not grey, not only page text.

3. Open:
   - `http://localhost:3004/`
   - Confirm the home page still loads normally.
   - Optional browser devtools check: social metadata should reference `/opengraph-image.png`.

4. After deploy:
   - Open `https://www.teskeid.is/opengraph-image.png`.
   - Open `https://www.teskeid.is/opengraph-image`.
   - If both show the logo, then refresh Facebook's scrape cache for `https://teskeid.is`.

Safety notes:
- No migration should be run.
- No Supabase/auth/RLS testing is needed.
- Do not change Vercel env vars.
- Do not deploy unless Stebbi explicitly tells Claude Code to deploy.
