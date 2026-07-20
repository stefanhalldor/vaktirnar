# Handoff: Veðurstofuspjöld, nálæg Vegagerðargildi og tengt korta-callout

Created: 2026-07-20 10:38  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Relevant TODO: 086  
Type: Implementation plan / handoff for Claude Code review and execution

## Staða

Stebbi bað um formlegt handoff, ekki chat. Codex framkvæmdi engar app-kóðabreytingar, engar SQL-breytingar, keyrði enga migration, commit-aði ekki, push-aði ekki og deployaði ekki.

Þetta handoff lýsir næstu afmörkuðu breytingu fyrir Claude Code: laga Veðurstofustöðvaspjöldin og gera korta-overlayið tengt við valinn punkt.

## Markmið Stebba

Á Veðurstofuspjaldi:

- Taka út textann: `Vegaaðstæður eru nú skráðar á Vegagerðar stöðvum. Þessi síða sýnir veðurspá og eldri skilaboð, ef einhver eru.`
- Taka út textann: `Vertu fyrst/ur til að segja frá aðstæðunum`
- Setja í hvíta spjaldið: `Spá Veðurstofu Íslands, gefin út kl. hh:mm`
- Bæta við: `Nálæg raungildi frá Vegagerðinni`
- Sýna þrjú nálægustu Vegagerðargildi, raðað þannig að næsta stöð sé efst.
- Sýna nýjustu athugasemd frá Teskeiðarnotanda ef hún er til.
- Setja `Nánar` takka sem fer á Vegagerðarpúls viðkomandi Vegagerðarstöðvar.

Á `/vedrid` korti:

- Info-spjaldið við marker-click á að vera tengt við valinn punkt með línu/stem.
- Það má ekki vera ótengt box niðri í vinstra horni.
- Spjaldið á að sýna lágmarksupplýsingar: vind, hviður, nýjustu athugasemd og `Nánar`.

## Findings / áhætta fyrst

1. Núverandi Veðurstofusíða renderar legacy texta beint í `VedurstofanPulsClient.tsx`.
   - `pulseLegacyNote` birtist í hausnum.
   - `pulseEmptyPublic` birtist sem empty state fyrir chat preview.
   - Þetta er beint andstætt nýrri vörustefnu: Veðurstofuspjald á að vera spá + nálæg raungildi, ekki invitation til að skrifa á Veðurstofustöð.

2. Núverandi map overlay í v227 er ekki nógu gott UX.
   - `MapStationOverlay` í `WeatherOverviewClient.tsx` er `absolute bottom-3 left-3`.
   - Það tengist ekki marker sjónrænt og getur ruglað notanda þegar margir punktar eru á kortinu.
   - Réttari MVP er að færa callout-ið inn í `IcelandOverviewMap.tsx` og anchor-a það við marker.

3. Vegagerðin gögn á Veðurstofusíðu þurfa provider access gating.
   - Nota þarf `checkChatAccess(user, { provider: 'vegagerdin' })` áður en nálæg Vegagerðargildi eða Vegagerðarpúls-linkar eru sýndir.
   - Ekki má leka Vegagerðin upplýsingum til notanda sem er aðeins með Veðurstofuaðgang ef provider gate er virkt.

4. `getPreviewMessages()` er ordering-gildra.
   - Það sækir skilaboð descending úr DB en gerir svo `.reverse()`.
   - Ef sótt er `limit=3`, þá er nýjasta skilaboðið `messages.at(-1)`, ekki `messages[0]`.
   - Ef Claude sækir bara `limit=1`, þá er `messages[0]` í lagi.

5. Ekki kalla live Vegagerðin upstream í þessu verki.
   - Nota skal `readVegagerdinCurrentWithHistoryFallback()`.
   - Þetta á að nýta núverandi cache/history og valda ekki óþarfa upstream kostnaði eða bið.

## Skrár sem Codex skoðaði

- `WORKFLOW.md`
- `ai-handoff/README.md`
- `Design.md`
- `IcelandRoadmap.md`
- `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx`
- `app/auth-mvp/vedrid/puls/stod/[stationId]/page.tsx`
- `components/weather/WeatherOverviewClient.tsx`
- `components/weather/WeatherOverviewShell.tsx`
- `components/weather/IcelandOverviewMap.tsx`
- `lib/chat/access.server.ts`
- `lib/chat/repository.server.ts`
- `lib/weather/nearestStations.ts`
- `lib/weather/types.ts`
- `app/api/teskeid/weather/vedurpuls/vegagerdin/stations/[stationId]/preview/route.ts`
- `messages/is.json`
- `messages/en.json`

