# Review: TODO #77 v003 - ReadyTeskeidCard CTA plan

Created: 2026-07-09 20:57
Timezone: Atlantic/Reykjavik
Reviewed handoff: `2026-07-09-2035-todo-077-v002-claude-ready-card-cta-plan.md`
Status: Review only - not implemented

## Findings

### 1. Blocking: `ReadyTeskeidCard.openLabel` is not visible UI text

The v002 plan assumes this will show `Fáðu þér ókeypis aðgang` on the card:

```tsx
<ReadyTeskeidCard
  idea={idea}
  href="/innskraning"
  openLabel={t('ideas.freeAccountCta')}
/>
```

But `ReadyTeskeidCard` only uses `openLabel` in `aria-label`:

- `components/teskeid/ReadyTeskeidCard.tsx:66` uses `aria-label={`${openLabel} ${idea.title}`}`
- Visible text is only `idea.title` and `idea.short_description` at lines 74 and 85.
- The right side is only a chevron at line 88.

So the explicit user-facing CTA text Stebbi asked for would disappear from the screen. That should not ship as-is.

Recommended fix:

- Either keep the v001 visible button and stop there, or
- Extend `ReadyTeskeidCard` with an optional visible `actionLabel` / trailing label, or
- Create a small public CTA wrapper/component that visibly shows both the ready card and `Fáðu þér ókeypis aðgang`.

Do not rely on `openLabel` for visible copy.

### 2. Medium/high: the plan duplicates the short description

The plan places `ReadyTeskeidCard` before `idea.short_description` and says the short description should remain below it. But `ReadyTeskeidCard` already renders `idea.short_description` when present:

- `components/teskeid/ReadyTeskeidCard.tsx:84-85`
- `app/hugmyndir/[slug]/page.tsx:95` currently renders the same text separately.

For `Veðrið`, that likely means the same short sentence appears twice close together. If the card is used, Claude Code should either avoid duplicating the description or choose a simpler CTA button instead.

### 3. Medium: adding `Aðgangurinn er ókeypis` outside `TeskeidLoginForm` risks awkward layout

The v002 plan suggests inserting a `<p>` between `<PublicTopNav />` and `<TeskeidLoginForm />` in `app/innskraning/page.tsx`.

Current login page:

- `app/innskraning/page.tsx:23-27` renders nav and then the form.
- `components/teskeid/TeskeidLoginForm.tsx:127` starts with `min-h-screen bg-[#fbf9f4] flex items-center justify-center px-4`.

Putting a loose label above a `min-h-screen` form will likely create extra vertical scroll and make the label feel detached from the login card. If this label is still desired, integrate it inside `TeskeidLoginForm`, near `loginTitle` / `emailHint`, or skip it in this phase.

### 4. Medium: message namespace should reuse `teskeid.auth`, not create `teskeid.login`

`TeskeidLoginForm` uses `useTranslations('teskeid.auth')` at `components/teskeid/TeskeidLoginForm.tsx:13`. Current login strings live under:

- `messages/is.json:296`
- `messages/en.json:292`

The plan proposes a new `teskeid.login.freeAccessLabel` namespace. That is unnecessary fragmentation unless there is a strong reason. Prefer `teskeid.auth.freeAccessLabel` if the label is added to the login form.

### 5. Low/medium: handoff format misses required heading

The v002 file has `Localhost checks:` but workflow requires the exact section `Localhost checks for Stebbi` in every implementation plan/handoff/review. It should also mention `npm run build`, because this touches Next route rendering and translations.

## Recommendation

Do not implement v002 exactly as written.

Simplest safe path:

1. Keep the already implemented v001 simple button for now, or move it slightly higher if Stebbi wants it more visible.
2. If Stebbi specifically wants a richer card, add a visible CTA affordance to the card/wrapper so `Fáðu þér ókeypis aðgang` is actually visible.
3. Avoid duplicating `idea.short_description`.
4. Do not add login page copy unless Stebbi confirms it; it is scope creep from the original public idea CTA.
5. If login copy is added, put it inside `TeskeidLoginForm` and under `teskeid.auth`.

## Suggested revised implementation

Option A, lowest risk:

- Leave `app/hugmyndir/[slug]/page.tsx` v001 button in place.
- Maybe move the button before `short_description` if visibility is the only concern.
- Keep `messages/is.json` / `messages/en.json` existing `ideas.freeAccountCta`.
- Do not touch login page.

Option B, richer card:

- Add an optional visible prop to `ReadyTeskeidCard`, for example:

```ts
visibleActionLabel?: string
```

- Render it as a small primary/green text affordance near the chevron or under the description.
- Use `openLabel` only for accessibility/navigation context, not as the visible CTA.
- On public idea detail page, either:
  - do not render the separate `idea.short_description` when the card already renders it, or
  - allow `ReadyTeskeidCard` to suppress its description in this context.

## Localhost checks for Stebbi

After Claude Code revises and implements:

1. Open an unauthenticated/private browser window.
2. Visit `http://localhost:3004/hugmyndir/vedrid`.
3. Confirm a launched idea still shows the `KOMIÐ ÚT` badge.
4. Confirm `Fáðu þér ókeypis aðgang` is visible on the page, not only in accessibility metadata.
5. Click the CTA/card and confirm it navigates to `/innskraning`.
6. Confirm the short description is not duplicated awkwardly.
7. Confirm the vote button still appears and behaves as before.
8. Confirm a non-launched public idea does not show this CTA.
9. Confirm an authenticated user does not see this unauthenticated CTA.
10. Check mobile width around 360-390 px for no horizontal overflow, cramped wrapping or weird vertical scroll.

If login page copy is added:

1. Visit `http://localhost:3004/innskraning`.
2. Confirm `Aðgangurinn er ókeypis` appears visually connected to the login form.
3. Confirm the form is still centered sensibly on mobile and desktop.
4. Confirm email/code inputs still avoid mobile zoom and keep their existing focus behavior.

## Commands

Run after implementation:

```bash
npm run type-check
npm run build
```

Run `npm run test:run` if Claude Code changes tested component behavior or existing tests cover the idea/login pages.

No SQL, RLS, Supabase schema, secrets, deployment, production data or billing changes are needed.
