# 2026-07-16 08:45 - TODO-086 v315 - Codex review of v314 prerelease

Created: 2026-07-16 08:45
Timezone: Atlantic/Reykjavik

Review target: `2026-07-16-0840-todo-086-v314-claude-v312-v313-done-prerelease`

Scope: review only. Codex did not change product code, SQL, env, commits, deployment, or data.

## Findings

### Medium - Handoff and code disagree on full pulse composer variant

The shared composer exists and is used in both places, which is the important architectural direction. However, the v314 localhost check says:

> Inline stöðvarspjald og full pulse: sama "Senda" button stíll (compact variant).

That is not what the code currently does:

- `components/weather/VedurstofanPulseInline.tsx:137-145` uses `ScopedChatComposer variant="compact"`.
- `components/chat/ScopedChatPanel.tsx:200-207` uses `ScopedChatComposer` without passing `variant`, so it defaults to `full`.
- `components/chat/ScopedChatComposer.tsx:26` defaults `variant = 'full'`.
- `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx:95-101` renders `ScopedChatPanel`, so the full pulse page gets the larger/full composer.

This is not necessarily a product bug if the intended decision is: inline station cards are compact, full pulse page is roomier because it has focus. But then the v314 handoff/localhost check should not claim exact compact parity. If Stebbi wants exact visual parity, Claude Code should add a `composerVariant?: 'compact' | 'full'` prop to `ScopedChatPanel` and pass `compact` from `VedurstofanPulsClient`.

Design note: `Design.md` allows text-sm buttons, but requires mobile inputs to be at least 16px to avoid mobile zoom. The current compact input uses `text-base sm:text-sm`, which is good for mobile. The full input uses `text-base`, also safe.

### Low - `resolveBackHref` allows a broader internal prefix than the shared login-next helper

`app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx:17-25` accepts any decoded `returnTo` that starts with `/auth-mvp/vedrid`.

That is internal-only, so this is not an open redirect. Still, it is looser than `lib/auth/loginNext.ts`, which explicitly rejects boundary cases like `/vedrid-fake`. For consistency and future safety, this should use the same boundary style:

- allow `/auth-mvp/vedrid`
- allow `/auth-mvp/vedrid/…`
- allow `/auth-mvp/vedrid?…`
- allow `/auth-mvp/vedrid#…`
- reject `/auth-mvp/vedrid-anything`

Not blocking for localhost testing, but worth tightening before the URL becomes a public pattern.

### Low - One remaining loading-width pattern in generic chat panel

The send button width-jump was fixed by keeping the send label during `disabled`. Good.

`components/chat/ScopedChatPanel.tsx:178-185` still uses `{loadingMore ? '...' : labels.loadOlder}`. This can still change button width. It is not the compose box problem Stebbi flagged, but `Design.md` says loading labels should not change control width. A later cleanup could keep the label and add disabled styling/spinner, or reserve a stable min-width.

## What Looks Correct

- The route restore race from v311/v312 looks fixed. In `app/auth-mvp/vedrid/FerdalagidClient.tsx:343-371`, the clear effect now returns early while restored coordinates are still hydrating, then skips clearing when restored coordinates match.
- Route result persistence is tab-scoped and TTL-limited via `sessionStorage`, schema version and 30-minute TTL in `FerdalagidClient.tsx:88-104`.
- Ferry-port changes and route selection now invalidate `ROUTE_RESTORE_KEY` in `FerdalagidClient.tsx:501-524` and `FerdalagidClient.tsx:1340-1343`.
- Public-to-login-to-pulse flow looks materially improved:
  - `components/weather/VedurstofanPulseInline.tsx:111-117` carries `returnTo` into the full pulse login `next`.
  - `components/teskeid/TeskeidLoginForm.tsx:125-128` preserves `nextHref` when sending a new/incomplete user to `/auth-mvp/minn-profill`.
  - `app/auth-mvp/minn-profill/page.tsx:111-113` validates `next` with `resolveSafeLoginNext` before redirecting.
  - `lib/auth/loginNext.ts:18-27` rejects external/protocol-relative/untrusted redirects.
