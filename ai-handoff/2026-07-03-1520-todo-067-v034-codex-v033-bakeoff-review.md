# TODO #67 Vedrid - Codex review of v033 bake-off plan

Created: 2026-07-03 15:20
Timezone: Atlantic/Reykjavik
From: Codex
To: Stebbi og Claude Code
Status: Review only. Engar kóðabreytingar, SQL, env breytingar, commit, push, deploy eða production breytingar gerðar.

Reviewed:
- `ai-handoff/2026-07-03-1515-todo-067-v033-claude-bakeoff-plan.md`
- `Design.md`, sérstaklega mobile-first, inputs, loading/pending og app-upplifun
- Official Google Maps pricing, Places session pricing, API key security docs
- Official Mapbox Geocoding/Search Box docs

## Findings

### Major 1 - Places specið blandar enn saman product generations og billing models

Refs: v033 lines 34-36, 63-78, 221-225, 313-320.

v033 er komið miklu nær réttri Google-uppsetningu, en Places-kaflinn er ekki nógu nákvæmur til að implementa örugglega. Hann segir í sömu andrá:

- `Places API (New)` í API restrictions.
- Places Library í Maps JavaScript API með `@googlemaps/js-api-loader`.
- `place.getDetails()` með session token.
- Verðtöflu sem blandar `Autocomplete Requests`, `Places UI Kit Autocomplete`, og fullyrðingunni að Place Details sé innifalið í session-verði.

Þetta er ekki eitt skýrt Google product path. Official Google docs gera greinarmun á Places API (New), Places UI Kit og legacy Places Library/Autocomplete í Maps JavaScript API. Þar að auki er fullyrðingin í v033 line 78 of sterk: fyrir Autocomplete (New) eru fyrstu 12 autocomplete requests venjulega billuð sem requests og terminating Place Details Essentials request er líka billuð sérstaklega. Ef sessions eru incomplete/abandoned fara þau aftur í per-request billing.

Áður en Claude Code kóðar þarf v033 að velja nákvæmlega eitt Google Places path:

- Google Maps JavaScript Places Autocomplete widget/legacy path, með réttum enabled APIs, `fields`/`setFields`, réttum billing-SKU og engri fullyrðingu um New session pricing nema hún eigi við.
- Eða Places API (New) / Place Autocomplete Data API eða nýtt widget path, með réttum session token lifecycle, terminating Place Details (New), exact fields og pricing.
- Eða Places UI Kit, ef við viljum UI Kit vísvitandi. Þá þarf að segja það skýrt, því það er annað product og önnur verðforsenda.

Mín ráðlegging fyrir bake-off: velja einfaldasta official Google path sem gefur leitarbox + place selection + lat/lon án þess að sækja óþarfa fields. En Claude Code þarf fyrst að staðfesta exact API/docs og uppfæra planið.

### Major 2 - Bake-off má ekki byggja á production-wide provider flip nema það sé meðvitað samþykkt

Refs: v033 lines 92, 134-140, 245, 291-294.

`WEATHER_MAP_PROVIDER` í Vercel + redeploy er einfalt og fínt sem innri toggle, en það er global fyrir það environment. Ef þetta er gert á production meðan route/map UI er sýnilegt notendum, þá eru allir notendur óvart hluti af provider-tilrauninni og billing/test-noise verður óhreint.

Fyrir fyrstu bake-off á að nota annaðhvort:

- localhost,
- Vercel Preview/staging,
- eða production feature gate sem aðeins Stebbi/admin/internal user sér.

Production toggle er í lagi seinna, en þá sem meðvituð release-aðgerð, ekki sem handhæg leið til að prófa 12 cases. v033 ætti að segja skýrt hvaða environment á að nota.

### Medium 1 - Mapbox token-boundary þarf að vera jafn skýr og Google token-boundary

Refs: v033 lines 175-183, 230-236, 279-293.

v033 leiðréttir Google server/browser key vandann vel. Sama regla þarf að vera explicit fyrir Mapbox:

