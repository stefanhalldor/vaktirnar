# 2026-07-19 06:23 - TODO 086 v541 - Codex review á v540 + næsta stórt handoff

Created: 2026-07-19 06:23
Timezone: Atlantic/Reykjavik

Review target: `2026-07-19-0614-todo-086-v540-claude-v539-done-prerelease`

---

## Findings

1. **Medium: route-memory write er ekki atomic og getur tapað eða sleppt write við samtímis fyrstu keyrslur sömu leiðar**  
   Í `lib/iceland-routes/routeMemory.server.ts:57`-`112` er route row skrifað með `select -> update/insert`. Ef tvær requestur reikna sömu nýju route_key á sama tíma geta báðar séð ekkert row, önnur insert-ar, hin fær unique violation og return-ar án þess að skrifa station rows. Þetta er ekki privacy-leki, en gerir route-memory óáreiðanlegt þegar sama vinsæla leið er prófuð af fleirum.  
   **Fix:** nota atomic `upsert(..., { onConflict: 'route_key' })` eða SQL RPC sem gerir route row upsert + usage_count increment örugglega. Ef usage_count má vera approximate fyrst, velja einfaldan upsert og laga increment seinna.

2. **Medium: provider sem skilar 0 stöðvum hreinsar ekki gamla station rows**  
   `recordRouteMemory()` eyðir station rows bara fyrir providers sem eru til í `input.stations` (`routeMemory.server.ts:115`-`143`). Ef route hafði áður Vegagerðin rows en nýr útreikningur finnur 0 Vegagerðarstöðvar, þá er `vegagerdin` ekki í `providers` og gömlu rows lifa áfram. Þá sýnir `/vedrid` ekki lengur "nákvæmlega það sem /ferdalagid fann", heldur síðustu non-empty stöðvar.  
   **Fix:** láta writer vita hvaða providers voru evaluated (`providersToReplace: ['vedurstofan','vegagerdin']`) og eyða þeim providers alltaf, jafnvel ef rows eru 0. Ef provider var ekki available má sleppa að replace-a þann provider.

3. **Medium/Scope: route variants collapsa í `default` og síðasta leið vinnur**  
   Schema styður `route_variant_key`, en travel write notar `buildRouteMemoryKey(fromNorm.key, toNorm.key)` án variant (`app/api/teskeid/weather/travel/route.ts:449`) og sendir ekki `routeVariantKey` í `recordRouteMemory()` (`route.ts:472`-`479`). Þannig Reykjavík -> Akureyri, "Gegnum Hólmavík", "Til að sleppa við Öxi" og aðrar variants geta allar endað sem sama `default` route-memory record. Þetta getur verið v1 ef UI segir "síðast reiknaða leið", en það má ekki vera ómeðvituð hegðun.  
   **Fix:** nota `selectedRouteId`/route option id sem `routeVariantKey` þegar til staðar, og stable fallback eins og `default` þegar ekki er selected route. Route-memory lookup getur þá skilað variants, en `/vedrid` má áfram velja nýjustu variant í bili.

4. **Medium: routeLensResult uppfærist ekki þegar farið er milli tveggja resolved route-memory leiða**  
   Effectið sem sync-ar `routeLensResult` keyrir bara á `[routeMemory.status]` (`WeatherOverviewClient.tsx:173`-`194`). Ef notandi velur leið A sem resolves og svo leið B sem resolves líka, status helst `resolved` og label/query í panel getur setið eftir frá A. Map filter notar routeMemory beint og getur því verið rétt á meðan texta-state er rangt.  
   **Fix:** bæta `routeMemory.routeLabel`, `fromPlaceDraft?.name`, `toPlaceDraft?.name` eða stöðugum route-memory key í dependency listann, eða setja `routeLensResult` beint í fetch success handler.

5. **Medium: lookup endpoint skilar Vegagerðin IDs án provider access gating**  
   `app/api/teskeid/weather/route-memory/lookup/route.ts:22`-`24` segir endpointið opið og `lookupRouteMemory()` skilar bæði Veðurstofu og Vegagerðar IDs. IDs ein og sér eru ekki sérstaklega viðkvæm, en þetta getur brotið product/access contract ef `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED` eða sambærilegt er virkt.  
   **Fix:** lookup endpoint má vera public, en response á að filtera provider IDs út frá sama access/gating og `/vedrid` notar. Ef provider er lokaður á ekki að skila IDs fyrir þann provider til client.

