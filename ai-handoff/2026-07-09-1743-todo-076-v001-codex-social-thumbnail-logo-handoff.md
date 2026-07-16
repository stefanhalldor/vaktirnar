# Codex handoff: TODO #76 v001 - Social thumbnail should use Teskeið logo

Created: 2026-07-09 17:43  
Timezone: Atlantic/Reykjavik

## Context

Stebbi noticed that Facebook/Messenger link previews for Teskeið show a large grey/empty thumbnail area with only the page title/domain below it. Stebbi wants large social thumbnails to use the Teskeið logo instead.

This is a handoff/plan only. Codex did not change app code, SQL, migrations, commits, deployment, Supabase, secrets, or production data.

## Current observations

Codex inspected the relevant files:

- `app/layout.tsx`
- `app/opengraph-image.tsx`
- `app/hugmyndir/[slug]/opengraph-image.tsx`
- `app/hugmyndir/[slug]/page.tsx`
- `public/teskeid-logo.svg`
- `public/teskeid-logo-no-frame.svg`
- `public/manifest.json`

Important details:

- `app/opengraph-image.tsx` already exists and returns a 1200x630 generated PNG, but it is mostly text on a warm background.
- `app/layout.tsx` defines `openGraph` and `twitter`, but does not explicitly set `openGraph.images` or `twitter.images`.
- Next.js can auto-discover `app/opengraph-image.tsx`, but explicit `images` metadata is usually safer for social crawlers.
- Facebook/Messenger cache previews aggressively, so after deploy Stebbi will likely need to use Facebook Sharing Debugger and click scrape/refresh.
- There are encoding-looking artifacts in `app/hugmyndir/[slug]/opengraph-image.tsx` and `app/hugmyndir/[slug]/page.tsx` such as `TeskeiÃ°`. Do not expand this task into a full encoding cleanup unless Stebbi approves; just avoid copying that artifact into new/updated OG work.

## Goal

Large social previews, especially Facebook/Messenger thumbnails, should show a recognizable Teskeið logo/brand mark instead of a grey empty card.

Target:

- 1200x630 Open Graph image.
- Warm Teskeið background.
- Large Teskeið logo/mark, visually centered and readable in cropped social previews.
- Optional small text: `Allt í Teskeið`.
- Works as `summary_large_image` for Twitter/X metadata too.

## Recommended implementation

### 1. Update the root Open Graph image

File:

- `app/opengraph-image.tsx`

Recommended approach:

- Keep `ImageResponse`.
- Keep `size = { width: 1200, height: 630 }`.
- Replace the current text-only layout with a logo-first layout.
- Use the Teskeið logo shape directly in JSX/SVG-like elements, or load/copy the relevant SVG paths from `public/teskeid-logo.svg` / `public/teskeid-logo-no-frame.svg` if compatible with `ImageResponse`.

Preferred visual:

- Background: `#fbf9f4`.
- Large rounded light card or no card, depending on which looks cleaner.
- Large deep-green spoon/logo mark centered.
- `Allt í Teskeið` or `Teskeið.is` as a supporting line.
- Avoid making the whole image too text-heavy; the Facebook thumbnail crop should still show the mark.

### 2. Make metadata explicit

File:

- `app/layout.tsx`

Add explicit images:

```ts
openGraph: {
  ...
  images: [
    {
      url: '/opengraph-image',
      width: 1200,
      height: 630,
      alt: 'Teskeið',
    },
  ],
},
twitter: {
  card: 'summary_large_image',
  ...
  images: ['/opengraph-image'],
},
```

If Next/Vercel requires extensionless generated OG routes to be absolute or typed differently, use the Next.js-supported metadata format and keep `metadataBase`.

### 3. Consider idea-page metadata

Files:

- `app/hugmyndir/[slug]/page.tsx`
- `app/hugmyndir/[slug]/opengraph-image.tsx`

Question for Claude Code:

- Do idea pages currently use their dynamic `opengraph-image.tsx` automatically?
- If yes, leave them as-is for this small task unless Stebbi wants all idea-page previews to use the generic logo thumbnail.
- If no or unreliable, add explicit `openGraph.images` to idea metadata as well.

Codex recommendation:

- For the root site, use the generic Teskeið-logo OG image.
- For individual idea pages, keep dynamic idea-specific OG images if they work, but fix the encoding artifact later in a separate cleanup if needed.

## Scope boundaries

Do not include unless Stebbi explicitly approves:

- Reworking favicon/app icons.
- Replacing all logo assets.
- Full encoding cleanup of idea pages.
- Commit, push, deploy, production rollout.
- Facebook Sharing Debugger action after deploy.

No SQL, Supabase, RLS, auth, user data, secrets, billing, or API calls should be involved.

## Suggested tests / checks

Run:

- `npm run type-check`
- `npm run build` if feasible, because `ImageResponse`/metadata errors often surface at build time.

Manual/local checks:

- Open `/opengraph-image` on localhost and confirm it renders 1200x630.
- Confirm logo is large and centered.
- Confirm the image is not mostly empty/grey.
- Confirm the title/domain preview area would still leave the logo visible in a Facebook-style crop.
- Inspect page metadata in browser devtools or with a local HTML fetch to confirm `og:image` and `twitter:image` are present.

## Localhost checks for Stebbi

After Claude Code implements:

1. Open `http://localhost:3000/opengraph-image` or the active localhost port.
2. Confirm the image shows a large Teskeið logo/mark, not only text.
3. Confirm the image is 1200x630 or at least renders in the intended large Open Graph ratio.
4. Open the home page locally and inspect page source/head metadata.
5. Confirm `og:image` exists and points to the Open Graph image.
6. Confirm `twitter:card` is `summary_large_image`.
7. After deploy, use Facebook Sharing Debugger for `https://teskeid.is` and click scrape/refresh. Facebook may keep the old grey thumbnail until this is done.
8. Share the deployed link in Messenger/Facebook draft and confirm the preview thumbnail uses the Teskeið logo.

## Óvissa / þarf að staðfesta

- Need to confirm whether Facebook currently failed because the OG image is not explicit in metadata, because the generated image was cached, or because the current text-only OG image looked too empty. The proposed fix addresses all three reasonably.
- Need to confirm whether idea pages should keep dynamic OG thumbnails or use the generic logo thumbnail.
- Confidence: high that explicit `og:image` plus a logo-first 1200x630 image is the right fix.

