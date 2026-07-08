# TODO-041/042 v008 - Claude handoff - Ready card polish shipped

Created: 2026-07-08 09:01
Timezone: Atlantic/Reykjavik
Author: Claude Code
Status: Changes written and type-checked. SQL migration written but NOT run — Stebbi runs it.

## What was changed

### 1. ReadyTeskeidCard.tsx — compact row layout, per-slug colors, no visible "Opna ->"

`components/teskeid/ReadyTeskeidCard.tsx` — full rewrite.

Changes:
- Layout changed from stacked (icon row + description + "Opna ->") to compact horizontal row (icon | title+description | chevron).
- Removed visible `openLabel` text and `ArrowRight` icon from card body.
- `openLabel` is now used only as the first word of `aria-label` on the `<Link>`: `aria-label={`${openLabel} ${idea.title}`}`.
- Added `ChevronRight` (16px, muted) on the right to reinforce clickability without a visible text button.
- Added `ArrowRight` import removed; `ChevronRight` added.
- Per-slug icon colors:
  - `lanad-og-skilad`: `bg-[#e9f4e6] text-[#2d5a27]` (green)
  - `vedrid`: `bg-[#eef7f7] text-[#1f6f78]` (teal)
  - `umonnun`: `bg-rose-50 text-rose-700` (warm rose, not destructive red)
- Category fallback colors: Umönnun category → rose.
- Default fallback: green (same as before for unknown slugs).
- `umonnun` slug added to `SLUG_ICONS` (Heart icon, was missing).
- `pendingBadge` kept: appears inline after the title in the middle column.
- Short description shown as `text-xs text-muted-foreground mt-0.5 leading-relaxed` below title.
- `openLabel` prop is kept (still passed from parent as `t('readyTeskeidOpen')`).

### 2. sql/70_update_ready_card_descriptions.sql — new migration for short_description

New file: `sql/70_update_ready_card_descriptions.sql`

Updates `ideas.short_description` for:
- `lanad-og-skilad`: `'Haltu utan um hluti sem þú lænar eða færð lánaða.'`
- `vedrid`: `'Ferðaveður byggt á leið, tíma og veðurspá.'`
- `umonnun`: `'Fyrir ættingja, vini og nágranna sem halda umönnuninni gangandi saman.'`

Idempotent (UPDATE WHERE slug = ..., no-op if row absent).

**Stebbi must run this migration manually before the new short descriptions show on localhost/prod.**

## Commands run

```
npm run type-check  # exit 0, no errors
npm run test:run    # 58 files, 1858 passed, 27 skipped, 8 todo — all green
```

## Tests

Home-page tests do not assert on visible "Opna" text — they check `getByText('Lánað og skilað')` (title) and link hrefs. No test changes needed.

## Files changed

- `components/teskeid/ReadyTeskeidCard.tsx`
- `sql/70_update_ready_card_descriptions.sql` (new, not run)

## No changes to

- `app/auth-mvp/heim/page.tsx` — `openLabel={t('readyTeskeidOpen')}` still passed, still works as aria-label prefix.
- `messages/is.json` / `messages/en.json` — `readyTeskeidOpen` key kept as-is.
- Feature gating — Umönnun card still gated by `umonnun` feature access check in `page.tsx`.
- Any auth, SQL, loans, or weather code.

## Localhost checks for Stebbi

Run `sql/70_update_ready_card_descriptions.sql` on local DB first, then open `/auth-mvp/heim`.

1. `Tilbúnar Teskeiðar` section shows compact cards for `Lánað og skilað`, `Veðrið`, and `Umönnun`.
2. Each card is a single horizontal row: icon | title + description | chevron.
3. No visible `Opna ->` text in the card body.
4. Clicking anywhere on the card opens the correct Teskeið.
5. Keyboard tab focus lands on the whole card and the focus ring is visible.
6. `Lánað og skilað`: green icon background, handshake icon.
7. `Veðrið`: teal icon background, cloud-sun icon.
8. `Umönnun`: rose/warm-pink icon background, heart icon — does not look like an error state.
9. Pending invitation badge for `Lánað og skilað` still appears when that state exists.
10. At 360px mobile width: no horizontal overflow, no text/button overlap.
11. Disable Umönnun feature access → Umönnun card disappears; other cards unaffected.
