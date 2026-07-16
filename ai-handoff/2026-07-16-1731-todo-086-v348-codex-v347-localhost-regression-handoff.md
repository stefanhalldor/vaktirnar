# TODO 086 v348 - Codex handoff: Oxi not visible and public pulse missing

Created: 2026-07-16 17:31
Timezone: Atlantic/Reykjavik
Author: Codex

Related handoffs:
- `2026-07-16-1724-todo-086-v346-claude-v345-done-prerelease.md`
- `2026-07-16-1726-todo-086-v347-codex-v346-prerelease-review.md`

## Stebbi feedback

Stebbi tested after v346/v347 and reports:

1. `Öxi` is still not visible.
2. As a public user, Stebbi no longer sees anything about `Veðurpúls` anywhere.

This needs investigation before release. Do not guess the fix. First confirm which layer is dropping the data/UI.

## Important workflow note

This is not a request to deploy, push, commit, run SQL, or change Vercel/env.

If Stebbi sends this to Claude Code with `Workflow`, Claude Code may implement the minimal code fix after doing the critical review. Still no commit/push/deploy/migration.

## Likely issue A: Oxi is not visible

There are three plausible causes.

### A1. Oxi caution matcher misses the real Google route geometry

Current `oxi-axarvegur-939` detection is a single approximate point/radius in `lib/weather/routeCautions.ts`.

If the real Google polyline for `Höfn -> Egilsstaðir` does not pass within that radius, then:

- no `oxi-axarvegur-939` caution appears
- no `CURATED_AVOID_OXI` route is requested
- no Oxi label/text appears in route selection

This is the most likely cause if route options show no caution in API response.

### A2. Google returns a base route that avoids Oxi, so the curated route is suppressed

In `lib/weather/google.server.ts`, caution-triggered curated rules currently skip when any base route avoids the caution:

```ts
const anyBaseAvoidsCaution = baseRoutes.some(r =>
  !r.cautions?.some(c => c.id === rule.triggerCautionId)
)
if (anyBaseAvoidsCaution) continue
```

That is fine for avoiding an extra Google call, but it means `Til að sleppa við Öxi` will not appear if Google already returned a non-Oxi base alternative.

If at least one base route has `oxi-axarvegur-939`, and another base route avoids it, then product behaviour should probably be:

- keep suppressing the extra curated Google request
- but label the existing non-Oxi base route clearly as `Til að sleppa við Öxi`

This was noted as a low product follow-up in v347. Stebbi's feedback suggests it may need to be promoted.

### A3. Real route does not actually go over Oxi

If Google no longer chooses Road 939 for the test route, Oxi should not be shown. But Stebbi believes the tested route should flag Oxi, so Claude should verify using the map and API response before deciding this is expected.

## Required diagnosis for Oxi

Before changing code, inspect the `/api/teskeid/weather/travel/routes` response in localhost browser network for the route Stebbi is testing.

Check each returned route option:

- `labels`
- `description`
- `cautions`
- whether any route has `oxi-axarvegur-939`
- whether any route has `CURATED_AVOID_OXI`

Then classify:

1. No base route has `oxi-axarvegur-939`  
   → fix/tune the Oxi road segment matcher. Most likely add more corridor points or use a better point on Road 939. Do not rely on a single approximate point if it misses real Google geometry.

2. Some base route has `oxi-axarvegur-939`, but another base route avoids it  
   → do not fetch an extra curated route, but label the avoiding base route as `CURATED_AVOID_OXI` or equivalent display-only label. Keep tests.

3. Curated route is fetched but suppressed because it still has `oxi-axarvegur-939`  
   → try stronger via sequence `Fáskrúðsfjörður -> Reyðarfjörður`, then validate again.

4. Route option contains expected labels/cautions in API response, but UI does not show them  
   → fix `RouteSelectionStep.tsx` rendering/mapping.

## Likely issue B: public user sees no Veðurpúls anywhere

Current single-station inline pulse behaviour in `components/weather/VedurstofanPulseInline.tsx`:

```ts
const canPost = postingAccess === 'allowed'
if (messages.length === 0 && !canPost) return null
```

This intentionally hides empty pulse for public users. That part matches earlier product direction: public should not see an empty component when there are no messages.

But Stebbi says public now sees no Veðurpúls anywhere. That can happen if:

1. preview endpoint returns `[]` everywhere, even for stations that have messages
2. public Veðurstofan cards are not rendering `VedurstofanPulseInline`
3. the station IDs used when posting do not match station IDs used in preview
4. the route-scoped summary is hidden because `route-preview` returns no station messages
5. Veðurstofan provider itself is not visible to public in that state, so there are no station cards to attach pulse to