## Líklegar skrár sem Claude Code þarf að breyta

- `app/auth-mvp/vedrid/puls/stod/[stationId]/page.tsx`
- `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx`
- `components/weather/IcelandOverviewMap.tsx`
- `components/weather/WeatherOverviewClient.tsx`
- `components/weather/WeatherOverviewShell.tsx`
- `lib/weather/types.ts`
- `messages/is.json`
- `messages/en.json`

Mögulega þarf litla helper/type skrá ef prop typing verður of þungt inni í client component.

## Implementation plan

### 1. Laga copy og empty-state á Veðurstofustöðvaspjöldum

Í `VedurstofanPulsClient.tsx`:

- Fjarlægja paragraph sem birtir `t('pulseLegacyNote')`.
- Breyta forecast heading úr `pulseForecastFrom` í sértækari texta, t.d. nýjan lykil:
  - `pulseVedurstofanForecastFrom`
  - IS: `Spá Veðurstofu Íslands, gefin út kl. {time}`
  - EN: `Icelandic Met Office forecast, issued at {time}`
- Ekki sýna `ChatPreviewList` þegar `previewLoaded && messages.length === 0`.
- Ef legacy skilaboð eru til, má áfram sýna þau read-only, en án empty prompt.

Ekki eyða endilega gömlu translation lyklunum í sama diff nema þeir verði ónotaðir alls staðar. Athuga að `WeatherPulseInline.tsx` notar líka `pulseEmptyPublic`.

### 2. Bæta við nálægum Vegagerðargildum á Veðurstofusíðu

Í `app/auth-mvp/vedrid/puls/stod/[stationId]/page.tsx`:

- Eftir `guardTeskeidSession()` og Veðurstofu-aðgang:
  - Keyra `const vegagerdinAccess = await checkChatAccess(user, { provider: 'vegagerdin' })`.
  - Ef ekki `allowed`, senda `nearbyVegagerdinStations={[]}` eða `null` og ekki rendera section.
  - Ef `allowed`, nota `readVegagerdinCurrentWithHistoryFallback()`.
- Ef result er `unavailable`, fail-open með tóman lista.
- Map-a Vegagerðin measurements yfir í candidates fyrir `findNearestStations()`:
  - `stationId`
  - `name`
  - `lat`
  - `lon`
- Nota:
  - `findNearestStations({ lat: entry.lat, lon: entry.lon }, candidates, 3)`
- Tengja nearest niðurstöður aftur við full measurement objects.
- Halda röðuninni nearest-first.
- Fyrir hverja af 3 stöðvum:
  - Sækja nýjustu athugasemd með `getPreviewMessages({ domain: 'weather', targetType: 'vegagerdin_station', targetId: stationId }, 1)`.
  - Nota `messages[0]` ef limit er 1.
- Bæta við prop á `VedurstofanPulsClient` með display-ready gögnum.

Mælt type:

```ts
type NearbyVegagerdinStation = {
  stationId: string
  stationName: string
  distanceM: number
  measuredAtIso: string | null
  meanWindMs: number | null
  gustLast10MinMs: number | null
  airTemperatureC: number | null
  roadTemperatureC: number | null
  latestNote: { body: string; createdAt: string; authorName: string | null } | null
  pulseHref: string
}
```

Nota núverandi href helper ef til staðar, líklega `vegagerdinPulseHref(...)`. `returnTo` ætti að vísa aftur á Veðurstofustöðvasíðuna eða upprunalegt `returnTo`, eftir því hvað núverandi pulseBack pattern gerir. Mikilvægast: notandi á ekki að enda í blindgötu.

### 3. Rendera `Nálæg raungildi frá Vegagerðinni`

Í `VedurstofanPulsClient.tsx`:

- Rendera section undir Veðurstofuspá.
- Nota heading: `Nálæg raungildi frá Vegagerðinni`.
- Sýna þrjár compact rows, ekki þrjú stór nested cards.
- Hver row:
  - Station name.
  - Distance, t.d. `3,2 km frá`.
  - Vindur og hviða ef til.
  - Mælitími, t.d. `Mælt kl. 10:21`.
  - Latest note ef til, max 1-2 línur.
  - `Nánar` takki/linkur.
