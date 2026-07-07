# todo-067 v084 - Codex review of v083, Nominatim/provider risk

Created: 2026-07-06 15:22  
Updated: 2026-07-06 15:30  
Timezone: Atlantic/Reykjavik  
Review target: `2026-07-06-1530-todo-067-v083-claude-v082-done`  
Reviewer: Codex  
Relevant TODO: ongoing `todo-067` Ferðalagið weather work, plus #67 follow-up context

## Findings

### P1 - Public Nominatim is not safe to ship as a direct browser dependency yet

`lib/weather/reverseGeocode.client.ts:19-27` calls `https://nominatim.openstreetmap.org/reverse` directly from the browser. That is a new third-party dependency for a user-facing trip/weather flow.

The official OSMF Nominatim usage policy says the public service is limited-capacity, with a strict maximum of 1 request per second, application identification, attribution, caching, and the ability for apps to switch service at OSMF request. It also says repeated/systematic requests and grid-style reverse lookups are restricted or forbidden. Source: https://operations.osmfoundation.org/policies/nominatim/

Current implementation does not meet that bar for production:

- No app-wide rate limiter. A few users clicking points can exceed 1 request/second.
- Cache is in-memory per browser session only, not shared across users or deploys.
- Endpoint is hard-coded in a client file, not switchable without a code change/deploy.
- It sends selected forecast coordinates to a third-party service from the user's browser.
- There is no feature flag or provider config to disable it quickly if the service blocks us or asks us to stop.
- The comment says `Rate limit: 1 request/sec`, but the code does not enforce it.

Recommendation: do not ship direct public Nominatim browser calls as the production solution. For localhost/prototype it is useful, but before broader rollout it should either be:

1. disabled behind an env/provider flag, or
2. moved behind our BFF/server route with server-side cache, app-wide throttle, timeout, provider switch, privacy note and clear attribution, or
3. replaced by an already-approved maps/geocoder provider with known billing and terms.

### P1 - Browser `User-Agent` header is not a reliable way to satisfy Nominatim identification

`lib/weather/reverseGeocode.client.ts:25-27` attempts to set:

```ts
headers: { 'User-Agent': 'teskeid.is/1.0 weather-forecast-auditability' }
```

This is unreliable from browser code. Browser fetches cannot be trusted to send a custom `User-Agent`; it may be ignored, forbidden, or trigger CORS/preflight behavior. If we need an identifying `User-Agent`, that is another reason to make this a server-side/BFF call. A normal browser `Referer` may identify the site, but localhost and production behavior still need explicit QA.

### P1 - Selected point label can race and show the wrong place

`components/weather/TravelAuditMap.tsx:305-326` starts an async `resolvePlaceLabel(...)` whenever the selected point changes, but it does not cancel or guard stale responses.

If the user taps point A, then quickly taps point B, the request for A can resolve after B is selected and overwrite `placeLabel` for B. That means the card can show a plausible but wrong place name. In a feature explicitly built for trust, this is a serious correctness issue.

Fix with a cancellation flag or request id inside the effect:

- set `let cancelled = false`
- only call `setPlaceLabel` / `setPlaceLoading(false)` if not cancelled
- return cleanup that sets `cancelled = true`

Also consider caching in-flight promises by coordinate so duplicate rapid clicks do not create duplicate requests.

### P2 - Labels are only fetched when route point and forecast point differ

`components/weather/TravelAuditMap.tsx:316-320` exits early when `!summary.hasSeparateForecastPoint`.

That means most normal route points may still show only coordinates or only `Spápunktur met.no`, even though Stebbi's core complaint was that arbitrary coordinate-based forecast pages feel off. Human labels are useful even when the route coordinate and forecast coordinate are the same or close.

Recommendation:

- For origin/destination, use the known place names.
- For all selected non-origin/destination points, allow a lazy label lookup by forecast coordinate.
- Keep `hasSeparateForecastPoint` only for whether to show the extra explanation/connector, not for whether a label can be resolved.

### P2 - Place-name specificity may be too generic

V083 uses Nominatim `zoom=10` and then prioritizes address fields like `municipality`/`county` before `data.name`.

For the exact issue Stebbi showed, Yr displayed `Lokufjall`. With `zoom=10`, Nominatim may return a municipality-level label instead, e.g. something like `Kjósarhreppur`, which is less reassuring than a natural feature or road/area name.

Do not overfit, but test with:

- `Ásgarðslaug -> Akranes`
- `Garðabær -> Grímsnes`
- `Reykjavík -> Selfoss`
- a mountain/coastal route where the forecast point is visibly off-road