- `MAPBOX_SECRET_TOKEN` má bara fara í server-to-server köll, t.d. geocoding/directions ef þau eru proxied server-side.
- Static image URLs, `mapbox-gl`, Search Box JS eða önnur browser-facing köll mega ekki innihalda secret token.
- Browser-facing Mapbox virkni á að nota restricted public token, með URL restrictions þar sem hægt er.

Þetta skiptir máli af því v033 skilgreinir `staticMapUrl` inni í server adapter. Ef implementation byggir static image URL á server og sendir URL í `<img>`, þá er tokenið í URL-inu samt sýnilegt í browser. Það má vera public token, ekki secret token.

### Medium 2 - Budget alerts eru ekki spending caps

Refs: v033 lines 55, 226-237, 301-303.

Budget alerts eru nauðsynleg, en þau stöðva ekki sjálfkrafa kostnað. Áður en þetta fer í preview sem fleiri en Stebbi nota þarf acceptance criteria að innihalda:

- Google API restrictions á báðum lyklum.
- Quotas eða low daily caps á Static Maps, Routes, Geocoding og Places þar sem Google leyfir.
- Mapbox budget/notification/limit stillingar eftir því sem account styður.
- Engin high-volume automated test gegn raunverulegum Google/Mapbox endpoints.

Þetta er sérstaklega mikilvægt ef autocomplete fer af stað við hvert keystroke og route/static map getur renderast mörgum sinnum í sama flæði.

### Medium 3 - Client-submitted lat/lon þarf validation og provenance

Refs: v033 lines 75-76, 181-183, 284-290.

Það er praktískt að client sendi `{ placeId, displayName, lat, lon }` eftir að notandi velur stað, en server má ekki meðhöndla þetta sem trusted provider data. Þetta er user input.

Server-side þarf að validate-a:

- lat/lon eru finite numbers og innan eðlilegs bounds fyrir Ísland, eða innan leyfðs app-svæðis,
- provider/provenance passar við virkt confirmation flow,
- route distance og fjöldi checkpoints eru capped,
- `displayName` er aðeins label, ekki source of truth,
- provider-derived niðurstöður eru ekki vistaðar í global `places.ts` eða notaðar sem cross-provider cache.

Þetta er ekki stór öryggisvá ef rétt er hannað, en án validation getur notandi ýtt kerfinu í arbitrary coords, óþarfa met.no/map calls eða ruglingsleg svör.

### Minor 1 - Bake-off test set þarf íslenska stafi og raunverulegari ambiguity

Refs: v033 lines 110-121.

Test-cases eru góð byrjun, en þau eru of ASCII/transliteration-heavy fyrir Teskeið. Bæta við eða tvöfalda cases með:

- `Suðurgata`, `Suðurgata Reykjavík`, `Suðurgata Hafnarfjörður`
- `Húsavík`
- `Grafarholtið`
- `Mosó`
- bæði golfvöllur og hverfi þegar það á við

Halda má ASCII útgáfum líka, því fólk skrifar bæði. Ég myndi líka skipta `Bæjarholt 99` út ef það gæti verið raunverulegt heimilisfang. Betra er að nota augljóslega ómögulegt eða tilbúið case sem prófar failure án persónulegrar address-áferðar.

### Minor 2 - UI-plan þarf explicit Design.md acceptance criteria

Refs: v033 lines 180-184, 260-303.

v033 nefnir mobile-first og 16px inputs, sem er gott. Fyrir implementation ætti Phase 2A2 líka að taka skýrt fram:

- allur map-confirmation texti fer í `messages/is.json` og `messages/en.json`,
- autocomplete/loading/error states mega ekki valda layout shift,
- map image/panel hefur stable aspect-ratio og veldur ekki horizontal overflowi,
- "Breyta", staðfesting, retry og provider failure hafa pending/disabled states,
- no card-in-card layout,
- keyboard open/close á mobile má ekki brjóta scroll-state,
- provider logo/attribution má ekki skerast af ef við notum static maps sem krefjast attribution.

