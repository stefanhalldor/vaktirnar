# Handoff: TODO #77 v004 - Public home ready Teskeið cards clarification

Created: 2026-07-09 21:03
Timezone: Atlantic/Reykjavik
Status: Clarification/handoff - not implemented

## Correction from Stebbi

Codex v003 misunderstood the product intent by focusing too much on the public idea detail page CTA.

Stebbi wants the public/unauthenticated home page (`www.teskeid.is`) to show the same ready Teskeið cards that authenticated users see on `/auth-mvp/heim`.

Target placement:

- On public home page, directly under the hero/header line:
  - `Einn aðgangur. Allt í Teskeið.`
- Show a section like authenticated home:
  - `Tilbúnar Teskeiðar`
  - cards for launched/ready ideas, e.g. `Lánað og skilað`, `Veðrið`, `Umönnun`
- When an unauthenticated user clicks any ready card, navigate to:
  - `https://www.teskeid.is/innskraning`
  - internally use `/innskraning`
- On the login page, add a tasteful label that makes clear access is free:
  - Stebbi suggested: `Teskeið.is aðgangur er ókeypis`
  - Better wording is allowed if it is cleaner/natural.

## Relevant current code

Public home:

- `app/page.tsx`
  - Fetches `user` and public `ideas`.
  - Renders `PublicTopNav` only when no user.
  - Renders `HeroSection` with `t('hero.supportingLine')`.
  - Then renders idea intro text and `<PersonalizedIdeaGrid ideas={ideas ?? []} />`.

Authenticated home ready cards:

- `app/auth-mvp/heim/page.tsx`
  - Imports `ReadyTeskeidCard`.
  - Lines around current ready-card UI:
    - heading uses `t('readyTeskeidarTitle')`
    - cards render in a vertical `flex flex-col gap-3`
    - each `ReadyTeskeidCard` gets `idea`, `href`, and `openLabel={t('readyTeskeidOpen')}`

Reusable card:

- `components/teskeid/ReadyTeskeidCard.tsx`
  - Already matches the visual Stebbi wants.
  - Has per-slug icons/colors for:
    - `lanad-og-skilad`
    - `vedrid`
    - `umonnun`
  - This is the component to reuse. Do not create a visually different new card for this.

Login page:

- `app/innskraning/page.tsx`
  - Currently renders `<PublicTopNav />` then `<TeskeidLoginForm logoHref="/" />`.
- `components/teskeid/TeskeidLoginForm.tsx`
  - Uses `useTranslations('teskeid.auth')`.
  - Best place for a free-access label is likely inside this component, near `loginTitle` / `emailHint`, so it visually belongs to the form and does not fight the `min-h-screen` layout.

Messages:

- `messages/is.json`
  - `teskeid.home.readyTeskeidarTitle`: `Tilbúnar Teskeiðar`
  - `teskeid.home.readyTeskeidOpen`: `Opna`
  - `teskeid.auth.*` contains login form copy.
- `messages/en.json`
  - same structure.

## Recommended implementation

### 1. Public home page: split launched and future ideas

In `app/page.tsx`, after fetching `ideas`:

```ts
const allIdeas = ideas ?? []
const launchedIdeas = allIdeas.filter((idea) => idea.status === 'launched')
const futureIdeas = allIdeas.filter((idea) => idea.status !== 'launched')
```

Use launched ideas for the public ready cards.

Use `futureIdeas` for `PersonalizedIdeaGrid` to avoid showing the same launched Teskeið twice on the same page, unless Stebbi explicitly wants duplication.

### 2. Render ready cards under the hero

Import:

```ts
import { ReadyTeskeidCard } from '@/components/teskeid/ReadyTeskeidCard'
```

Add a public ready section immediately after `<HeroSection />`, before the current intro/grid section:

```tsx
{!user && launchedIdeas.length > 0 && (
  <section className="max-w-[768px] mx-auto px-5 pb-6">
    <h2 className="text-sm font-medium text-muted-foreground mb-3">
      {t('home.readyTeskeidarTitle')}
    </h2>
    <div className="flex flex-col gap-3">
      {launchedIdeas.map((idea) => (
        <ReadyTeskeidCard
          key={idea.slug}
          idea={idea}
          href="/innskraning"
          openLabel={t('home.readyTeskeidOpen')}
        />
      ))}
    </div>
  </section>
)}
```

