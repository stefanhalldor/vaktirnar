# TODO 086 v352 - Codex review of v351 Claude prerelease

Created: 2026-07-16 18:15  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Reviewed handoff: `2026-07-16-1810-todo-086-v351-claude-v350-done-prerelease.md`

## Findings

### 1. Medium: v351 still conflicts with the latest visible public-empty Veðurpúls requirement

`components/weather/VedurstofanPulseInline.tsx:106-136` always renders the inline Veðurpúls wrapper. For a public user with no messages, `ChatPreviewList` renders the empty label at `components/chat/ChatPreviewList.tsx:26-29`, now using `pulseEmptyPublic` from `components/weather/VedurstofanPulseInline.tsx:111`.

The v351 handoff says Codex v350 finding 1 was "intentionally ignored per Stebbi's product decision." I do not see that newer decision in the visible thread. The latest explicit product request I can see was:

> sem public notandi þegar engin skilaboð eru til fyrir veðurstöð þá ættum við bara að fela þennan component alfarið

So unless Stebbi gave Claude Code an out-of-band/newer instruction, this is still a product regression.

Recommended decision before release:

- If public-empty station pulse should be hidden, implement the v350 condition.
- If public-empty station pulse should now be visible, Stebbi should explicitly confirm that product decision because it reverses the production-test feedback.

Suggested hide rule if keeping the latest visible request:

```ts
const shouldHideEmptyReadOnly =
  previewLoaded &&
  messages.length === 0 &&
  (postingAccess === 'needs-login' || postingAccess === 'denied')

if (shouldHideEmptyReadOnly) return null
```

Authenticated users with posting access should still see the composer even when empty.

### 2. Medium / UX: route-scoped Safnpúls is now visible even when it has no messages

`components/weather/VedurstofanRoutePulseSummary.tsx:92-122` renders the collapsed route Safnpúls after load regardless of whether any route station has messages. When opened, the body maps stations and returns `null` for stations with no messages at `components/weather/VedurstofanRoutePulseSummary.tsx:123-125`, so the drawer can show a title/subtitle and then no content.

This may be acceptable if Stebbi explicitly wants a persistent route-level pulse drawer, but the current text says "Nýleg skilaboð frá stöðvum á leiðinni" (`messages/is.json:977`), which is misleading when there are no messages.

Recommended fix:

- Either hide the route-scoped Safnpúls when there are no messages, or
- keep it visible but show a clear empty state inside the drawer and change the subtitle to something that does not claim there are new messages.

Given Stebbi's recent concern about the section taking too much space, I would lean toward: collapsed drawer appears only when at least one station on the route has messages.

### 3. Low: stale component comment contradicts current behavior

`components/weather/VedurstofanRoutePulseSummary.tsx:31-34` still says the component is "Hidden when no messages exist", but v351 intentionally removed that behavior. If Claude Code keeps always-visible route Safnpúls, update the comment. If Claude Code restores hide-when-empty, the comment can stay.

## Confirmed

- Focused weather route tests pass.
- Type-check passes.
- The Öxi relabel strategy remains in place: `lib/weather/google.server.ts:663-674` labels non-Öxi base alternatives as `CURATED_AVOID_OXI` when at least one base route has `oxi-axarvegur-939`.
- Curated Öxi routes are still validated and suppressed if they still include the same caution at `lib/weather/google.server.ts:491-499`.

## Commands Run

- `npm run test:run -- lib/__tests__/weather-google.test.ts lib/__tests__/weather-route-cautions.test.ts`
  - Result: pass, 123/123 tests
- `npm run type-check`
  - Result: pass

No dev server was started. No SQL, migration, commit, push, deploy, Vercel, Supabase, or production action was run.

## Recommended Next Step

Before release, ask Claude Code to clarify/align the Veðurpúls visibility contract:

1. Public station card with no messages: hide or show?
2. Route-scoped Safnpúls with no messages anywhere: hide, show empty state, or always show collapsed?

After that decision, make the code match it exactly and update comments/text accordingly.

Öxi can continue to localhost QA, but it remains unverified until Stebbi checks the real Google route on the map/network response.

## Localhost checks for Stebbi

1. Public/incognito, open `/vedrid`, calculate a route with Veðurstofustations.
2. Find a Veðurstofustation with no pulse messages.
   - Expected if latest visible request still stands: no Veðurpúls block appears on that station card.
3. Find a Veðurstofustation with existing messages.
   - Expected: preview messages and CTA are visible.
4. Log in and open a station with no pulse messages.
   - Expected: compact composer is visible.
5. Calculate a route where no station on the route has pulse messages.
   - Expected needs Stebbi decision: route Safnpúls should either be hidden or show a truthful empty state.
6. Test `Höfn -> Egilsstaðir`.
   - Expected: Öxi route is marked "Varasamt með eftirvagna".
   - Expected: an alternative "Til að sleppa við Öxi" appears if Google/curated routing provides one.
7. Visually inspect that the "Til að sleppa við Öxi" option actually goes around the fjords and does not use Road 939.

Do not change Vercel env, run migrations, push, or deploy as part of these checks unless Stebbi explicitly starts a release step.

## Óvissa / þarf að staðfesta

- I do not know whether Stebbi gave Claude Code a newer out-of-band instruction to show public-empty Veðurpúls. If yes, finding 1 becomes a documentation/product-decision note rather than a code issue.
- I did not inspect live Google Routes network responses, so Öxi remains dependent on localhost/browser verification.
- I did not run the full test suite.