If names are too generic, try a more specific zoom or resolver priority, but keep the UI approximate: `nálægt {place}`.

### P2 - Attribution and privacy need a product-level decision

The inline `© OpenStreetMap contributors` in `components/weather/TravelAuditMap.tsx:398-399` is a start, but this is not just a visual detail.

The app would now send route-derived coordinates to OpenStreetMap/Nominatim. That is not Supabase/private data, but trip locations can still be sensitive. Before production, the handoff should explicitly say:

- what data is sent
- to whom
- when it is sent
- whether it is disabled in production by default
- where attribution appears

### P2 - Missing regression coverage for the fixes that motivated V083

V083 says type-check, tests and build passed, but there does not appear to be a targeted test for:

- no raw `teskeid.vedrid...` keys when ICU variables are used
- `resolvePlaceLabel` cache behavior
- stale async lookup not updating the wrong selected point
- no fetch for origin/destination
- fallback when reverse lookup fails

Not every UI detail needs a big test, but the raw-key regression already happened once. Add at least a small unit test around helper/resolver behavior or a component test if the repo has nearby patterns.

## Stebbi additions before sending V084 to Claude Code

Stebbi added several product requirements after V084 was first written. These should be included in the next Claude Code pass, but not necessarily all implemented as one large unreviewable chunk. The safe sequence is:

1. quick correctness/UI fixes that are small and low-risk,
2. data-backed next-caution and departure heatmap,
3. assumptions edit flow,
4. Google Maps-like origin/destination selection redesign.

### Gust display rule

Only show gusts (`Hviður`) when the gust number is actually higher than wind speed.

Practical rule:

- compare raw values before formatting
- show gust if `gustMs > windMs`
- if rounding could make values look equal, avoid showing a misleading gust line
- if gust is hidden, do not show `Hviður: 3.3 m/s` next to `Vindur: 3.3 m/s`

When gusts are present, add a subtle visual indication. This must not rely on color alone.

Possible UI:

- small `Hviður` chip in point details when `gustMs > windMs`
- a small wind/gust icon or marker accent on map points where gusts are the decisive issue
- in the future departure heatmap, a small glyph/stripe on a time slot when gust is the reason

### "Varasamt að leggja af stað" must be backed by data

If the UI says it becomes risky to depart at a specific time, the user must be able to see why.

The `nextCaution` line cannot stand alone. It should expose or link to:

- departure time being evaluated
- expected arrival/time on route for the decisive point
- point on the route
- met.no forecast point
- weather metric that triggered caution
- value and threshold, e.g. `Úrkoma 1.4 mm/klst yfir varúðarmörkum 1.0 mm/klst`
- whether the issue is wind, gust, precipitation or no-data/coverage

If this data is not available, the UI should not make a precise caution claim. It should use an honest weaker copy, e.g. `Við sjáum merki um að veðrið gæti versnað síðar, en þurfum betri gögn til að sýna nákvæma ástæðu.`

### Departure time heatmap

Stebbi wants a time heatmap/timeline showing when it is best to depart.

Recommended concept:

- horizontal or grid timeline of possible departure slots, e.g. hourly slots for the relevant forecast horizon
- each slot has deterministic status: green/yellow/red/gray-no-data
- each slot is clickable/tappable
- selected slot shows reason details: worst point, time, wind, gust, precipitation, threshold and link to point on map
- the "best" slot is visually marked, but the user can inspect other slots
- red/yellow slots must always have an explainable reason

This should be a first-class explanation surface, not decorative color. It solves the trust problem better than a single sentence like `Næst verður varasamt um kl. 18:00`.

Important implementation note:

- do not invent new AI reasoning for this
- use the same deterministic weather evaluation per departure slot
- reuse route/weather point data where possible
- no-data slots should be visually distinct from safe/unsafe slots

### Result screen actions: "Breyta forsendum"

The final screen should not only have `Byrja aftur`.

Add:

- `Breyta forsendum`
- `Byrja aftur`

Desired flow:

1. User taps `Breyta forsendum`.
2. User sees a summary screen with all current assumptions:
   - from
   - to
   - departure / latest arrival / latest home if present
   - trailer
   - any avoid-driving-time preference later from #67
3. Each assumption can be edited.
4. After saving one edited assumption, user returns to the assumptions summary.
5. From the summary, user can tap `Reikna aftur`.

This is more app-like and avoids forcing users to restart the whole flow for one small correction.