- Ef engar stöðvar eru tiltækar:
  - Best að fela section alveg frekar en sýna noise, nema Claude telur nauðsynlegt að sýna unavailable texta.

Design:

- Mobile-first.
- Enginn horizontal overflow.
- Ekki card inni í card; nota `divide-y`, `border-t`, eða compact rows.
- Touch target fyrir `Nánar` þarf að vera þægilegt.

### 4. Færa korta-overlay frá bottom-left yfir í marker-anchored callout

Núverandi staða:

- `WeatherOverviewShell.tsx` renderar:
  - `<IcelandOverviewMap ... />`
  - `{renderSelectedOverlay?.(...)}`
- `WeatherOverviewClient.tsx` skilar `MapStationOverlay`.
- `MapStationOverlay` er absolutely positioned neðst vinstra megin.

Tillaga að betri MVP:

- Láta `IcelandOverviewMap.tsx` styðja selected marker callout.
- Nota Google Maps `InfoWindow` anchor-að við `google.maps.Marker`.
- `InfoWindow` gefur sjálfkrafa tengingu/stem við marker og fylgir kortinu við pan/zoom.
- Ekki nota `innerHTML` með notendagögnum.
  - Búa til DOM node með `document.createElement`.
  - Setja texta með `textContent`.
  - Búa til `a` fyrir `Nánar` með öruggu `href`.
- `InfoWindow.closeclick` þarf að kalla `onSelect(null)`.
- Þegar `selected` breytist eða marker verður invisible, loka InfoWindow.
- Þegar note-preview klárast, uppfæra content án þess að losa selection.

Möguleg prop hönnun:

```ts
export interface ProviderMapMarkerCallout {
  stationName: string
  windMs: number | null
  gustMs: number | null
  gustLabel: string
  latestNote: string | null
  detailsHref: string
  detailsLabel: string
  closeLabel: string
}

export interface ProviderMapMarker {
  // existing fields
  callout?: ProviderMapMarkerCallout
}
```

Þá getur `WeatherOverviewClient.tsx` byggt callout-data fyrir hvern marker út frá núverandi station data og preview state.

Alternative, ef Claude vill minnsta diff:

- Halda fetch logic í `WeatherOverviewClient.tsx`.
- Senda `selectedCallout` sér prop inn í `IcelandOverviewMap`.
- Map component notar selected marker key til að anchor-a InfoWindow.

Hvort sem valið er, á `WeatherOverviewShell.tsx` ekki lengur að rendera bottom-left overlay sem primary UX.

### 5. Laga latest-note ordering í overlay

Ef preview endpoint skilar 3 skilaboðum:

- Nota `msgs.at(-1)?.body`.

Betra fyrir þetta UI:

- Sækja `limit=1` ef API styður það, eða bæta við query param á preview endpoint ef það er nú þegar pattern.
- Þá er `msgs[0]?.body` rétt.

Ekki skilja eftir núverandi bug þar sem elsta af síðustu þremur skilaboðum gæti birst.

## Route intelligence check

1. Breytingin snertir ekki ákveðna leið, vegkafla eða route-family.
2. Ný þekking á ekki heima í `IcelandRoadmap.md` eða `lib/iceland-routes/`, því þetta er station-context UI fyrir Veðurstofustöðvar og korta-marker.
3. Lausnin á að vera provider-aware en ekki Google Routes bundin.
4. Það þarf ekki canonical segment, control point, route caution, station matching reglu, cache lykil eða test fixture.
5. Engin raw route geometry, Google route content, persónuleg leið eða heimilisfang er geymt.
6. Nálæg Vegagerðargildi eru straight-line station context, ekki route safety assessment. Ekki nota þessa nálgun sem sönnun fyrir leiðarveðri.

## Supabase / auth / RLS / production

- Engin SQL migration þarf.
- Ekki breyta RLS, grants eða policies.
- Ekki keyra SQL.
- Ekki keyra cron.
- Ekki kalla live upstream Vegagerðin fetch.
- Nota núverandi server helpers:
  - `readVegagerdinCurrentWithHistoryFallback()`
  - `findNearestStations()`
  - `getPreviewMessages()`
  - `checkChatAccess(user, { provider: 'vegagerdin' })`
- Provider gating er skylduatriði áður en Vegagerðin section birtist á Veðurstofusíðu.
- Chat preview DTOs eiga áfram að vera safe boundary; ekki senda hidden/deleted messages eða viðkvæm profile gögn til client.

