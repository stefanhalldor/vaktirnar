# TODO 086 v376 - Codex extra prerelease review of v375 Phase B

Created: 2026-07-17 00:00
Timezone: Atlantic/Reykjavik
Author: Codex

Related handoff:
- `2026-07-16-2352-todo-086-v375-claude-v374-done-prerelease.md`

## Mjog stutt nidurstada

V375 er tekniskt snyrtilegt og prof eru graen: route-selection kortid faer Vedurstofu-toggle, grar stodvamerkingar, smellanlega preview-card og Vedurpuls. Enginn augljos auth/RLS leki og met.no/Yr utreikningur helst obreyttur. En eg myndi taka eina litla hardening/cleanup umferd adur en thetta verdur grunnur fyrir Vegagerdina: extracta preview-cardid ur `RouteSelectionStep`, laga hardcode-ad notendatexta og passa ad route-geometry downsampling verdi ekki ny bjogun i provider-point matching.

## Findings

1. **Medium: `RouteStationPreviewCard` er file-private inni i `RouteSelectionStep`, sem vinnur gegn samnytingarstefnunni**

   Nyja preview-cardid notar sem betur fer `ForecastRowLine` og `VedurstofanPulseInline`, en sjalft card-shell, header, provider badge, distance texti, no-data texti og Puls composition eru nytt file-private component inni i [RouteSelectionStep.tsx](</c/Users/Lenovo/Documents/vaktirnar/components/weather/RouteSelectionStep.tsx:638>). Vid erum tha komin med enn einn stadinn sem setur saman Vedurstofu-stodvarcard, samhlida [VedurstofanPointCard.tsx](</c/Users/Lenovo/Documents/vaktirnar/components/weather/VedurstofanPointCard.tsx:78>) og fullu Puls sidunni.

   Þetta er ekki functional blocker fyrir Phase B, en er akkurat sú átt sem Stebbi vill forðast: sama hugmynd smíðuð á fleiri stöðum. Áður en Vegagerðin kemur inn ætti Claude Code að extracta previewið í samnýtanlegan component, t.d. `ProviderStationPreviewCard` eða `VedurstofanStationPreviewCard`, sem getur tekið:

   - station/provider metadata
   - `forecastRows`
   - optional `pulseStationId`
   - `returnTo`
   - variant/context: `route-selection-preview`, síðar `route-result-card`, `station-explorer-preview`

   Lágmarksfix fyrir morgundaginn: færa `RouteStationPreviewCard` úr `RouteSelectionStep.tsx` í sér component-file undir `components/weather/` og gera interface-ið provider-friendly, jafnvel þó fyrsta notkun sé bara Veðurstofan.

2. **Medium: `downsampleRoutePoints` leysir 1000-point cap en getur bjagað provider-station matching á sveigðum leiðum**

   Í [FerdalagidClient.tsx](</c/Users/Lenovo/Documents/vaktirnar/app/auth-mvp/vedrid/FerdalagidClient.tsx:39>) er route geometry stride-sampled niður í 500 punkta áður en endpointið fær hana. Þetta kemur í veg fyrir 400 á löngum leiðum, sem var rétt að laga. En fyrir fixed provider-points var einmitt meginákvörðunin að nota route geometry beint, ekki sample-aðan met.no-grunn. Uniform index-downsampling getur búið til chord yfir firði/sveigjur og þannig annaðhvort misst stöð sem er nálægt raunverulegum vegi eða tekið stöð með sem er nálægt beinni línu milli niðurtekinna punkta.

   Þetta er líklega ásættanlegt fyrir route-selection preview í Phase B, en ekki sem langtíma provider-matching pattern fyrir Veðurstofu/Vegagerð. Næsta hardening ætti að vera:

   - annaðhvort leyfa endpointinu að taka fulla route geometry og treysta því að 280 provider points x route segments sé ódýrt nóg,
   - eða flytja/downsample-a með geometry-preserving aðferð með max-fráviki/tolerance, ekki bara stride,
   - eða gera matching server-side á fullri geometry og cap-a niðurstöður, ekki input geometry.

   Ath: núverandi helper getur líka skilað 501 punkti þótt comment segi `≤500` þegar last point er bætt við. Það er ekki hættulegt gagnvart server-cap 1000, en comment/test ættu að vera heiðarleg.