### Result layout reorder

Move this line:

`Reiknað úr veðurspá og leið, ekki giskað af gervigreind.`

to below the map.

Also move the detailed point list / route point audit details under the `Hvernig er þetta metið?` collapse drawer. The main result screen should not become a pile of audit cards. The map and selected point can remain visible; the full point list belongs inside the explanation/audit drawer.

### Origin/destination selection needs a bigger UX pass

The static image on the origin/destination confirmation steps still feels weak. Stebbi wants a more interactive "Google Maps app" feeling earlier in the flow.

Direction to explore:

- origin and destination on the same screen
- interactive map visible during selection, not only after the result
- user can see and confirm both points in one context
- route preview appears as soon as both points are known
- fields/pins feel closer to Google Maps route selection than two disconnected static images
- if there are multiple possible places, the map helps disambiguate before route calculation

This is likely a separate UX/design pass, not a quick patch inside the Nominatim risk fix. Claude Code should either produce a focused implementation plan for this or explicitly defer it to a new handoff so it does not get half-built.

## Recommended next step

Do not ask Claude Code to keep expanding the Nominatim implementation yet.

Ask Claude Code for a tight fix pass:

1. Keep the ICU interpolation fixes.
2. Fix the async stale-response race.
3. Decide whether Nominatim is disabled by default or moved behind a provider/BFF plan.
4. If keeping it for localhost only, gate it clearly with env/config and fallback cleanly to `Spápunktur met.no`.
5. Fetch labels for all selected non-origin/destination points, not only separate forecast points.
6. Add the small gust display rule if scoped and low-risk.
7. Move deterministic explainer below the map and move the full point list under `Hvernig er þetta metið?`.
8. Add at least minimal tests for the regression-prone parts.
9. For heatmap, assumptions editing and interactive origin/destination selection, Claude Code should either implement only if the diff stays small and reviewable, or create the next focused plan/handoff.

## Suggested message for Claude Code

```text
V083 er ekki alveg tilbúið fyrir shipping. ICU interpolation fixið er gott, en Nominatim þarf að þrengja áður en þetta verður production-ready.

Gerðu næsta pass svona:

1. Haltu ICU fixunum:
   - nota tf('key', { var }) í stað tf('key').replace(...)
   - staðfesta að engir raw teskeid.vedrid lyklar sjáist eftir dev restart + hard refresh

2. Lagaðu race condition í PointDetailsPanel:
   - núverandi resolvePlaceLabel promise getur skilað seint og sett rangt placeLabel eftir að notandi hefur valið annan punkt
   - bættu við cancellation/request-id guard í useEffect
   - helst cache-a in-flight promise per coordinate líka

3. Ekki nota public Nominatim direct-from-browser sem production dependency án gating/plans:
   - official policy: https://operations.osmfoundation.org/policies/nominatim/
   - það vantar app-wide throttle, shared cache, provider switch/kill switch og privacy/attribution ákvörðun
   - custom User-Agent úr browser er ekki örugg leið til að auðkenna appið

4. Fyrir næsta pass skaltu annaðhvort:
   A) setja Nominatim label lookup bakvið env/provider flag og hafa það disabled by default nema á localhost, eða
   B) gera plan fyrir server/BFF reverse-geocode endpoint með cache, app-wide throttle, timeout og provider switch, án þess að framkvæma það strax.

5. Label lookup ætti ekki að vera bundið við hasSeparateForecastPoint:
   - origin/destination nota þekkt nöfn
   - allir selected non-origin/destination punktar mega fá lazy label lookup fyrir forecastLat/forecastLon
   - hasSeparateForecastPoint á bara að stýra extra hnitaskýringu/connector, ekki því hvort heiti sé sótt

6. Prófaðu actual label quality:
   - Ásgarðslaug -> Akranes
   - Garðabær -> Grímsnes
   - Reykjavík -> Selfoss
   - ef zoom=10 skilar of generic sveitarfélagi, prófaðu betri resolver priority eða zoom, en haltu approximate wording: "nálægt {place}"

7. Bættu við targeted regression coverage þar sem praktískt:
   - i18n keys leka ekki þegar ICU variables eru notaðar
   - reverse lookup fallback þegar fetch bilar
   - stale lookup uppfærir ekki rangt selected point
   - origin/destination kalla ekki í geocoder

8. Bættu við hviðu-reglu:
   - birta "Hviður" aðeins þegar gustMs > windMs
   - ekki birta "Hviður: 3.3 m/s" þegar vindur er líka 3.3 m/s
   - bæta við litlu visual indication þegar hviður eru raunverulega til staðar, en ekki treysta eingöngu á lit

9. Ef UI segir "Næst verður varasamt að leggja af stað um kl. X", þarf notandi að geta séð gögnin:
   - hvaða punktur á leiðinni
   - hvaða met.no spápunktur
   - hvaða tími á leiðinni
   - hvaða mæligildi olli varúð
   - gildi + threshold, t.d. úrkoma/vindur/hviður
   Ef þessi gögn eru ekki til, má ekki birta of nákvæma fullyrðingu.

10. Settu departure heatmap/timeline í næsta plan eða implementation ef scope helst lítið:
   - hourly departure slots
   - grænt/gult/rautt/no-data
   - clickable slot sýnir ástæðu og versta punkt
   - "besti gluggi" er merktur
   - allt byggt á deterministic mati, ekki AI ágiskun

11. Lokaskjár:
   - bæta við "Breyta forsendum" við hlið "Byrja aftur"
   - "Breyta forsendum" fer á summary skjá með öllum forsendum
   - notandi getur edit-að eina forsendu, kemur aftur á summary, og getur svo ýtt á "Reikna aftur"

12. Layout:
   - færa "Reiknað úr veðurspá og leið, ekki giskað af gervigreind." niður fyrir kortið
   - færa fullan punktalista / audit details undir "Hvernig er þetta metið?" collapse skúffuna
   - map + selected point card mega vera sýnileg á aðalskjá

13. Frá/til UX:
   - static image á staðfestingu er ekki nógu gott
   - gerðu annaðhvort focused plan eða sér handoff fyrir Google Maps-like origin/destination selection
   - markmið: frá og til á sama skjá, interactive map strax, route preview þegar báðir punktar eru þekktir
   - ekki hálfbyggja þetta í sama diffi ef það verður stórt

14. Í handoffi skaltu taka sérstaklega fram:
   - hvort Nominatim er enabled eða disabled by default
   - hvaða gögn eru send til Nominatim ef enabled
   - hvort þetta krefst privacy/product ákvörðunar fyrir production
   - hvort appið getur slökkt á þessu án deploys
```