Do not re-show empty public pulse globally just to make it visible. The intended rule is:

- Public with no messages on a station: hide the component.
- Public with messages on a station: show preview and CTA `Sjá fleiri skilaboð eða segja frá aðstæðum`.
- Authenticated with posting access: show preview and composer, even if empty.

## Required diagnosis for public pulse

In localhost browser network as public user, inspect:

1. Is `VedurstofanPulseInline` present in the rendered station card DOM?
2. Does the preview request fire?

Expected URL:

```text
/api/teskeid/weather/vedurpuls/stations/{stationId}/preview
```

3. What does it return?

Expected when messages exist:

```json
[
  { "body": "...", "authorName": "Stefán", ... }
]
```

Expected when no thread/messages exist:

```json
[]
```

4. If it returns `[]` for a station where messages should exist, verify DB target consistency:

```text
domain = weather
target_type = vedurstofan_station
target_id = stationId
```

The preview endpoint does not create threads. It only reads existing threads:

- `app/api/teskeid/weather/vedurpuls/stations/[stationId]/preview/route.ts`
- `lib/chat/repository.server.ts:getPreviewMessages`

5. Check whether the authenticated post used exactly the same `stationId` as the public preview.

## Suggested fixes depending on diagnosis

### If public preview returns messages but component is hidden

Fix `VedurstofanPulseInline` state/load logic. The component should not return null while preview is still loading if this causes a permanent hidden state.

Current return-null condition:

```ts
if (messages.length === 0 && !canPost) return null
```

Safer shape:

```ts
if (previewLoaded && messages.length === 0 && !canPost) return null
```

That alone should not change final empty-public behaviour, but prevents premature no-render while preview is loading.

### If public preview endpoint returns `[]` unexpectedly

Fix thread target mismatch or repository lookup. Do not change UI first.

### If posting access blocks authenticated users unexpectedly

Check these env/access layers:

- `TESKEID_CHAT_ENABLED=true`
- base weather shell access
- `weather-provider-vedurstofan` access or graduated provider state
- `WEATHER_PULSE_ACCESS_REQUIRED`

But this does not explain public read-only preview by itself.

### If route-scoped Safnpúls should be visible to public

`VedurstofanRoutePulseSummary` already hides itself if no messages exist:

```ts
const hasAnyMessages = stationMessages.some(s => s.messages.length > 0)
if (!hasAnyMessages) return null
```

That is okay. If messages exist and it still hides, debug `/api/teskeid/weather/vedurpuls/route-preview`.

## Tests to add or update

### Oxi

Add/adjust tests based on real bug classification:

- If matcher miss: add a test with improved corridor points that represents the real Google polyline better.
- If base-route avoids Oxi: add test that an existing non-Oxi base route gets an avoid-Oxi display label without an extra curated fetch.
- If fallback via needed: add test for suppressing first curated route and optionally trying second via sequence.

### Pulse

Add client-ish tests if current setup supports them:

- `VedurstofanPulseInline` public + loading should not permanently hide if preview later returns messages.
- public + empty preview should hide.
- public + non-empty preview should show preview and login CTA.
- authenticated allowed + empty preview should show composer.

At minimum, add targeted tests around `useChatPreview`/render logic if available.

## Localhost checks for Stebbi

### Oxi

1. Open `http://localhost:3004/vedrid`.
2. Test `Höfn -> Egilsstaðir`.
3. Confirm whether route cards show:
   - `Varasamt með eftirvagna` on the Oxi route
   - Oxi summary text
   - `Til að sleppa við Öxi` route or an existing route clearly labelled as avoiding Oxi
4. Select the avoid-Oxi route and confirm it visually avoids Road 939.
5. Repeat `Egilsstaðir -> Höfn`.

### Public Veðurpúls

1. As authenticated user, post a message on a known station card, e.g. the station visible on the selected route.
2. Copy the station id if visible, or use the full pulse URL `/auth-mvp/vedrid/puls/stod/{stationId}`.
3. Log out / open incognito.
4. Open the same route or station context.
5. Public user should see:
   - latest message preview for stations with messages
   - CTA `Sjá fleiri skilaboð eða segja frá aðstæðum`
6. Public user should not see empty pulse component for stations with no messages.
7. Authenticated user should still see composer even if station has no messages.

## Recommendation

Do not release the Oxi changes until the real Google route response is checked in browser network and the UI behaviour matches the actual response.

For Veðurpúls, do not simply revert the empty-public hide rule. The correct fix is to preserve:

- hide empty public pulse
- show non-empty public pulse
- show authenticated composer

The first concrete thing Claude should do is inspect the API responses and classify the bug using the branches above.
