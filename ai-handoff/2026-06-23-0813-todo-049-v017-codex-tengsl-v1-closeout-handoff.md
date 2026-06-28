# TODO #49 v017 - Tengsl v1 closeout

**Fra:** Codex  
**Til:** Claude Code  
**Dagsetning:** 2026-06-23 08:13  
**Stada:** Handoff fyrir næsta TODO atridi eftir ad #43 var fært i DONE.  
**Markmid:** Loka Tengsl v1 eda skila afmorkudu fix-plan/handoff med thvi sem vantar.

## Context

#49 er nu efst i TODO eftir ad #43 var fært i DONE. Stebbi vill vinna niður listann med audveldustu sigrana fyrst.

Nyjustu tengdu niðurstöður:

- `896fe4f` lagaði recipient picker dedup, LoanSummaryCard dates og heim badge source.
- Codex rýndi `896fe4f` og fann engin blocking findings.
- #43 Gmail canonical + soft-ack er fært i DONE; ekki opna thad aftur nema #49 prófun sýni beina regression.
- `Design.md` og `AGENTS.md` hafa verið uppfærð: UI/navigation/mobile vinna þarf alltaf að miða við `Design.md`, app-like mobile hegðun, no unwanted zoom og loader/pending state í navigation.

## What "close Tengsl v1" means

Tengsl v1 telst lokað þegar:

1. `/stillingar/tengsl` sýnir tengslalista eins og app, ekki veflega síðu sem þysjast inn á mobile.
2. Dotted/canonical Gmail tengsl eru sameinuð í eina línu í lista og recipient picker.
3. Tengsl-detail sýnir rétt identity:
   - `private_display_name` ef eigandi hefur sett innra heiti.
   - annars `counterpart_display_name` / nafn sem viðkomandi hefur sjálfur sett, ef það er örugglega staðfest.
   - annars email.
4. `Mín skýring` birtist sem sér lína/svæði, ekki falin bakvið langt bandstrik og fer ekki út fyrir mobile skjá.
5. Recipient picker í nýju lánaformi er deduped, læsilegur og mobile-safe.
6. Navigation inn í tengsl, inn á detail og til baka sýnir loader/pending state þar sem bið verður.
7. Feature flag/gating er fail-closed og lekur ekki tengslagögnum milli notenda.
8. Það sem er stærra en v1 er greinilega skilið eftir í öðrum TODO: #50 fjölskylda, #52/#37 event-feed, #22 canonical routes.

## Scope

In scope:

- `/stillingar/tengsl` listi, mobile layout, navigation feedback.
- Tengsl detail page: display name, private note, common loan activity, open loan links.
- Relationship recipient options/picker in loan create form.
- Gmail canonical dedup for relationships and picker.
- Tests that pin dedup, display fallback, access boundaries and navigation/mobile-sensitive rendering where practical.
- Handoff/update recommending DONE if all checks pass.

Out of scope unless required by direct bug:

- #50 family members as relationships.
- #52/#37 `Ólesið` and event-feed work.
- #22 full `/auth-mvp` route cleanup.
- #46/#7 auth/session work.
- Facebook/OAuth.
- Large new SQL schema unless current v1 cannot be safely closed without it.

## Files to inspect

Start with `Design.md`, especially:

- mobile app baseline
- forms/inputs/selects
- navigation feedback og loader
- no overflow / no unwanted zoom

Then inspect:

