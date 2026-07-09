# TODO 077 v001 - Public ready idea free access CTA

## Context

Stebbi wants public idea detail pages for unauthenticated users to show a clear CTA:

> Fáðu þér ókeypis aðgang

The CTA should send the user to the canonical Teskeið login page. At minimum, this should appear on ideas that are ready/launched, for example `Veðrið` where the status badge says `KOMIÐ ÚT`.

This is a small UI/copy change, not a database change.

## Plan

1. Add translatable CTA copy in `messages/is.json` and `messages/en.json`.
2. In `app/hugmyndir/[slug]/page.tsx`, detect whether the visitor is authenticated with the existing Supabase server client.
3. Render the CTA only when:
   - `idea.status === 'launched'`
   - no authenticated user is present
4. Link the CTA to `/innskraning`, matching the existing public nav login target in `components/teskeid/PublicTopNav.tsx`.
5. Place the CTA high enough to be visible on mobile, probably after `idea.short_description` and before the long `Af hverju...` / `Tilbúin lausn` sections.
6. Keep existing vote behavior, launched external links, other ideas, metadata and nav unchanged.

## Suggested implementation details

Relevant current files:

- `app/hugmyndir/[slug]/page.tsx`
  - Current detail page fetches `idea` and `allIdeas`.
  - Header/title/status are around the top of the article.
  - `idea.status === 'launched'` is already used to choose launched copy headings.
- `components/teskeid/PublicTopNav.tsx`
  - Existing canonical login link is `/innskraning`.
- `components/teskeid/StatusBadge.tsx`
  - `launched` maps to `Komið út`.
- `messages/is.json`
  - Add a key under `teskeid.ideas`, for example:
    - `freeAccountCta`: `Fáðu þér ókeypis aðgang`
- `messages/en.json`
  - Add matching key, for example:
    - `freeAccountCta`: `Get free access`

Suggested server-side auth check in `IdeaPage`:

```ts
const {
  data: { user },
} = await supabase.auth.getUser()

const showFreeAccessCta = idea.status === 'launched' && !user
```

Do not use `guardTeskeidSession()` here because this is a public page and unauthenticated users must be allowed to read it.

Suggested markup pattern:

```tsx
{showFreeAccessCta && (
  <div className="mb-8">
    <Link
      href="/innskraning"
      className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#154212] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2d5a27] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#154212] focus-visible:ring-offset-2"
    >
      {t('ideas.freeAccountCta')}
    </Link>
  </div>
)}
```

If it looks better in the existing page rhythm, use `w-full sm:w-auto` so the CTA feels mobile-first but does not become a huge desktop bar. Avoid making a new card just for this CTA.

## Design.md notes

This touches public UI, layout and navigation, so follow `Design.md`:

- Mobile-first is required for public pages too.
- Primary actions should be easy to find but not necessarily floating.
- Buttons should use dark Teskeið green, white text, stable dimensions and no layout shift.
- Navigation-triggering links/buttons must not feel dead; a normal Next `<Link>` is fine for this small route change.
- Avoid nested cards and decorative containers here. This is a direct CTA in an existing content flow.
- Verify no horizontal overflow at mobile widths.

## Risks / things to watch

- Do not show the CTA to authenticated users if the requirement is strictly unauthenticated only.
- Do not redirect authenticated users away from the public idea page.
- Do not replace or remove `VoteButton`; voting is separate from account signup.
- Do not accidentally show the CTA on non-launched ideas unless Stebbi expands the requirement.
- This page already uses Supabase server client and cookies. `supabase.auth.getUser()` may make the page dynamic, but it is already reading Supabase data server-side for the idea, so this should be acceptable.
- Keep all user-visible strings in `messages/is.json` and `messages/en.json`.

## Commands to run

After implementation:

```bash
npm run type-check
npm run build
```

If there are existing relevant tests for the idea page/messages, run them too. Do not start or restart the dev server unless Stebbi explicitly asks.

## Localhost checks for Stebbi

Open an unauthenticated/private browser window and visit:

```text
http://localhost:3004/hugmyndir/vedrid
```

Expected:

- The page still loads publicly.
- The status badge still says `KOMIÐ ÚT`.
- A visible primary CTA says `Fáðu þér ókeypis aðgang`.
- Clicking it navigates to `/innskraning`.
- The existing top nav login link still works.
- The vote button still appears and behaves as before.
- No horizontal overflow or awkward wrapping on mobile width.

Then test while logged in:

- Visit the same launched idea page.
- The new CTA should not be visible if the authenticated-only hiding requirement was implemented.
- Existing content, vote button, launched links and `Aðrar hugmyndir` remain unchanged.

Also spot-check one non-launched public idea:

- The new CTA should not show there unless Stebbi explicitly broadens the scope.

No Supabase migration, RLS, auth policy, secrets, production data, billing or deployment changes are needed for this task.