6. **Low/Medium: v540 segir "full test coverage", en server write og lookup handler eru ekki prófuð**  
   Nýju prófin eru góð fyrir SQL static checks og place-normalization (`route-place-normalization.test.ts`, `weather-route-memory-migration.test.ts`), en það vantar próf fyrir `recordRouteMemory()` hegðunina, 0-provider replacement, route variant key og `POST /route-memory/lookup`. Þetta er service-role path og á skilið mock Supabase/handler próf áður en við treystum þessu í production.

7. **Low: Localhost check í v540 segir lookup API skili 500 áður en SQL er keyrt, en kóðinn ætti að skila `miss`**  
   `lookupRouteMemory()` grípur DB error og skilar `miss` (`routeMemory.server.ts:200`-`214`). Það er gott, en v540 handoff línur 191-194 eru líklega rangar. Localhost check á að staðfesta 200/miss og engan crash, ekki 500.

8. **Low: `git diff --check` fann whitespace athugasemd utan v540 kjarnans**  
   `git diff --check` skilaði `lib/weather/routeCautionConstants.ts:49: new blank line at EOF` auk CRLF warnings á `TODO.md` og `WORKFLOW.md`. Þetta virðist ekki vera route-memory core, en þarf að þrífa áður en commit er gerður ef þetta tilheyrir ócommittuðum pakka.

---

## Staðfestingar sem Codex keyrði

```bash
npm run type-check
```

Niðurstaða: exit 0.

```bash
npm run test:run -- lib/__tests__/route-place-normalization.test.ts lib/__tests__/weather-route-memory-migration.test.ts lib/__tests__/windObservationStatus.test.ts lib/__tests__/overview-route-draft.test.ts lib/__tests__/route-observation.test.ts lib/__tests__/iceland-routes-lens.test.ts
```

Niðurstaða: exit 0, 6 test files pass, 145 tests pass.

```bash
git diff --check
```

Niðurstaða: exit 1 vegna whitespace/CRLF warnings nefndra í finding #8.

---

## SQL / migration staða fyrir Stebba

**Ekki keyra neina migration sjálfkrafa. Claude Code má ekki keyra SQL.**

- `sql/86_weather_route_memory.sql` er nauðsynleg til að `/ferdalagid` geti vistað exact station-set og `/vedrid` geti lesið það. Hún breytir schema/gögnum með tveimur nýjum service-role töflum. Keyra hana aðeins þegar Stebbi biður sérstaklega um það.
- `sql/82_weather_user_preferences.sql` er nauðsynleg ef við ætlum að vista sjálfgefin vindmörk per innskráðan notanda. Hún býr til `weather_user_preferences` með RLS eigin-röð. Keyra hana aðeins þegar Stebbi biður sérstaklega um það.
- `sql/83_vegagerdin_measurements_history.sql` er fyrir varanlega Vegagerðin history/cache lausn. Ekki hluti af þessu handoffi nema Stebbi biðji um það.
- `sql/84_metno_point_forecasts_history.sql` er fyrir Yr/met.no station-coordinate forecast history. Ekki hluti af þessu handoffi nema Stebbi biðji um það.
- `sql/85_route_observation_aggregate.sql` er DRAFT / DO NOT RUN.

Ráðlegging: áður en Stebbi keyrir 86 í production, láta Claude laga findings #1-#5 eða taka skýra product-afstöðu til þeirra. 82 má bíða þar til default vindmörk save-flow er tilbúið end-to-end.

---

## Route Intelligence Check

- Snertir `/ferdalagid` -> `/vedrid` route-memory flæði, station matching fyrir Veðurstofu og Vegagerð, og `IcelandRoadmap.md` R4/R5.
- Lausnin er rétt stefna: geymir afleidd station IDs og normalized place labels, ekki raw Google route geometry eða heimilisföng.
- `IcelandRoadmap.md` þarf að uppfæra: R5 textinn lýsir enn v521 corridor lens sem nú er að víkja fyrir route-memory station sets. R4/R5 ættu að segja að `/vedrid` notar route-memory úr `/ferdalagid` þegar til er, ekki kilometer/corridor approximation.
- Route variant hegðun þarf að festa í `lib/iceland-routes/` contract: `default`, selected route id, curated alternative id, og reverse-direction policy.

