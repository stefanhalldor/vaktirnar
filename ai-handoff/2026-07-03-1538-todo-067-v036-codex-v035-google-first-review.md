# TODO #67 Vedrid - Codex review of v035 Google-first plan

Created: 2026-07-03 15:38
Timezone: Atlantic/Reykjavik
From: Codex
To: Stebbi og Claude Code
Status: Review only. Engar kóðabreytingar, SQL, env breytingar, commit, push, deploy eða production breytingar gerðar.

Reviewed:
- `ai-handoff/2026-07-03-1535-todo-067-v035-claude-google-first-plan.md`
- `ai-handoff/2026-07-03-1520-todo-067-v034-codex-v033-bakeoff-review.md`
- `Design.md` mobile/form/loading guidance
- `package.json`
- Official Google Maps JavaScript Place Autocomplete Data API docs, session pricing docs, pricing docs

## Findings

### Major 1 - Places API New path is mostly right, but the sample still has a wrong `fetchFields`/billing detail

Refs: v035 lines 77-115, 240-258, 345-351.

v035 fixes the v033 problem by choosing one path: Places API New via Maps JavaScript Place Autocomplete Data API. That is the right direction.

But the concrete sample should not pass `sessionToken` into `place.fetchFields()`. Google documents the token as part of the autocomplete request; after `placePrediction.toPlace()`, the first `fetchFields()` call automatically includes the session token and concludes the session. The documented call is:

```ts
await place.fetchFields({
  fields: ['displayName', 'formattedAddress', 'location'],
})
```

So v035 lines 99-102 should be corrected before implementation, otherwise Claude Code may write TypeScript that fails against the actual API or silently misunderstands session termination.

Also line 114 says autocomplete keystrokes + Place Details are "eitt billing event". That is too strong. The safer statement is: session tokens group the autocomplete and selection phase for billing; abandoned sessions are charged as autocomplete requests; selected places terminate the session via `fetchFields()` and may involve the relevant Place Details/Data SKU depending on fields/product. Do not build cost assumptions around "one billing event".

Required correction:

- Use `google.maps.importLibrary('places')` or the loader to get `AutocompleteSessionToken` and `AutocompleteSuggestion`.
- Put `sessionToken` only on the `AutocompleteRequest`.
- Do not pass `sessionToken` to `fetchFields()`.
- Keep fields minimal: likely `id`, `displayName`, `formattedAddress`, `location`, but verify whether `id` must be fetched or is already present from the prediction/place.
- Update billing wording to conservative language.

### Medium 1 - Autocomplete should be constrained/bias to Iceland from day one

Refs: v035 lines 93-95, 240-243, 347-350.

The current autocomplete request only sends `{ input, sessionToken }`. That means Google can return global results, which is worse UX for "Suðurgata", "Mosó", "Atlantis", etc., and wastes calls/clicks.

Add this to the Phase 2A2 spec:

- `includedRegionCodes: ['is']` to restrict to Iceland where appropriate.
- `region: 'is'` and likely `language: 'is'` for ranking/display.
- Optional `locationBias` or `locationRestriction` around Iceland if docs/API behavior supports the desired UX.
- Explicit tests for Icelandic and ASCII inputs: `Suðurgata`, `Sudurgata`, `Húsavík`, `Husavik`, `Grafarholtið`, `Moso`.

This is not just polish. It directly affects whether the map confirmation gives comfort or feels random.

### Medium 2 - `@googlemaps/js-api-loader` is not in `package.json`

Refs: v035 lines 83-88; `package.json`.

v035 uses `new Loader(...)`, but the repo does not currently have `@googlemaps/js-api-loader`.

Claude Code should choose one of these explicitly before Phase 2A2:

- Avoid the dependency and use the official script/bootstrap + `google.maps.importLibrary('places')` approach.
- Or add `@googlemaps/js-api-loader` as a dependency, with explicit execution permission from Stebbi because it changes `package.json` and `package-lock.json`.

Do not let this be an implicit dependency addition hidden inside "implement Phase 2A2".

### Medium 3 - Production-wide env provider is okay only after feature-gated/internal testing

Refs: v035 lines 18, 170-176, 289-308.

Skipping the bake-off removes the biggest production-toggle risk. Still, `WEATHER_MAP_PROVIDER=google` in Vercel is a production-affecting setting if set on production.

Plan should say:

- Phase 2A2 is first tested on localhost and/or Vercel Preview.
- Production env changes require explicit Stebbi approval.
- Until route/map is verified, the UI/API remains behind the existing weather/feature gate or internal access.
- This is not the final admin toggle Stebbi asked for; it is a Phase 2A implementation switch. A real admin setting remains a separate Supabase/RLS/security-reviewed task if still wanted.

### Medium 4 - 600 km route cap may reject valid Iceland routes

Refs: v035 lines 120-134, 266-273, 335-339.

`~600 km` sounds safe for billing, but it is low for real Iceland travel questions. Reykjavík to Egilsstaðir/Seyðisfjörður or long camper routes can cross that line depending on route. If users ask with caravan/camper, long domestic trips are exactly plausible.

Better:

- Cap by provider call count and sampling count first.
- Allow a higher domestic cap, e.g. 900-1000 km, or return a clear "leiðin er of löng fyrir þessa útgáfu" message with no fake assessment.
- Make the sample spacing adaptive so the 80-point cap still holds.
- Add tests for a valid long Iceland route and an actually invalid/too-long route.

### Medium 5 - Provider-derived data storage/logging rule should be explicit