## Design.md check

Claude Code þarf að fylgja þessum viðmiðum:

- Mobile-first við 360, 390 og 460 px.
- Enginn horizontal overflow.
- Texti má ekki skarast eða fara út fyrir controls.
- Touch targetar almennt minnst 40x40 px.
- Allur nýr notendatexti fer í `messages/is.json` og `messages/en.json`.
- Ekki nota status-liti sem eina merkingu.
- Ekki setja card inni í card; nota compact rows/dividers fyrir nálæg Vegagerðargildi.
- Callout má ekki hylja Google attribution eða controls á kortinu.

## Prófanir sem Claude Code ætti að keyra

Keyra eftir breytingu:

```bash
npm run type-check
npm run test:run
```

Ef nýr helper er búinn til fyrir latest preview eða callout formatting, bæta við targeted unit tests.

Ef mögulegt er án þess að ræsa dev server sjálfur:

- Biðja Stebba að prófa í browser á localhost.
- Ekki ræsa eða endurræsa dev server nema Stebbi biðji sérstaklega um það.

## Localhost checks for Stebbi

Stebbi prófar eftir að Claude Code hefur útfært og keyrt type/test:

1. Opna Veðurstofustöðvasíðu, t.d. `/auth-mvp/vedrid/puls/stod/{stationId}` sem innskráður notandi með Veðurstofu- og Vegagerðin-aðgang.
2. Staðfesta að textinn `Vegaaðstæður eru nú skráðar...` sé horfinn.
3. Staðfesta að textinn `Vertu fyrst/ur til að segja frá aðstæðunum` birtist ekki þegar engin eldri skilaboð eru til.
4. Staðfesta að spá-spjaldið segi `Spá Veðurstofu Íslands, gefin út kl. hh:mm`.
5. Staðfesta að `Nálæg raungildi frá Vegagerðinni` sýni þrjár stöðvar, næstu efst.
6. Staðfesta að vindur, hviður ef til, mælitími og nýjasta athugasemd birtist rétt.
7. Smella á `Nánar` og staðfesta að notandi fari á réttan Vegagerðarpúls.
8. Staðfesta að back/return leiðin sé eðlileg.
9. Opna `/vedrid`, smella á Veðurstofu-punkt og Vegagerðar-punkt.
10. Staðfesta að info-spjaldið sé tengt við valinn punkt með línu/stem, ekki fast niðri í vinstra horni.
11. Prófa zoom og pan á kortinu; callout á að fylgja marker.
12. Prófa mobile breiddir 360, 390 og 460 px; ekkert overflow, callout hylur ekki map controls/attribution, `Nánar` er smellanlegt.
13. Ef Stebbi prófar með notanda án Vegagerðin-aðgangs, má `Nálæg raungildi frá Vegagerðinni` ekki leka gögnum eða linkum.

Ekki prófa production data mutation, SQL, cron, Vercel eða Supabase breytingar án sérstaks leyfis.

## Hvað var ekki gert

- Codex breytti ekki app-kóða.
- Codex breytti ekki `messages`.
- Codex skrifaði ekki migration.
- Codex keyrði ekki tests.
- Codex keyrði ekki SQL.
- Codex commit-aði ekki, push-aði ekki og deployaði ekki.

## Óvissa / þarf að staðfesta

- Hvort `vegagerdinPulseHref(...)` er export-að á þann hátt að hægt sé að nota helperinn beint í Veðurstofusíðunni, eða hvort þarf lítinn shared href helper.
- Hvort Stebbi vill fela legacy Veðurstofu-skilaboð alveg eða aðeins fela empty-state textann. Túlkun Codex: sýna legacy skilaboð ef þau eru til, en ekki sýna invitation/empty prompt.
- Hvort `InfoWindow` default útlit er nógu nálægt sjónrænu markmiði Stebba. Codex mælir með því sem MVP vegna þess að það leysir tengingu við marker örugglega; custom `OverlayView` má koma síðar ef útlitið þarf að vera nákvæmara.

## Næsta skref

Claude Code ætti að rýna þetta handoff fyrst með production-gleraugum. Ef ekkert blocking finnst og Stebbi sendir þetta með `Workflow`, má Claude Code framkvæma afmarkaða breytingu í repo, keyra type-check/tests og skila nýju handoffi fyrir útgáfurýni.