## Localhost checks for Stebbi

After Claude Code's next pass:

1. Restart dev server after message changes and hard refresh.
2. Open `/auth-mvp/vedrid`.
3. Confirm no raw `teskeid.vedrid...` keys are visible.
4. Test `Ásgarðslaug -> Akranes`.
5. Tap points quickly: point 3, then point 8, then point 12.
6. Confirm the place label never updates to a name from a previously selected point.
7. Confirm origin and destination use known names and do not need external lookup.
8. Confirm a middle point can show a human label even if the route point and forecast point are close.
9. If Nominatim is enabled, open Network tab and verify:
   - requests are not fired on every render
   - repeated clicks on same/nearby point use cache
   - there is no burst of several requests in a second
10. If Nominatim is disabled, confirm fallback text still looks intentional: `Spápunktur met.no` plus coordinate audit lines.
11. Confirm mobile 360-430px does not overflow when a long place name appears.
12. Confirm gusts are hidden when gust equals wind speed, and visible only when gust is higher than wind.
13. Find or simulate a point where gust is higher than wind. Confirm there is a clear visual indication that gusts matter.
14. If the UI says a future departure time is risky, click/tap it or its explanation and confirm the exact reason is visible: point, time, metric, value and threshold.
15. If a heatmap/timeline is implemented, click a green, yellow, red and no-data slot and confirm each state explains itself.
16. Confirm the deterministic explainer appears below the map.
17. Confirm the full point list/details are inside `Hvernig er þetta metið?`, not cluttering the main result by default.
18. Confirm final result screen has both `Breyta forsendum` and `Byrja aftur`.
19. Confirm `Breyta forsendum` returns to a summary of assumptions and `Reikna aftur` recomputes with edited assumptions.
20. Do not loosen Google key restrictions, enable new provider billing, or add production third-party data sharing without a separate approval.

## External policy source checked

- OSMF Nominatim Usage Policy: https://operations.osmfoundation.org/policies/nominatim/

## Uncertainty / needs confirmation

- I did not run the app locally or re-run the full test suite in this review.
- I did not verify whether browser CORS currently allows the custom `User-Agent` header against Nominatim. Treat it as unreliable from client code.
- It may be acceptable to use Nominatim for short localhost experiments, but production use needs an explicit provider/policy decision.
