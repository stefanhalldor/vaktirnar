# TODO #41/#42 v007 - Codex handoff - Tilbunar Teskeidar frontpage polish

Created: 2026-07-08 07:32  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Status: Handoff/plan only. No app code, SQL, env, deployment, or production data changed.

## Context

Stebbi wants the ready Teskeidar cards on `/auth-mvp/heim` to feel more polished, compact, and clickable.

Current screenshot concern:

- The cards are visually large and text-heavy.
- The visible `Opna ->` line feels unnecessary because the whole card should clearly be clickable.
- `Vedrid` has especially long text for a frontpage card.
- `Umonnun` could use a warmer heart signal, possibly red/rose, but it should not feel like an error/destructive state.
- Stebbi suggested this stronger Umonnun positioning text:

> Tol fyrir umonnunarhringi, aettingja, vini og nagranna sem halda utan um umonnunina saman. Hannad fyrir thann raunverulega og oft flokna veruleika sem fylgir thvi thegar margir thurfa ad lata hlutina ganga upp i sameiningu.

Use the actual Icelandic characters in user-facing text when implementing.

## Related TODOs

- Primary: `TODO.md` #42 - Tilbunar Teskeidar efst og sidast opnud fyrst.
- Related: `TODO.md` #41 - Umonnun sem feature-flagged Teskeid.

## Files to inspect