- Inline pulse now uses a shared composer and short placeholder in `VedurstofanPulseInline.tsx:137-145`.
- Empty public pulse preview is hidden in `VedurstofanPulseInline.tsx:119-123`, so public users should not see an empty "Nýjast af staðnum" block when there are no messages and they cannot post.
- The main `/vedrid` header back arrow appears removed from `FerdalagidClient.tsx:1149-1156`, matching Stebbi's request.
- Refresh button is hidden for public/guest users in `FerdalagidClient.tsx:1134-1144`.

## Tests / Commands Reviewed

Codex read:

- `WORKFLOW.md`
- `Design.md` relevant UI/mobile/form/navigation sections
- `ai-handoff/README.md`
- `ai-handoff/2026-07-16-0840-todo-086-v314-claude-v312-v313-done-prerelease.md`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `components/chat/ScopedChatComposer.tsx`
- `components/chat/ScopedChatPanel.tsx`
- `components/weather/VedurstofanPulseInline.tsx`
- `components/weather/VedurstofanPointCard.tsx`
- `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx`
- `components/teskeid/TeskeidLoginForm.tsx`
- `app/auth-mvp/minn-profill/page.tsx`
- `lib/auth/loginNext.ts`
- relevant message keys in `messages/is.json` and `messages/en.json`

Codex did not rerun `npx tsc --noEmit` or browser tests. Claude Code reports type-check clean in v314.

## Recommendation

I would let Stebbi proceed to localhost testing, with one explicit decision before asking Claude Code for more code:

Should the full pulse page use the exact same compact composer look as station cards, or is it intentionally roomier because it is the focused full-page experience?

If intentionally roomier, v314 is coherent enough for localhost testing, but the handoff checklist should be mentally corrected. If exact parity is required, ask Claude Code to add `composerVariant` to `ScopedChatPanel` and pass `compact` from `VedurstofanPulsClient`.

## Localhost Checks For Stebbi

1. Open `/vedrid` as public user, calculate a route that includes Veðurstofan station cards, then refresh the page.
   Expected: the same route result and calculations return, not the initial route form.

2. From that same public result, click "Sjá fleiri skilaboð eða segja frá aðstæðum" on a station pulse.
   Expected: login opens with the full pulse URL preserved as `next`.

3. Log in as a user with an existing display name.
   Expected: after login, land on the correct full pulse page for that station.

4. Click "Til baka í ferðaveðrið".
   Expected: land on `/auth-mvp/vedrid` with the same route result restored.

5. Repeat with a user that has no display name.
   Expected: login sends to `/auth-mvp/minn-profill?next=...`, profile save returns to the correct pulse page, and back returns to the restored route result.

6. Check the full pulse compose area on mobile widths around 360px, 390px and 460px.
   Expected: no horizontal overflow, no clipped placeholder, no mobile zoom on input focus, and the "Senda" button does not jump width on send.

7. Check station-card inline pulse compose area on the same mobile widths.
   Expected: compact input/button still fits inside the weather card and does not overpower the surrounding forecast rows.

8. As public user on a station with no messages, verify the pulse block is hidden entirely.
   Expected: no empty "Nýjast af staðnum" section.

9. As public user on a station with messages, verify preview is visible but posting requires login.
   Expected: "Sjá fleiri skilaboð eða segja frá aðstæðum" routes through login and preserves context.

10. As public user with stale Veðurstofan data, verify no manual "Sækja ný gögn" action is available.
    Expected: refresh control is hidden for public users.

## Uncertainty / Needs Confirmation

- Whether the full pulse page should intentionally use the larger `full` composer variant or exact compact parity with station cards.
- Codex did not run tests locally, so the reported clean type-check is based on Claude Code's v314 handoff.
