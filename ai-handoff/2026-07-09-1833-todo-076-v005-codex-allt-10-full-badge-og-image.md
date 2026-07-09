# TODO 076 - OG image corrected to new Allt/10 full badge logo

Created: 2026-07-09 18:33  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Status: Implementation done locally, not committed/pushed/deployed by Codex

## Context

After the static PNG fix in v004, Stebbi clarified that the image was still using the old horizontal Teskeið logo. The requested logo is the newer vertical spoon mascot logo:

- full circular badge
- vertical spoon
- sunglasses
- cap
- cap text exactly:

```text
Allt
10
```

Not `A&10`, not only the cap, and not the old horizontal spoon lockup.

## What Codex changed now

Only the static OG image asset was regenerated:

- `public/opengraph-image.png`

The existing metadata/routing from the static-PNG fix remains the right structure:

- `app/layout.tsx` points social metadata at `/opengraph-image.png`
- `/opengraph-image` serves the PNG fallback route

Current git status for the relevant files showed only:

```text
 M public/opengraph-image.png
```

So this v005 change is just the visual logo replacement.

## Resulting image

`public/opengraph-image.png` is now:

- 1200 x 630
- warm cream background
- full badge logo centered
- circular border visible
- vertical spoon mascot visible
- sunglasses visible
- cap visible
- cap text says `Allt` over `10`
- `Teskeið.is` visible in the lower part of the badge

Codex visually inspected the PNG and confirmed it is the full badge, not just the cap.

## Commands Codex ran

Generated/updated image:
- Used local `sharp` to rasterize a full-badge SVG composition into `public/opengraph-image.png`.
- Temporary preview/generator files were removed after use.

Visual inspection:
- Codex viewed `public/opengraph-image.png` directly.

Verification:
- `npm run type-check`
  - Exit code: 0
- `npm run build`
  - Exit code: 0
  - Same unrelated existing warnings:
    - `app/s/[sessionId]/page.tsx` hook deps
    - `components/landing/Avatar.tsx` raw `<img>`
    - `components/weather/TravelAuditMap.tsx` hook deps
    - stale Browserslist warning

No SQL, migration, Supabase, auth, RLS, secrets, env vars, billing, or user-data changes.

## Claude Code release checklist

Before commit/push/deploy:

1. Confirm the only relevant code/asset diff is `public/opengraph-image.png`.
2. Open locally:
   - `/opengraph-image.png`
   - `/opengraph-image`
3. Confirm both show the full circular Allt/10 badge logo.
4. Confirm it is not the old horizontal spoon logo.
5. Confirm it is not only the cap.
6. Confirm it is not `A&10`.
7. Run or verify:
   - `npm run type-check`
   - `npm run build`

## Release recommendation

Codex recommendation: OK to commit/push/deploy this asset-only correction once Claude Code visually confirms the local routes.

After deploy, verify directly:

- `https://www.teskeid.is/opengraph-image.png`
- `https://www.teskeid.is/opengraph-image`

Both must show the new full Allt/10 badge before Facebook/Messenger scrape refresh is treated as meaningful.

## Localhost checks for Stebbi

With Stebbi's dev server already running:

1. Open:
   - `http://localhost:3004/opengraph-image.png`
   - `http://localhost:3004/opengraph-image`
   - If using another port, use that port.

2. Expected:
   - Full circular badge logo.
   - Vertical spoon with sunglasses.
   - Cap says:

```text
Allt
10
```

   - `Teskeið.is` appears in the badge.
   - The image is not blank.
   - The image is not the old horizontal spoon.
   - The image is not just the cap.
   - The image is not `A&10`.

3. After deploy:
   - Open both production image URLs directly.
   - Only then refresh Facebook/Messenger scrape cache.

Safety notes:
- No migration should be run.
- No Supabase/auth/RLS testing is needed.
- No Vercel env vars should be changed.
- Do not deploy unless Stebbi explicitly tells Claude Code to deploy.