Refs: v035 lines 104-116, 223-229, 240-249.

The plan correctly says client-sent lat/lon is user input and validates it. It should also say what is not stored:

- Do not persist raw Google candidate lists, raw Places responses, raw Geocoding responses or raw Routes responses.
- Do not write unknown Google-derived places back into `places.ts`.
- Do not use provider output as cross-user/global cache unless ToS has been reviewed for that exact field and use case.
- Logs should avoid full provider payloads and avoid leaking exact user route/place selections unnecessarily.

This matters because map confirmation naturally tempts us to "learn" unknown places. We already decided curated `places.ts` is safe; provider-derived automatic growth is not part of this phase.

### Minor 1 - Static Maps implementation boundary is slightly contradictory

Refs: v035 lines 42, 67, 225-229.

Line 42 says the client builds the Static Maps URL. Lines 67 and 225-229 put `staticMapUrl()` in the server/provider adapter. Either can work, but the contract should be clear:

- If server builds the URL, it must use only the browser/static key and return a URL that is safe to expose.
- If client builds it, keep provider-specific URL building out of server modules or share a safe builder.

I would keep URL generation server-side for consistency, but name it as "returns a browser-safe Static Maps URL using the browser key." The key rule matters more than where the string is assembled.

### Minor 2 - Phase 2A2 should test request race/debounce behavior

Refs: v035 lines 93-95, 251-258, 326-333.

Autocomplete on every debounced keystroke needs:

- minimum input length, likely 2-3 chars,
- debounce,
- abort/stale-response guard so old responses cannot overwrite newer input,
- no request when input is empty,
- disabled/loading state that does not resize controls.

Google's own examples guard against stale responses with request IDs. This is worth adding to tests because it affects billing and mobile UX.

## Niðurstaða

Google-first er skynsamleg ákvörðun núna. Ég myndi samþykkja stefnuna, með smá leiðréttingu áður en Claude Code byrjar Phase 2A2:

1. Leiðrétta Places API New sample: token fer á autocomplete request, ekki `fetchFields()`.
2. Leiðrétta billing orðalagið.
3. Bæta Iceland restriction/bias í autocomplete.
4. Gera dependency ákvörðun explicit.
5. Gera production/env og data-storage mörk explicit.

Phase 2A1 virðist execution-ready þegar Stebbi gefur framkvæmdarleyfi og listi yfir golfvelli/ferðamannastaði liggur fyrir. Phase 2A2 þarf þessar planleiðréttingar og Google lykla/quotas fyrst.

## Suggested message to Claude Code

```text
Rýndu v036 áður en þú framkvæmir v035.

Ég samþykki Google-first stefnuna, en lagaðu plantextann fyrir Phase 2A2:
1. Places API New sample: sessionToken fer á AutocompleteRequest, ekki í place.fetchFields(). fetchFields() notar token sjálfkrafa frá toPlace() og lokar session.
2. Ekki segja "eitt billing event"; orðaðu billing varlega og byggðu á quotas.
3. Bættu Iceland restriction/bias við autocomplete: includedRegionCodes ['is'], region/language is, og tests fyrir íslenska stafi + ASCII.
4. Taktu ákvörðun um @googlemaps/js-api-loader: annaðhvort engin dependency og nota importLibrary/bootstrap, eða bæta pakkanum við með sér framkvæmdarleyfi.
5. Production-wide WEATHER_MAP_PROVIDER er ekki admin UI og ekki prófunarleið. Prófa fyrst local/preview/internal gate; production env þarf sér samþykki.
6. Endurskoðaðu 600 km route cap; það getur útilokað raunverulegar Íslandsleiðir.
7. Skrifaðu skýra reglu: ekki vista raw Google candidates/routes/geocoding í global cache eða places.ts.
```

## Localhost checks for Stebbi

Þetta er plan-review, svo ekkert nýtt er tilbúið til localhost prófunar enn. Þegar Claude Code skilar næsta plan eða implementation:

1. Phase 2A1:
   - Prófa golfspurningu um Grafarholt.
   - Prófa óþekktan golfvöll.
   - Prófa grill regression með Mosó.
   - Prófa route intent og staðfesta að ekkert fake route-weather komi áður en provider er til.

2. Phase 2A2:
   - DevTools Network: `GOOGLE_MAPS_SERVER_KEY` má aldrei sjást.
   - Autocomplete á `Suðurgata`, `Sudurgata`, `Húsavík`, `Husavik`, `Mosó`, `Moso` á að skila Íslandi fremst eða skýrum candidate lista.
   - Autocomplete má ekki skjóta requestum við tómt input og má ekki overwrite-a nýrri leit með gömlu response.
   - Known `places.ts` staðir mega ekki kalla Geocoding API.
   - Static Maps URL má innihalda browser key, ekki server key.
   - Mobile 360/390/460 px: 16px input, enginn horizontal overflow, map ratio stöðugt, buttons reachable með keyboard opið og lokað.
   - Billing/quota dashboard sýnir eðlilegar tölur eftir handvirk próf.

Ekki prófa high-volume loops eða breyta production env/secrets án sér samþykkis.

## Sources checked

- Google Place Autocomplete Data API: https://developers.google.com/maps/documentation/javascript/place-autocomplete-data
- Google Autocomplete Data reference: https://developers.google.com/maps/documentation/javascript/reference/autocomplete-data
- Google Autocomplete/session pricing: https://developers.google.com/maps/documentation/javascript/session-pricing
- Google Maps Platform pricing: https://developers.google.com/maps/billing-and-pricing/pricing