## Niðurstaða

v033 er rétta stefnan fyrir provider bake-off, með tveimur fyrirvörum áður en Claude Code fær framkvæmdarleyfi:

1. Places-kaflinn þarf að velja eitt exact Google product path og leiðrétta billing/session fullyrðingar.
2. Bake-off á að fara fram í local/preview/internal-gated umhverfi, ekki með production-wide flip nema Stebbi samþykki það sérstaklega.

Eftir það er env-var provider toggle ásættanlegur fyrsti admin-stýringarpunktur. Ekki byggja alvöru Supabase admin toggle fyrr en provider hefur verið valinn eða Stebbi vill sérstaklega gera það að sérverkefni.

## Suggested message to Claude Code

```text
Rýndu v034 áður en þú heldur áfram með v033.

Helstu breytingar sem þarf að gera á planinu:
1. Velja eitt exact Google Places product path áður en kóðað er. Ekki blanda Places API (New), Places UI Kit og legacy Maps JS Autocomplete í sömu spec. Leiðrétta session/billing textann: Place Details er ekki almennt "innifalið" í session-verði.
2. Gera bake-off í localhost, preview/staging eða internal-gated production. Ekki production-wide Vercel provider flip nema Stebbi samþykki það sérstaklega.
3. Gera Mapbox token-boundary jafn explicit og Google: secret token aldrei í static image URL eða browser-facing Search/Mapbox JS.
4. Bæta við quota/cost guardrails, ekki bara budget alerts.
5. Treat-a client-sent lat/lon sem user input: validate bounds/provenance/caps server-side.
6. Bæta íslenskum stöfum og raunverulegri tvíræðni við bake-off test set.
7. Bæta Design.md acceptance criteria fyrir map confirmation UI, messages, loading, mobile keyboard og attribution.
```

## Localhost checks for Stebbi

Þetta er plan-review, svo ekkert nýtt er tilbúið til localhost prófunar enn. Þegar Claude Code skilar næsta implementation plan eða Phase 2A2 útfærslu, prófaðu sérstaklega:

1. Provider bake-off keyrsla fer fyrst á localhost eða preview/staging, ekki production-wide.
2. Google flow: DevTools Network sýnir aldrei `GOOGLE_MAPS_SERVER_KEY`; aðeins browser key í map/places browser requests.
3. Mapbox flow: ekkert browser request inniheldur `MAPBOX_SECRET_TOKEN`.
4. Óþekktur staður opnar autocomplete/search með 16px inputi, stable loading state og engum mobile zoomi.
5. Staðfesting á route sýnir réttan frá/til stað og provider helst sá sami út allt flæðið.
6. Known `places.ts` staðir kalla ekki geocoding provider, en static map má birtast með public/browser token.
7. Repeated render/back/change veldur ekki mörgum óþarfa static map/autocomplete köllum.
8. Mobile 360, 390 og 460 px: enginn horizontal overflow, map aspect-ratio helst stöðugt, buttons eru reachable með keyboard opið og lokað.
9. Billing dashboard/quota sýnir ekki óvænt call-spike eftir 12-case bake-off.

Ekki prófa high-volume loops eða production secrets í browser. Ef production þarf að snerta provider/env/billing þarf það sérstakt samþykki frá Stebba.

## Sources checked

- Google Maps Platform pricing: https://developers.google.com/maps/billing-and-pricing/pricing
- Google Maps JavaScript Autocomplete/session pricing: https://developers.google.com/maps/documentation/javascript/session-pricing
- Google Maps JavaScript Place Autocomplete docs: https://developers.google.com/maps/documentation/javascript/place-autocomplete
- Google API key security best practices: https://developers.google.com/maps/api-security-best-practices
- Mapbox Geocoding result storage: https://docs.mapbox.com/api/search/geocoding/#storing-geocoding-results
- Mapbox Search Box session billing: https://docs.mapbox.com/api/search/search-box/