3. **Low: Hardcode-að "Veðurstofan" í preview badge þrátt fyrir i18n/provider label**

   [RouteSelectionStep.tsx](</c/Users/Lenovo/Documents/vaktirnar/components/weather/RouteSelectionStep.tsx:664>) hardcode-ar `Veðurstofan`. Það er proper noun, en við eigum þegar `providerVedurstofanLabel` í messages og notendatextareglan segir að texti eigi að fara í `messages`. Þetta er líka samnýtingarpunktur: ef previewið verður provider-friendly fyrir Vegagerðina, má provider label ekki vera hardcode-að.

   Fix: nota `tf('providerVedurstofanLabel')` í bili, og í extracted provider preview taka `providerLabel` sem prop.

4. **Low: Test-name mismatch getur ruglað næsta review**

   Í `weather-provider-stations.test.ts` er test sem heitir "returns 403 when access required and user is signed out" en assertion segir réttilega 401, því base weather gate stoppar signed-out áður en provider gate keyrir. Þetta er ekki runtime bug, en test nafnið ætti að vera nákvæmt.

   Fix: rename test í eitthvað eins og "returns 401 when access required and signed-out user is blocked by base weather access".

## Things That Look Good

- `npm run type-check` er grænt hjá Codex.
- `npm run test:run -- lib/__tests__/weather-provider-stations.test.ts lib/__tests__/weather-travel-api.test.ts lib/__tests__/providerRouteMatching.test.ts` er grænt hjá Codex: 49/49 pass.
- Endpointið er server-gated: base weather access fyrst, svo Veðurstofu provider access þegar `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true`.
- 403-loop vandinn úr v374 er tæknilega lagaður með `routeStationLayerAllowed`.
- MET/Yr final calculation og `app/api/teskeid/weather/travel/route.ts` eru óbreytt.
- Forecast rows eru ekki endurforritaðar frá grunni; `ForecastRowLine` og `selectUpcomingRows` eru notuð.
- Púlsinn er ekki nýr sérpúls heldur notar `VedurstofanPulseInline`, sem styður chat-core stefnu verkefnisins.
- Engar SQL, env, Vercel, migration eða production breytingar.

## Release Recommendation

Ég myndi ekki kalla þetta hættulegt, en ég myndi samt gera **stutta v377 cleanup/hardening áður en release/push** ef Stebbi vill halda okkur á "samnýtanlegir íhlutir fyrst" sporinu:

1. Extracta `RouteStationPreviewCard` úr `RouteSelectionStep.tsx` í reusable weather component.
2. Nota i18n/provider label í stað hardcode-aðs `Veðurstofan`.
3. Rename-a villandi testið.
4. Skýra downsampling comment/test eða færa route downsampling í samnýtanlegan helper með skýrri ábyrgð.

Ef markmiðið er bara að prófa Phase B mjög fljótt á localhost undir núverandi flöggum, þá er v375 samt líklega nothæft. En sem foundation fyrir Vegagerðina myndi ég herða samnýtinguna fyrst.

## Reuse / Architecture Direction

Halda áfram þessari línu:

- `providerRouteMatching.ts` = provider-neutral geometry matching.
- `ForecastRowLine` / `VedurstofanForecastRows` = shared forecast row rendering.
- `VedurstofanPulseInline` = shared Púls/chat surface for station contexts.
- New extracted `ProviderStationPreviewCard` = shared preview shell for route-selection/station explorer/future provider previews.

Forðast:

- Fleiri file-private station cards inni í stórum container components.
- Sér format fyrir "3 raðir + Púls" í hverjum skjá.
- Provider-specific labels/texta hardcode-aða inni í generic route-selection.
- Að route-selection verði óbeint "Veðurstofan only" architecture sem Vegagerðin þarf svo að afrita.

## Suggested Next Phases

### Phase B0.1 - Pre-release cleanup

Markmið: gera v375 tilbúið sem endurnýtanlegan grunn.

- Extracta `RouteStationPreviewCard`.
- Gera provider label/source generic sem props.
- Laga i18n/hardcoded label.
- Rename-a villandi test.
- Skýra downsampling contract.
- Keyra type-check og relevant tests aftur.