---

## Design.md check

Næsta UI vinna snertir source/time scrubber, threshold controls, info box, station pulse og Vegagerðin myndavélar. Design.md relevant:

- Mobile-first, 360-460 px þarf að passa án horizontal overflow.
- Input text þarf að vera minnst 16 px til að forðast iOS zoom.
- Controls þurfa stöðugar stærðir, ekki layout shift þegar labels breytast.
- Ekki setja kort inni í kort; ef info box sameinar banner + thresholds þarf það að vera einfalt app-panel, ekki marketing hero.
- Allur notendatexti í `messages/is.json` og `messages/en.json`.

---

## Copy/paste handoff til Claude Code

```md
# TODO 086 v541 - Workflow: v540 hardening + /vedrid polish + Vegagerðin pulse cameras

## Skilningur á samþykki

Stebbi vill að Claude Code rýni þetta fyrst með gagnrýnum augum og framkvæmi eingöngu ef engar blocking spurningar vakna.

Þetta felur í sér kóðabreytingar og mögulega að skrifa/eða breyta migration-skrá ef þörf er á.
Þetta felur EKKI í sér að keyra SQL/migration, commit-a, push-a, deploya, breyta Vercel/env eða snerta production gögn.

Lesa þarf `WORKFLOW.md`, `Design.md`, `IcelandRoadmap.md` og þetta handoff áður en byrjað er.

## Markmið

Klára route-memory grunninn nógu vel til prerelease, laga helstu v540 áhættur, og taka næsta notendasýnilega skref á `/vedrid`:

1. `/ferdalagid` vistar exact provider station sets örugglega.
2. `/vedrid` notar þau sets án corridor/km approximation.
3. Scrubber og vindmörk líta betur út og hegða sér eðlilegar.
4. Default vindmörk verða vistanleg fyrir innskráða notendur, en migration má ekki keyra.
5. Vegagerðin pulse fær myndavélasýn ef hún er tiltæk í leyfilegu upstream/cache payloadi.

## A. Laga v540 findings áður en UI-polish fer langt

1. Gera `recordRouteMemory()` atomic:
   - Nota Supabase upsert á `weather_route_memory_routes` með `onConflict: 'route_key'`, eða SQL/RPC ef nauðsynlegt.
   - Forðast select -> insert race.
   - Usage count má vera approximate ef það heldur kóðanum einföldum; ekki velja flókna RPC nema hún sé greinilega betri.

2. Hreinsa provider station rows rétt:
   - Bæta við contracti eins og `providersToReplace`.
   - Ef provider var evaluated en fann 0 stöðvar, á að eyða gömlum rows fyrir þann provider.
   - Ef provider var ekki available/cache bilaði, ekki eyða gömlum rows fyrir provider nema það sé meðvituð ákvörðun.

3. Route variants:
   - Ekki láta allar routes sama from/to lenda í `default` ef selectedRouteId er til.
   - Nota stable `routeVariantKey`:
     - `selectedRouteId` þegar request kemur með route option.
     - `default` þegar engin selected route er til.
   - Senda `routeVariantLabel` ef til er nothæft description/label.
   - `/vedrid` má áfram velja nýjustu variant fyrst, en code/schema á að varðveita variants.

4. Laga `routeLensResult` sync:
   - Ef notandi fer úr einni resolved route-memory leið í aðra resolved leið, á panel label/query að uppfærast.
   - Ekki hafa effect dependency bara `[routeMemory.status]`.

5. Provider access gating í route-memory lookup:
   - Endpoint má vera public, en response má ekki skila provider IDs sem notandi má ekki sjá samkvæmt provider feature/access state.
   - Nota sömu provider access helpers og `/vedrid`/provider API notar, ekki nýja sérreglu.

6. Bæta tests:
   - Unit/mock tests fyrir `recordRouteMemory()`:
     - atomic/upsert path eða a.m.k. no select-insert race pattern ef það er hægt að assert-a.
     - provider evaluated with 0 stations deletes stale provider rows.
     - provider unavailable does not delete stale provider rows.
     - selectedRouteId/variant key varðveitist.
   - Handler test fyrir `/api/teskeid/weather/route-memory/lookup`:
     - bad body -> miss
     - normalized hit -> resolved
     - provider gating filters IDs
     - DB/table missing -> miss, ekki crash.

7. Uppfæra `IcelandRoadmap.md`:
   - R5 á ekki lengur að lýsa `/vedrid` route lens sem corridor-only v521 state.
   - Skrá að route-memory úr `/ferdalagid` er transitional exact station-set source fyrir `/vedrid`.
   - Skrá að route variants og reverse direction eru næstu R4/R5 atriði.

## B. Scrubber polish

Laga `WeatherSourceTimeSelector`:

1. Gera provider group labels meira header-like:
   - `Vegagerðin`
   - `Veðurstofan` eða `Veðurstofan (spá)` eftir núverandi copy.

2. Miðja allt í scrubbernum:
   - provider labels
   - `Núna`
   - `Mælt hh:mm`
   - day labels
   - dots/tímar

3. Halda mobile-first:
   - ekkert horizontal page overflow
   - scroll bara inni í scrubber
   - stable hæð, ekki hoppa þegar loading -> loaded.

4. Ekki sýna "Yr" í scrubber labeli nema Yr gögn séu raunverulega wired og sýnd.

## C. Vindmörk og info box

Stebbi vill færa "Þessi fyrsta útgáfa leggur áherslu á vind..." textann og vindmörkin saman í eitt einfalt info/control box ofarlega á `/vedrid`.

1. Info box:
   - Texti ca.: "Þessi fyrsta útgáfa leggur áherslu á vind fyrir fólk sem er á ferð um landið núna."
   - Bæta við að innskráðir notendur geti vistað sín sjálfgefnu vindmörk.
   - Nota `messages/is.json` og `messages/en.json`.

2. Auto-apply mörk:
   - Notandi á ekki að þurfa að smella á "Nota mörk" til að kortalitir/filterar uppfærist.
   - Þegar bæði gildi eru valid og `caution < danger`, uppfæra thresholds sjálfkrafa.
   - Ef gildi eru invalid, sýna validation án þess að brjóta síðuna eða hoppa layout.

3. Save default button:
   - Í stað "Nota mörk" skal vera secondary-ish action:
     - "Vista sem sjálfgefin vindmörk"
   - Ef notandi er innskráður: vista í `weather_user_preferences` gegnum API.
   - Ef notandi er public: senda í innskráningarferli með returnTo `/vedrid` og varðveita valin mörk svo þau vistist eftir login.
   - Þetta krefst `sql/82_weather_user_preferences.sql` í DB. Ekki keyra migration.

4. API/preferences:
   - Ef endpoints eru ekki til, bæta við:
     - `GET /api/teskeid/weather/preferences/thresholds`
     - `PUT /api/teskeid/weather/preferences/thresholds`
   - Nota auth user, RLS eða service-role með strict userId.
   - Ekki leka öðrum notendum.
   - Validate range og ordering bæði client og server.

5. `/vedrid/ferdalagid` Veðurmörk skref:
   - Fyrir innskráða notendur sem eiga saved defaults: sýna takka "Nota mín sjálfgefnu vindmörk".
   - Takkinn fyllir út núverandi reiti á Veðurmörk skrefinu.
   - Ekki neyða public notendur í login á þessu skrefi nema þeir reyni að vista defaults.

## D. Vegagerðin myndavélar í pulse

Stebbi vill myndavélasýn efst í pulse fyrir hverja Vegagerðarstöð þegar slíkt er til.

1. Fyrst inspect-a núverandi Vegagerðin upstream/cache payload:
   - Ekki scrape-a Færð.is HTML.
   - Ekki hotlink-a myndum nema payload/API og skilmálar leyfi.
   - Ef upstream JSON inniheldur camera/image URLs eða camera metadata, normalize-a það í Vegagerðin provider layer.

2. Data contract:
   - Bæta optional `cameras`/`cameraImages` við Vegagerðin station measurement/details type.
   - Hafa source time, direction/title, image URL, alt text og freshness ef tiltækt.
   - Ef engar myndir eru til, fela myndasvæðið alveg.

3. UI:
   - Sýna myndavélarnar efst í Vegagerðin pulse, fyrir ofan notendaskilaboð.
   - Ef margar myndir eru til, nota compact horizontal carousel/lista sem virkar á mobile án overflow.
   - Lazy-load myndir og setja fast aspect ratio til að forðast layout shift.
   - Allur texti í messages.

4. Tests:
   - Parser test fyrir camera fields ef payload fixture er til.
   - Component/render test eða a.m.k. type-check + localhost visual check.

## E. Migration guidance

Claude Code má skrifa/breyta migrations ef þarf, en má EKKI keyra þær.

Stebbi þarf skýr lokaskil:

- Run `sql/86_weather_route_memory.sql` only when route-memory hardening is merged/reviewed and Stebbi explicitly says to run it.
- Run `sql/82_weather_user_preferences.sql` only when saved threshold API/UI is implemented and Stebbi explicitly says to run it.
- Do not run `sql/85_route_observation_aggregate.sql`.
- 83/84 eru utan þessa handoffs nema Claude Code þurfi að nefna þau sem framtíðarverk.

## F. Commands

Keyra eftir breytingar:

```bash
npm run type-check
npm run test:run -- lib/__tests__/route-place-normalization.test.ts lib/__tests__/weather-route-memory-migration.test.ts lib/__tests__/windObservationStatus.test.ts lib/__tests__/overview-route-draft.test.ts lib/__tests__/route-observation.test.ts lib/__tests__/iceland-routes-lens.test.ts
```

Bæta við nýjum targeted tests fyrir route-memory writer/lookup og threshold preferences ef útfært.

Ekki ræsa dev server nema Stebbi biðji sérstaklega um það.

## G. Localhost checks for Stebbi

Áður en SQL 82/86 er keyrt:

1. Opna `/vedrid`.
2. Staðfesta að síðan crashi ekki.
3. Velja Frá/Til sem hefur ekki route-memory table enn; expected: graceful miss/cache state, ekki hvít síða.
4. Scrubber er miðjaður og enginn texti flæðir út á 390/460px.
5. Vindmörk auto-apply-a kortalitunum án "Nota mörk" smell.

Eftir að Stebbi keyrir 86 með sérstöku leyfi:

1. Opna `/vedrid/ferdalagid`, reikna Reykjavík -> Akureyri og velja route.
2. Fara aftur á `/vedrid`, velja sama Frá/Til.
3. Expected: aðeins nákvæm station set úr ferðalaginu birtist, ekki 1km/corridor gisk.
4. Prófa að velja aðra route variant ef til er; expected: annaðhvort nýjasta variant sé skýrt valin eða UI sýni að variants séu enn v1 takmörkun.

Eftir að Stebbi keyrir 82 með sérstöku leyfi:

1. Sem innskráður notandi: breyta vindmörkum á `/vedrid`, smella "Vista sem sjálfgefin vindmörk".
2. Refresh/reopen: saved mörk sækjast.
3. Opna `/vedrid/ferdalagid` Veðurmörk skref: "Nota mín sjálfgefnu vindmörk" fyllir reitina.
4. Sem public notandi: smella save default, fara í login, koma aftur á `/vedrid`; expected: mörkin varðveitast og vistast eftir login.

Vegagerðin pulse cameras:

1. Opna Vegagerðin station pulse sem hefur myndavél samkvæmt upstream.
2. Expected: myndavélasvæði efst, myndir lazy-load-a, engin layout shift.
3. Opna station án myndavélar; expected: ekkert tómt myndasvæði.

## H. Handoff eftir framkvæmd

Skila strax handoff með:

- hvað var lagað úr findings A1-A7
- hvaða UI breytingar fóru inn
- hvaða SQL skrár eru skrifaðar/breyttar og hvort þær voru keyrðar (expected: ekki keyrðar)
- hvaða tests voru keyrð og exit codes
- hvað Stebbi þarf að prófa á localhost
- skýr migration-röð: 82/86/83/84/85
```

---

## Óvissa / þarf að staðfesta

- Codex staðfesti ekki hvort Vegagerðin upstream payload inniheldur camera/image fields. Claude Code þarf að skoða provider payload/code áður en UI er lofað.
- Codex keyrði ekki fulla test suite eða browserpróf.
- Route variant strategy þarf product-afstöðu ef `/vedrid` á að sýna fleiri en nýjustu variant síðar.
- Access gating fyrir route-memory lookup þarf að samræmast núverandi provider access helpers; ekki búa til nýtt mini-auth kerfi.