- `app/stillingar/tengsl/page.tsx`
- `app/stillingar/tengsl/[id]/page.tsx`
- `app/stillingar/layout.tsx` or relevant settings shell if present
- any `loading.tsx` under `app/stillingar` / `app/stillingar/tengsl`
- `lib/relationships/actions.ts`
- `components/loans/LoanForm.tsx`
- `lib/loans/actions.ts` where relationship writes are triggered
- `lib/auth/email-normalization.ts`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/tengsl-actions.test.ts`
- `lib/__tests__/tengsl-pages.test.tsx`
- `lib/__tests__/loan-form.test.tsx`
- `lib/__tests__/home-page.test.tsx` only if badge/heim interactions are touched

Do not read `.env.local`.

## Known issues to verify

These came from Stebbi’s recent testing:

1. `ariel.petursson@gmail.com` and `arielpetursson@gmail.com` must not show as two people when they canonicalize to same Gmail account.
2. `Mín skýring` must be below recipient/person name, slightly indented or visually grouped, and must not overflow mobile viewport.
3. If owner has not created `private_display_name`, use the counterpart’s own display name when safely available.
4. `/stillingar/tengsl` must feel app-like on mobile. Avoid viewport zoom, wrong scroll state, cramped native select/list behavior and dead navigation.
5. Loader/pending state should be visible when user clicks a contact and when going back if route/data is pending.

## Suggested verification sequence

### 1. Current-state audit

Before editing, inspect whether current code already satisfies the above due to recent Claude/Codex changes.

Check:

- Is `/stillingar/tengsl` canonical route implemented and guarded?
- Are there `loading.tsx` files for route segments that wait on auth/feature/data?
- Does list group by `normalizeEmailForAccess()`?
- Does detail resolve `counterpart_user_id` locally before returning?
- Does recipient picker use the same dedup logic as directory?
- Are `private_display_name`, `counterpart_display_name`, `email_canonical`, `note` kept private to owner?
- Are user-facing strings in `messages/is.json` / `messages/en.json`?

### 2. Fix only remaining v1 gaps

Preferred order:

1. Mobile/navigation polish and loader if missing.
2. Display fallback/order bugs.
3. Dedup edge cases.
4. Tests.

Avoid broad refactors. If something needs a bigger SQL merge/backfill, document it as a follow-up, do not force it into v1 closeout unless it is blocking.

### 3. Tests

Run targeted tests:

```bash
npm run test:run -- lib/__tests__/tengsl-actions.test.ts lib/__tests__/tengsl-pages.test.tsx lib/__tests__/loan-form.test.tsx
npm run type-check
```

If UI/navigation changes touch home or loans:

```bash
npm run test:run -- lib/__tests__/home-page.test.tsx lib/__tests__/loan-pages.test.tsx lib/__tests__/loan-card.test.tsx
```

If SQL is changed or added:

```bash
npm run test:run -- lib/__tests__/sql-migration.test.ts
```

## Important risks

- Privacy: `private_display_name` and private note are owner-only. They must never be exposed to counterpart or unrelated users.
- Service role: actions may use service role, but must remain owner-scoped and fail closed.
- Email normalization: Gmail dot rules only for Gmail/Googlemail. Do not merge non-Gmail dotted local-parts.
- Duplicate DB rows: in-memory dedup is acceptable for v1. Do not rewrite canonical email into a row if duplicate literal row still exists and would hit unique constraints. A true SQL merge/backfill should be a separate migration if needed.
- Feature flags: if Tengsl is disabled for user, route/actions should not leak data or look like empty state unless that is intentional and safe.
- Mobile: text must not overflow. Inputs/selects/buttons should be at least 16px text where iOS zoom matters.
- Navigation: user should not feel a dead tap when opening contact detail or going back.

## Suggested acceptance criteria

Functional:

- Existing loan counterpart appears in `/stillingar/tengsl`.
- Dotted and undotted Gmail variants show as one relationship.
- Non-Gmail dotted variants remain separate.
- Detail page displays:
  - owner private display name when set,
  - otherwise counterpart profile display name when safely resolved,
  - otherwise email.
- Private note displays below name and wraps safely.
- Shared loan activity on detail is owner-scoped and links to loans the owner can access.
- Recipient picker shows each canonical person once, with name/email/note in a mobile-safe layout.
- Selecting contact fills recipient email correctly.

Security/privacy:

- Unauthenticated user cannot access settings/tengsl.
- User A cannot access User B’s relationship row by guessing id.
- Private display name/note do not leak to counterpart.
- Relationship activity does not include loans where owner is not participant.
- Feature flag disabled state is safe and understandable.

Design/mobile:

- `/stillingar/tengsl` and detail work at 360-460px.
- No horizontal scroll, text overlap, clipped note, or unwanted input zoom.
- Navigation to contact detail and back shows loader/pending state when waiting.
- Design follows `Design.md`.

## SQL/Supabase guidance

Do not run SQL unless Stebbi explicitly asks.

If you think SQL is needed:

- Create a separate migration in `sql/` with next number.
- Include transaction, idempotency where possible, grants/RLS notes and rollback.
- Explain whether it touches schema, data, functions, RLS, auth, policies or production data.
- Send handoff to Codex before Stebbi runs it.

For v1 closeout, prefer TypeScript-side verification/fixes if current schema already supports behavior.

## Localhost checks for Stebbi

### A. Tengsl listi og duplicate Gmail

1. Open `/stillingar/tengsl`.
2. Use a user with relationships for both `ariel.petursson@gmail.com` and `arielpetursson@gmail.com` or equivalent synthetic pair.

Expected:

- They show as one person/row, not two.
- Non-Gmail dotted pair, if present, remains separate.
- Row title is the best display name, not an arbitrary email, when a safe name exists.

### B. Tengsl detail display

1. Click a relationship from the list.
2. Check header/title, email, category/tag, private name and private note.

Expected:

- If `Mitt heiti á þessum aðila` exists, it is primary.
- If no private name exists but counterpart profile name exists, profile name is used.
- `Mín skýring` is below the name, not after a long dash.
- Long note wraps inside mobile width.

### C. Mobile app feel

Viewport: 360-460px responsive mode or real phone.

1. Open `/stillingar/tengsl`.
2. Tap into detail.
3. Go back.
4. Edit private name/note if UI allows it.

Expected:

- No unwanted zoom.
- No horizontal overflow.
- No text overlap.
- Loader/pending feedback appears when waiting for page/data.
- Back navigation does not leave page in weird scroll/zoom state.

### D. Recipient picker in new loan form

1. Open `/auth-mvp/lanad-og-skilad/ny`.
2. Inspect relationship picker.
3. Select a relationship with private name + email + note.
4. Create or cancel before creating, depending on test data safety.

Expected:

- Duplicate Gmail pair appears once.
- Name is first line.
- Email is secondary if different from name.
- Note is below and indented/wrapped.
- Selecting contact fills/sends the correct recipient email.
- Manual email entry still works if picker is absent/disabled.

### E. Privacy/access regression

If possible with two users:

1. User A opens their relationship detail.
2. Copy detail URL.
3. User B tries to open it.

Expected:

- User B sees not found/blocked behavior, not User A’s private note/name/activity.

Do not test by modifying production data casually. Use local/test data where possible.

## Handoff back to Codex

Return one handoff with:

1. Whether #49 is ready for DONE or what remains.
2. Files inspected.
3. Files changed.
4. Tests run and results.
5. Any SQL written/run (preferably none unless explicitly approved).
6. Design.md compliance notes.
7. Localhost checks Stebbi should perform or has performed.
8. Any follow-up TODOs that should remain separate (#50, #52/#37, #22, etc.).