### Phase B1 - Localhost UX verification

Markmið: staðfesta að layerinn sé ekki bara tæknilega réttur heldur nothæfur.

- `/vedrid`, mobile 360/390/460.
- Reykjavík -> Selfoss.
- Reykjavík -> Egilsstaðir.
- Ísafjörður/Akureyri eða önnur löng leið.
- Toggle on/off.
- Station click preview.
- Púls preview, login CTA og composer state.
- Route option switch lokar preview og refresh-ar markers.

### Phase C - Route-selection status/time model

Markmið: lita stöðvar eftir veðurmörkum og tíma, án þess að trufla lokaniðurstöðu.

- Weather limits control á route-selection eða endurnýta núverandi thresholds.
- Time scrubber líkur veður.is hugmyndinni.
- Marker status computed úr selected time + provider rows.
- Nota sömu status helpers/badges og summary/result map, ekki ný status lógík.

### Phase D - Provider comparison modes

Markmið: bera saman Yr og Veðurstofu á sömu stöðvahnitum án þess að rugla baseline.

- Sækja Yr/met.no forecast á Veðurstofu station coordinates sem comparison layer.
- Stillingar eins og "Varfærnasta matið" default, mögulega "Jákvæðasta spáin" sem valkostur seinna.
- Skýrt að þetta sé comparison/decision support, ekki breyting á raw provider data.

### Phase E - Vegagerðin provider layer

Markmið: bæta Vegagerðinni inn án copy/paste architecture.

- Sama provider route matching.
- Sami provider layer toggle pattern.
- Sami preview shell, en Vegagerðin fields/current-road-condition rows.
- Púls færist eða tvinnast við Vegagerðarpunkta þegar gögnin eru komin.

### Phase F - Route-level pulse and insights

Markmið: Safnpúls á leiðinni án þess að taka of mikið skjápláss.

- Collapsed drawer neðarlega í "Á leiðinni".
- Nýjustu frá notendum Teskeið.is per station/road point.
- Realtime by default via chat-core.
- Síðar AI samantekt byggð á Púls + provider data, en aðeins þegar kostnaður og ábyrgð eru skýr.

## Localhost checks for Stebbi

Eftir v375 eða v377 cleanup:

1. Opna `/vedrid` sem public notandi með Veðurstofu opna globalt.
2. Velja Reykjavík -> Selfoss og staðfesta að Veðurstofu-toggle sé sýnilegt, ON by default.
3. Slökkva/kveikja á toggle og staðfesta að gráar stöðvamerkingar hverfi/birtist án villu.
4. Smella á stöð og staðfesta:
   - preview opnast undir kortinu,
   - station name og provider badge sjást,
   - 3 forecast rows líta eins út og aðrar Veðurstofu forecast rows,
   - Púls preview/composer/login CTA notar sama útlit og á Veðurstofuspjöldum.
5. Skipta um route option og staðfesta að preview lokist og markerar endurnýist.
6. Prófa langa leið, t.d. Reykjavík -> Egilsstaðir, og staðfesta að layerinn hverfi ekki þegjandi.
7. Prófa með `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true` og notanda án Veðurstofuaðgangs: toggle á ekki að sjást.
8. Fara í result step og staðfesta að lokaniðurstaða, met.no punktar og Veðurstofuspjöld séu óbreytt.

Ekki prófa SQL/RLS/Vercel/env/deploy í þessu flæði nema Stebbi gefi sérstakt leyfi. Engin migration fylgir v375.

## Óvissa / þarf að staðfesta

- Ég skoðaði diff, endpoint, tests, helstu shared components og keyrði relevant checks. Ég keyrði ekki browser/localhost sjálfur.
- Ég staðfesti ekki raunverulega fjölda route geometry points frá Google Routes fyrir lengstu leiðirnar. Downsampling áhættan er byggð á geometry-rökum og þarf helst visual localhost staðfestingu á Vestfjörðum/Austfjörðum.
- `returnTo='/auth-mvp/vedrid'` er enn þekkt Phase B limitation. Það er ekki nýr blocker hér, en ætti ekki að gleymast ef Púls preview verður mikið notað í route-selection.
