# TODO 076 - Social thumbnail logo release handoff

Created: 2026-07-09 18:04  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Related handoffs:
- `ai-handoff/2026-07-09-1743-todo-076-v001-codex-social-thumbnail-logo-handoff.md`
- `ai-handoff/2026-07-09-1748-todo-076-v001-claude-social-thumbnail-logo-done.md`
- `ai-handoff/2026-07-09-1755-todo-076-v002-claude-prerelease-clarification.md`

## Purpose

Stebbi saw a Facebook/Messenger large preview thumbnail that was effectively empty/grey and only showed page text below it. Claude Code's first pass made the Open Graph image explicit, but Stebbi clarified that the preview should use the actual Teskeið logo, not just a simplified text/outline composition.

Stebbi explicitly asked Codex to take over this implementation. Codex has now made the scoped code changes and run local verification commands. This handoff is for Claude Code to review the final diff, perform release checks, and deploy only if Stebbi gives explicit deploy permission in Claude Code's session.

## Approval scope Codex used

Stebbi approved Codex taking over the social thumbnail/logo implementation.

This included:
- Editing the Open Graph image route and root metadata.
- Running local type/build checks.
- Creating this handoff.

This did not include:
- Commit.
- Push.
- Deploy/Vercel changes.
- SQL/migrations.
- Supabase, auth, RLS, secrets, billing, or production data changes.

## What Codex changed

### `app/layout.tsx`

Added explicit social image metadata:
- `openGraph.images` now points to `/opengraph-image`.
- Width/height set to `1200 x 630`.
- Alt text set to `Allt í Teskeið`.
- `twitter.images` now also points to `/opengraph-image`.

Important context:
- `metadataBase` is already hardcoded as `https://teskeid.is`, so the relative image URL should resolve to `https://teskeid.is/opengraph-image` in generated production metadata.
- In Vercel preview deployments, page metadata may still point to the production URL because of that hardcoded `metadataBase`. For preview validation, open the preview `/opengraph-image` route directly.

### `app/opengraph-image.tsx`

Replaced the prior text-only/simple composition with an inline SVG version of the actual no-frame Teskeið logo:
- Warm Teskeið background: `#fbf9f4`.
- Deep green spoon path from `public/teskeid-logo-no-frame.svg`.
- `Allt í` inside the handle.
- `Teskeið.is` inside the spoon bowl.
- Image route remains `1200 x 630`, `image/png`, edge runtime.

## Commands Codex ran

Read-only/context commands:
- `Get-Content -Encoding UTF8 WORKFLOW.md`
- `Get-Content -Encoding UTF8 ai-handoff/README.md`
- `Get-Date -Format yyyy-MM-dd-HHmm`
- `git diff -- app/opengraph-image.tsx app/layout.tsx`
- `git status --short`
- line-numbered reads of `app/layout.tsx` and `app/opengraph-image.tsx`

Verification commands:
- `npm run type-check`
  - Exit code: 0
- `npm run build`
  - Exit code: 0
  - Build succeeded.
  - Existing warnings appeared in unrelated files:
    - `app/s/[sessionId]/page.tsx`: missing React hook deps.
    - `components/landing/Avatar.tsx`: raw `<img>` warning.
    - `components/weather/TravelAuditMap.tsx`: missing React hook deps.
  - Browserslist stale-data warning also appeared.

No tests were run beyond type-check/build because this is a metadata/OG image route change with the main risk being visual/social-preview output.

## What Claude Code should review

1. Inspect the diff for only these files:
   - `app/layout.tsx`
   - `app/opengraph-image.tsx`

2. Confirm no unrelated code changes are being included in the release.

3. Confirm the generated image visually renders as the intended full Teskeið logo:
   - Not a grey placeholder.
   - Not only a spoon outline.
   - Text is not clipped.
   - Text is readable at social thumbnail sizes.
   - The logo is centered and large enough for a large Facebook/Messenger preview.

4. Confirm social metadata is acceptable:
   - `og:image` should resolve to `https://teskeid.is/opengraph-image` after production deploy.
   - `twitter:image` should also resolve via metadataBase.
   - `og:image:width` and `og:image:height` should be present or inferred from the metadata object.

5. If Facebook/Messenger keeps showing the old preview after release, treat it as cache first, not necessarily code failure.
   - Use Facebook Sharing Debugger / scrape refresh if available.
   - If cache still refuses to update, consider a follow-up change to version the image URL, for example `/opengraph-image?v=20260709`, but do not add that unless it is actually needed.

## Risks / edge cases

- Build passing does not prove the OG image looks good. The route must be opened visually.
- Some social platforms cache both page metadata and image URLs. The deployed fix may not appear immediately in Messenger/Facebook without a scrape refresh.
- This only changes the root/global metadata. There is also a route shown in build output for `/hugmyndir/[slug]/opengraph-image`; Codex did not touch per-idea Open Graph images.
- The image uses inline SVG text in `next/og`. Build accepts it, but visual inspection is still required to catch font/layout clipping.
- Hardcoded `metadataBase: https://teskeid.is` is appropriate for production, but it means preview/staging page metadata may reference production image URLs. Direct image-route testing is therefore more reliable before deploy.

## Release recommendation

Codex recommendation: OK to release after Claude Code performs the visual localhost/preview checks below and Stebbi explicitly tells Claude Code to deploy.

Claude Code should not treat this handoff file alone as deploy permission. Per workflow, Stebbi still needs to give a clear deploy instruction to Claude Code.

## Localhost checks for Stebbi

Before release, with Stebbi's dev server already running:

1. Open the local OG route directly:
   - `http://localhost:3004/opengraph-image`
   - If Stebbi uses a different dev port, use that port instead.

2. Expected result:
   - A 1200x630 PNG-like browser image.
   - Warm cream background.
   - Large centered Teskeið logo.
   - `Allt í` appears inside the spoon handle.
   - `Teskeið.is` appears inside the spoon bowl.
   - No grey placeholder, clipping, broken text, or tiny logo.

3. Open the home page locally:
   - `http://localhost:3004/`
   - Confirm the page still loads normally.
   - Optional: inspect page metadata and confirm social image tags point to `/opengraph-image` / `https://teskeid.is/opengraph-image`.

4. After deploy:
   - Open `https://teskeid.is/opengraph-image` directly and confirm the production image matches localhost.
   - Share or re-scrape `https://teskeid.is` in Facebook/Messenger.
   - If the old grey thumbnail persists, use Facebook's scrape/debug refresh before assuming code is wrong.

Safety notes:
- This change does not touch Supabase, SQL, auth, RLS, billing, secrets, or user data.
- Do not run migrations for this.
- Do not change Vercel env vars for this.
- Do not deploy until Stebbi explicitly approves deployment in Claude Code's session.