- `app/auth-mvp/heim/page.tsx`
- `components/teskeid/ReadyTeskeidCard.tsx`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/home-page.test.tsx`
- SQL migrations that seed/update `ideas.short_description`, especially:
  - `sql/09_update_umonnun_launched.sql`
  - `sql/19_update_lanad_og_skilad.sql`
  - the migration or seed that currently controls `vedrid`

## Design.md constraints to follow

This is a UI/layout/content change, so follow `Design.md`:

- Mobile-first and app-like.
- Calm, trustworthy, clear, and not cramped.
- Cards are acceptable for repeated items, but should not become oversized content blocks.
- Avoid redundant text buttons when the whole item is already a clear click target.
- Preserve visible focus and route-transition/pending feedback.
- No horizontal overflow on mobile.

## Current implementation notes

`/auth-mvp/heim` builds ready cards from launched `ideas` and passes them to `ReadyTeskeidCard`.

`ReadyTeskeidCard` currently:

- renders a full-card `Link`;
- shows icon, title, `idea.short_description`;
- shows visible `openLabel` and an arrow;
- uses one shared green icon treatment for all ready cards.

The card descriptions appear to come from `ideas.short_description`, not from `messages/*.json`. `messages` currently provides `readyTeskeidOpen`, but the actual card copy likely needs a DB-backed migration if we want reproducible local/prod copy.

## Product decision

Do not make these icon-only.

Icon-only cards are too opaque for first-time users and weaken the value signal. The better version is:

- icon;
- title;
- one short sentence;
- whole card clickable;
- no visible `Opna ->` text;
- optional subtle chevron/icon on the right to reinforce clickability.

This gives the home screen a more app-launcher feel without making users guess what each Teskeid does.

## Proposed UI

### Ready card layout

Make each ready card compact and row-like:

- Left: icon container, around 40x40.
- Middle: title + short description.
- Right: subtle chevron, or nothing if card affordance is already obvious.
- Entire card is clickable.
- `aria-label` should still communicate the action, e.g. `Opna Vedrid`.
- Keep keyboard focus visible on the card.

Remove visible `Opna ->` from the card body. If tests depend on the visible text, update them to assert accessible navigation instead.

### Icon styling

Use distinct but restrained icon colors:

- `Lanad og skilad`: handshake, green family.
- `Vedrid`: cloud/sun, green/teal or muted weather tone.
- `Umonnun`: heart, warm rose/red accent.

Important: Umonnun heart can be rose/red, but not the same visual language as error/destructive red. A subtle rose background with darker rose icon is enough.

Example direction, not exact required classes:

- `bg-[#e9f4e6] text-[#2d5a27]` for green.
- `bg-[#eef7f7] text-[#1f6f78]` for weather.
- `bg-rose-50 text-rose-700` or equivalent for Umonnun.

Verify contrast.

## Suggested card copy

Keep home-card descriptions short. The long Umonnun copy is good positioning, but too long for the ready-card itself.

### Icelandic, home cards

`Lanad og skilad`

```text
Haltu utan um hluti sem thu lanar eda faerd lanada.
```

`Vedrid`

```text
Ferdavedur byggt a leid, tima og vedurspa.
```

`Umonnun`

Option A:

```text
Fyrir aettingja, vini og nagranna sem halda umonnuninni gangandi saman.
```

Option B, slightly more product-specific:

```text
Fyrir umonnunarhringi sem halda utan um umonnunina saman.
```

Codex recommendation: use Option A on the frontpage. It is more human and easier to understand than `umonnunarhringir` for users who have not heard the term yet.

### Icelandic, Umonnun detail/info page

Use Stebbi's longer text here, not inside the compact home card:

```text
Tol fyrir umonnunarhringi, aettingja, vini og nagranna sem halda utan um umonnunina saman. Hannad fyrir thann raunverulega og oft flokna veruleika sem fylgir thvi thegar margir thurfa ad lata hlutina ganga upp i sameiningu.
```

When implementing, use proper Icelandic characters:

```text
Tól fyrir umönnunarhringi, ættingja, vini og nágranna sem halda utan um umönnunina saman. Hannað fyrir þann raunverulega og oft flókna veruleika sem fylgir því þegar margir þurfa að láta hlutina ganga upp í sameiningu.
```

### English draft copy

`Borrowed and returned`

```text
Keep track of things you lend or borrow.
```

`Weather`

```text
Route weather based on route, timing and forecast data.
```

`Care`

```text
For family, friends and neighbours coordinating care together.
```

Umonnun detail/info page:

```text
A tool for care circles, relatives, friends and neighbours who coordinate care together. Built for the real and often messy reality of helping many people keep things moving together.
```

Adjust tone to match existing English conventions if needed.

## Data/copy implementation decision

Because `ReadyTeskeidCard` displays `idea.short_description`, do not hardcode these descriptions in the component unless there is already an established app-level override pattern.

Preferred approach:

1. Add a small SQL migration that updates `ideas.short_description` for launched ready Teskeidar:
   - `lanad-og-skilad`
   - `vedrid`
   - `umonnun`
2. Keep component behavior generic.
3. Update `messages/is.json` and `messages/en.json` only for static labels that actually come from messages, such as removing or deprecating `readyTeskeidOpen` if no longer used.

Do not run the migration without explicit approval from Stebbi.

If Stebbi prefers changing copy manually in production DB instead of migration, document that local/prod can drift. For this app, a migration is safer and more repeatable.

## Implementation checklist for Claude Code

1. Update `ReadyTeskeidCard` visual layout:
   - compact row/card layout;
   - whole card remains `Link`;
   - remove visible `Opna ->`;
   - keep accessible action label;
   - keep pending badge if currently shown.

2. Add per-card icon treatment:
   - derive by slug first, category fallback second;
   - keep Umonnun heart warm rose/red but not error-red.

3. Keep feature gating unchanged:
   - Umonnun card must still be hidden when Umonnun access/flag is off.
   - Vedrid and Lanad og skilad behavior unchanged.

4. Update data copy:
   - add migration or documented data update for `ideas.short_description`;
   - if Umonnun detail/info page copy is message-backed, update `messages/is.json` and `messages/en.json`.

5. Update tests:
   - `lib/__tests__/home-page.test.tsx` likely expects visible `Opna`; update tests to assert link target/accessibility instead.
   - Keep tests for feature visibility and pending state.

6. Confirm no app-wide nav, auth, loans, weather, or Umonnun gating behavior changes are introduced.

## Risks and edge cases

- Removing visible `Opna` can reduce affordance if the card styling is too passive. Use hover/focus style and possibly a subtle chevron.
- If `readyTeskeidOpen` is removed from UI but left in messages, it is harmless but should not drive tests.
- If copy is updated only in DB manually, localhost and production may disagree.
- Rose/red Umonnun icon must not look like validation error or danger state.
- Text length must be checked at 360px mobile width.

## Suggested commands

Run after implementation:

```bash
npm run type-check
npm run test:run
```

If the repo has a reliable focused test command for home-page tests, run that too.

## Localhost checks for Stebbi

Open `/auth-mvp/heim` as a logged-in user.

Check with all relevant feature access enabled:

1. `Tilbúnar Teskeiðar` appears above the ideas section.
2. Cards for `Lánað og skilað`, `Veðrið`, and `Umönnun` are compact and easy to scan.
3. There is no visible `Opna ->` line.
4. Clicking anywhere on each card opens the correct Teskeið.
5. Keyboard tab focus lands on the whole card and focus is visible.
6. Umonnun uses a heart with a warm accent, but it does not read as an error.
7. The weather card text is short and does not wrap into a long paragraph.
8. Pending invitation badge for `Lánað og skilað` still appears when that state exists.
9. On a narrow mobile viewport, no horizontal overflow and no text/button overlap.

Feature-gate checks:

1. Disable Umonnun access/flag in the usual local-safe way.
2. Refresh `/auth-mvp/heim`.
3. Umonnun should disappear from ready cards.
4. Loans and weather should remain unaffected.

Do not test SQL migration against production unless Stebbi explicitly approves running that migration.