Use exactly `/innskraning` as the link target. It will resolve correctly on production as `https://www.teskeid.is/innskraning`.

Important: this public section should not run `checkFeatureAccess`, because there is no authenticated user. The purpose is to invite the user to get access.

### 3. Keep or remove detail-page v001 CTA deliberately

There is currently a visible `Fáðu þér ókeypis aðgang` button in `app/hugmyndir/[slug]/page.tsx` from v001/v002 work.

Stebbi's corrected request is about the public home page. Claude Code should ask/confirm before removing the detail-page CTA, or leave it unchanged for now if it is not causing harm. Do not replace detail page content with `ReadyTeskeidCard` as the main implementation for this correction.

### 4. Login page free-access label

Preferred wording:

```text
Teskeið.is aðgangur er ókeypis.
```

Possible cleaner alternative:

```text
Ókeypis aðgangur að Teskeið.is.
```

Recommendation: use `Ókeypis aðgangur að Teskeið.is.` because it is shorter and reads naturally as a small label.

Add message keys under existing login namespace:

```json
"auth": {
  ...
  "freeAccessLabel": "Ókeypis aðgangur að Teskeið.is."
}
```

English:

```json
"freeAccessLabel": "Free access to Teskeið.is."
```

Render it inside `TeskeidLoginForm`, near the top of the card:

- likely after `loginTitle`
- before or above `emailHint`
- use small, calm green label styling
- do not place it as a loose paragraph between `PublicTopNav` and the `min-h-screen` login form, because that risks awkward vertical layout.

Example direction:

```tsx
<p className="mb-3 text-center text-xs font-medium text-[#2d5a27]">
  {t('freeAccessLabel')}
</p>
```

Exact styling can be tuned by Claude Code to match the login card.

## Design.md notes

This is a public UI/navigation change and should follow `Design.md`:

- Mobile-first layout.
- Public pages are included in the mobile app rules.
- Cards are valid here because these are individual repeated ready Teskeið items.
- Reuse existing `ReadyTeskeidCard`; do not invent a new visual pattern.
- Keep max width aligned to existing `max-w-[768px] mx-auto px-5`.
- Avoid horizontal overflow at 360-390 px.
- Navigation via `<Link href="/innskraning">` is okay; no dev server changes needed.

## Risks / watchouts

- Do not show authenticated-only destination routes (`/auth-mvp/vedrid`, etc.) to unauthenticated users in these public cards. Public card href must be `/innskraning`.
- Do not run feature-access checks for anonymous users.
- Avoid duplicate launched ideas in both the ready-card section and the idea grid.
- If filtering launched ideas out of `PersonalizedIdeaGrid`, confirm no tests assume all public ideas appear there.
- Keep all new copy in `messages/is.json` and `messages/en.json`.
- Do not add SQL, RLS, migrations, secrets, deployment or production changes.

## Suggested commands

After implementation:

```bash
npm run type-check
npm run build
```

Run `npm run test:run` if page/component tests are updated or affected.

## Localhost checks for Stebbi

Unauthenticated/private browser:

1. Open `http://localhost:3004/`.
2. Confirm the public hero still shows `Einn aðgangur. Allt í Teskeið.`
3. Directly below it, confirm a `Tilbúnar Teskeiðar` section appears.
4. Confirm it visually matches the authenticated ready-card list:
   - `Lánað og skilað`
   - `Veðrið`
   - `Umönnun`
   - same icons, colors, card rhythm and chevrons.
5. Click each card and confirm it navigates to `/innskraning`.
6. Confirm launched ideas are not duplicated awkwardly in the lower idea list.
7. Check mobile width around 360-390 px for no horizontal overflow or cramped text.

Login page:

1. Open `http://localhost:3004/innskraning`.
2. Confirm the free-access label is visible and feels connected to the login form.
3. Confirm email and code inputs still work and do not cause mobile zoom.

Authenticated browser:

1. Open `http://localhost:3004/`.
2. Confirm the public ready-card invitation section does not appear on the public home page for logged-in users, or that the authenticated redirect/home behavior remains unchanged if that is the current product behavior.
3. Open `/auth-mvp/heim` and confirm existing ready cards still link to their real feature routes.

No Supabase migration, RLS, production data, auth policy, secrets, billing or deployment changes are involved.
