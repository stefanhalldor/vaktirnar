# TODO 086 v350 - Codex review of v349 Claude prerelease

Created: 2026-07-16 17:57  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Reviewed handoff: `2026-07-16-1742-todo-086-v349-claude-v348-done-prerelease.md`

## Findings

### 1. Medium: v349 reintroduces the public-empty Veðurpúls component

`components/weather/VedurstofanPulseInline.tsx:106` always renders the inline pulse wrapper, and `ChatPreviewList` then renders the empty label once loaded at `components/chat/ChatPreviewList.tsx:26-29`. For a public user on a station with no messages, this shows:

> Nýjast af staðnum frá notendum Teskeið.is  
> Engar umferðarfréttir ennþá...

That is exactly the production issue Stebbi had just reported should be hidden entirely for public users when the station has no messages. v349 says this was "restored", but it restores an older desired state, not the latest product decision.

Recommended fix:

- Keep the component visible for authenticated users who can post, even if empty.
- Keep it visible for public users when preview messages exist.
- Hide it for public users when preview has loaded, there are zero messages, and `postingAccess === 'needs-login'`.
- Also consider hiding empty state for `postingAccess === 'denied'` unless there is a strong product reason to show it.

Suggested condition shape:

```ts
const canPost = postingAccess === 'allowed'
const shouldHideEmptyReadOnly =
  previewLoaded &&
  messages.length === 0 &&
  (postingAccess === 'needs-login' || postingAccess === 'denied')

if (shouldHideEmptyReadOnly) return null
```

Do not hide while `postingAccess === 'unknown'` unless the UI intentionally wants no loading shell. The important point is to decide after preview load/access check, not from initial empty state.

### 2. Low / follow-up: inline Veðurpúls preview is still polling/event-based, not realtime

`components/chat/useChatPreview.ts:31-44` fetches on mount, polls every 30 seconds, and refreshes on the local `teskeid:pulse:refresh` browser event. That is useful, but it is not the shared chat-core realtime subscription Stebbi has asked us to keep as the default direction.

This does not block v349 if the immediate goal is fixing public visibility and Öxi labels, but it should stay explicit in the next handoff: the reusable chat core should own realtime behavior by default, and Veðurpúls should consume that rather than inventing separate polling semantics per surface.

## Confirmed

- `lib/weather/google.server.ts:663-674` now relabels non-Öxi base alternatives as `CURATED_AVOID_OXI` when another base route carries `oxi-axarvegur-939`. This matches the desired UI outcome when Google already returns both "Um Öxi" and "Til að sleppa við Öxi".
- `lib/weather/google.server.ts:474-499` still validates curated caution-triggered routes and suppresses the curated route if it still has the same caution. Good.
- `lib/weather/routeCautions.ts:163-174` widens the Öxi detection radius to 10 km, but the source is still explicitly unverified. That is acceptable as a prerelease experiment, but should not be treated as proven without localhost/API visual verification.

## Commands Run

- `npm run test:run -- lib/__tests__/weather-google.test.ts lib/__tests__/weather-route-cautions.test.ts`
  - Result: pass, 123/123 tests
- `npm run type-check`
  - Result: pass

No dev server was started. No SQL, migration, commit, push, deploy, Vercel, or Supabase action was run.

## Recommended Next Step

Ask Claude Code to make the public-empty Veðurpúls hide rule match the latest product decision before release. After that, verify locally:

- public user + station with no messages: no Veðurpúls block
- public user + station with messages: preview + CTA link
- authenticated user + station with no messages: composer visible
- authenticated user + station with messages: preview + composer

For Öxi, keep the code but require browser/network verification before considering it done.

## Localhost checks for Stebbi

1. Open `/vedrid` as public/incognito and calculate a route where Veðurstofustations appear.
2. Find a Veðurstofustation with no pulse messages.
   - Expected: no "Nýjast af staðnum frá notendum Teskeið.is" component at all.
3. Find a Veðurstofustation with existing pulse messages.
   - Expected: latest messages are visible and the CTA says "Sjá fleiri skilaboð eða segja frá aðstæðum".
4. Log in and repeat on an empty station.
   - Expected: compact composer is visible so the user can write immediately.
5. Test `Höfn -> Egilsstaðir`.
   - Expected: the route over Öxi is marked "Varasamt með eftirvagna".
   - Expected: an alternative labelled "Til að sleppa við Öxi" appears if Google/curated routing can produce one.
6. Test the coastal alternative visually.
   - Expected: it should not receive the Öxi caution unless it actually passes near Road 939.

Do not test by changing Vercel env, running migrations, or pushing/deploying unless explicitly doing a release step.

## Óvissa / þarf að staðfesta

- I did not inspect live Google Routes responses. The Öxi coordinate/radius fix is still dependent on real polyline behavior.
- I did not run full test suite or browser tests.
