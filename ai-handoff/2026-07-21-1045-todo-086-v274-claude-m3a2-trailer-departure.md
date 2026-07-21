# 2026-07-21 10:45 - todo-086 v274 - Claude M3A-2: Eftirvagn + Brottfarartími

Created: 2026-07-21 10:45
Timezone: Atlantic/Reykjavik

## Samþykki / umfang

Stebbi gaf opið framkvæmdarleyfi: rýna v273 og taka næsta stóra framkvæmdafasa. Verkefnið var
M3A-2: bæta `trailerKind` select og `departureAt` datetime-local input við Road Map route form,
þannig að nýi grunnurinn nálgist núverandi `/ferdalagid` ferðaveðurreikning betur.

Þetta fól í sér kóðabreytingar og i18n-breytingar. Ekki fól í sér commit, push, deploy, SQL,
migration, Supabase, env/secrets eða production-breytingar.

## Hvað var gert

### Rýni á v273

Rýni á `RoadMapPrototypeMap.tsx` eftir v273-breytingar Codex:

- Marker cleanup í `return () => {...}` er í lagi: `placeMarkersRef.current.forEach(({ marker }) => marker.remove())` og `placeMarkersRef.current = []`.
- `selectRoutePlaceRef.current` pattern er rétt útfært — stall closure vandinn er leystur.
- `ROAD_MAP_PLACES` staðalisti: 39 staðir, importance 1/2/3. Vestfjörðir eru vel með (Ísafjörður, Hólmavík, Búðardalur, Patreksfjörður, Bíldudalur, Bolungarvík, Flókalundur). Norðurland og Austurland eru fullnægjandi fyrir prototype.
- In-flow suggestion list: rétt, engin absolute positioning vandamál.
- Active field indicator: vantar (sjá neðar — lagað í þessari útgáfu).

Spurningar frá v273-handoff svara:
- `roadMapPlaces.ts` á rétt heima í `lib/road-intelligence/` meðan þetta er aðeins prototype UI.
- Importance thresholds (3: alltaf, 2: zoom≥5.8, 1: zoom≥7.2) eru góð fyrir fyrsta prototype.
- Visual active state: **bætt við í þessari útgáfu** (sjá neðar).
- Staðalisti er nógu góður fyrir prototype; Vestfjörðir, Norðurland og Austurland eru með.

### M3A-2: Eftirvagn og brottfarartími

#### Nýtt state

```typescript
const [trailerKind, setTrailerKind] = useState<'none' | TrailerKind>('none')
const [departureAt, setDepartureAt] = useState('')
```

`TrailerKind` flutt inn frá `@/lib/weather/question`.

#### API köll

Submit sendir nú:
```typescript
body: JSON.stringify({
  origin,
  destination,
  trailerKind,
  ...(departureAt ? { earliestDepartureAt: departureAt } : {}),
})
```

`earliestDepartureAt` er aðeins sent þegar notandi hefur valið tíma. Ef reiturinn er tómur
er hann sleppt og server reiknar frá núverandi tíma (sama hegðun og áður).

#### handleClearRoute

Bætt við `setTrailerKind('none')` og `setDepartureAt('')` svo þetta hreinsar sig við Hreinsa.

#### Active field visual indicator

Frá og Til inputs sýna nú primary-lit ring þegar þau eru virk (þ.e. næsta kortasmellur fylli þann reit):

```tsx
className={`h-10 w-full rounded-md border bg-background px-3 text-base text-foreground outline-none
  transition-colors placeholder:text-muted-foreground
  ${activeRouteField === 'from' ? 'border-primary ring-1 ring-primary/30' : 'border-border focus:border-primary'}`}
```

Þetta svarar spurningunni úr v273 um hvort bæta ætti við visual active state.

#### UI röð í formi

Bætt við annarri röð neðan við Frá/Til/Reikna í forminu:

```
[Eftirvagn select] [Brottfarartími datetime-local]
```

Litlir textalyklar `text-[10px] text-muted-foreground` yfir hvorum reit. Eftirvagn select
notar núverandi `trailerNone`/`trailerGeneric`/`trailerTent`/`trailerFolding`/`trailerCaravan`/
`trailerHorse` þýðingarlyðkla í sama namespace. Brottfarartími er `datetime-local` input.

#### Nýir þýðingarlyklar

Bætt við í `messages/is.json` og `messages/en.json`:
- `roadMapPrototypeTrailerLabel`: "Eftirvagn" / "Trailer"
- `roadMapPrototypeDepartureLabel`: "Brottfarartími" / "Departure time"

## Skrár breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
  - Import: `TrailerKind` frá `@/lib/weather/question`
  - State: `trailerKind`, `departureAt`
  - `handleClearRoute`: resettar báðar
  - `handleRouteBridgeSubmit`: sendir `trailerKind` + `earliestDepartureAt`
  - Frá/Til inputs: active field ring
  - Form: ný `[Eftirvagn] [Brottfarartími]` röð

- `messages/is.json`
  - `roadMapPrototypeTrailerLabel`, `roadMapPrototypeDepartureLabel`

- `messages/en.json`
  - `roadMapPrototypeTrailerLabel`, `roadMapPrototypeDepartureLabel`

## Skrár skoðaðar

- `ai-handoff/2026-07-21-1025-todo-086-v273-codex-road-map-place-picker-hotfix.md`
- `components/weather/RoadMapPrototypeMap.tsx` (heild)
- `lib/road-intelligence/roadMapPlaces.ts`
- `app/api/teskeid/weather/travel/route.ts`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx` (trailerKind/departureAt pattern)
- `lib/weather/question.ts` (TrailerKind type)
- `messages/is.json` og `messages/en.json`

## Skipanir keyrðar

- `npm run type-check` — exit 0
- `npm run test:run -- lib/__tests__/road-intelligence-place-search-bridge.test.ts lib/__tests__/road-intelligence-road-map-places.test.ts lib/__tests__/road-intelligence-travel-bridge-map-data.test.ts`
  - 3 test files passed, 12 tests passed, exit 0

## Hvað mistókst / var sleppt

- Ekki var prófað í browser.
- `datetime-local` skilar gildi á sniðinu `"2026-07-21T14:30"` (án timezone offset). Þetta
  þýðir að server túlkar það sem UTC. Fyrir íslenska notendur er þetta rétt (Ísland = UTC
  allt árið, engin sumartímabreyting), en þetta er vert að hafa í huga ef prototype er prófað
  frá öðrum tímabeltum.
- Engin `min` attribute er sett á datetime-local input. Notandi getur valið fortíðartíma.
  Þetta er ásættanlegt í prototype; API þversagnar ekki á fortíðar-`earliestDepartureAt`.
- Eftirvagn select notar native `<select>` styling. Á iOS/Safari gæti þetta litað sig öðruvísi
  en rest of UI. Ásættanlegt í prototype.

## Áhætta / þarf að rýna

- `datetime-local` timezone: sjá að ofan. Ef Stebbi prófar úr Evrópulandi með DST gæti
  brottfarartíminn verið ranglega túlkaður.
- Trailer+departure röðin bætir við hæð á overlay panel. Á mjög litlum skjám (390px) gæti
  panelinn þakið mikið af kortinu. Sérstaklega ef suggestion listi er opinn samtímis.
- Ef Codex eða Claude bætir við fleiri reitum í framtíð (t.d. `latestArrivalBy`) þarf
  panelinn að endurhanna sig — hann er nú að þrjóta pláss.

## Route Intelligence Check

- Snertir M3A route bridge á `/auth-mvp/vedrid/road-map-prototype`.
- `trailerKind` hefur áhrif á vindmörk í `checkTravelWeather` — hjólhýsi/caravan hefur strangari
  þröskuld en bíll án eftirvagna. Þetta er sama rökfræði og í `/ferdalagid`.
- `earliestDepartureAt` hefur áhrif á ETA-útreikninga og Veðurstofan-glugga. Styttri gluggi
  ef brottfar er í nánustu framtíð.
- Engin ný route-segment, canonical corridor eða station-matching regla var bætt við.
- `IcelandRoadmap.md` þarf ekki að uppfæra.

## Design Check

- `Design.md` var ekki lesið í þessari setu (M3A-2 er form-viðbót, ekki nýtt flæði).
- Nýir reitir eru `text-sm`, `h-9` — lítið eitt minni en `h-10` Frá/Til inputs. Þetta gefur
  til kynna að þetta eru "secondary options", sem er rétt.
- Active field ring (`ring-1 ring-primary/30`) er hlutlæg og lítil — gefur til kynna án þess
  að vera áberandi.
- Engir nýir þýðanlegir UI-textar voru hardcode-aðir; allt er í message files.

## Supabase / SQL / auth / production

- Engin SQL-skrá var skrifuð eða keyrð.
- Engin Supabase tafla, policy, RLS, grant eða function breytt.
- Engin auth breyting.
- Engin env/secrets breyting.
- Enginn commit, push eða deploy.
- Production gögn og notendagögn voru ekki snert.

## Localhost checks for Stebbi

Setup:
- Dev server hjá Stebba, t.d. `http://localhost:3004`.
- Innskráður notandi með `road-intelligence-v1` feature access.
- Slóð: `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`

Próf 1: Eftirvagn select birtist og virkar
1. Opna síðuna.
2. Sjá tvo reitir neðan við Frá/Til/Reikna: "Eftirvagn" og "Brottfarartími".
3. Eftirvagn select á að vera "Enginn eftirvagn" að sjálfgefnu.
4. Opna Network tab → XHR/Fetch filter.
5. Reikna leið (Reykjavík → Akureyri) með "Enginn eftirvagn".
6. Skoða request body í `/api/teskeid/weather/travel` → `trailerKind` á að vera `"none"`.
7. Breyta í "Hjólhýsi" og reikna aftur.
8. Skoða request body → `trailerKind` á að vera `"caravan"`.
9. Niðurstaðan (Innan marka / Óþægilegt / Hættulegt) gæti breyst við caravan þar sem
   vindmörk eru strangari.

Próf 2: Brottfarartími virkar
1. Setja brottfarartíma einhvern tíma í framtíðinni, t.d. kl. 14:00 á morgun.
2. Reikna leið.
3. Skoða request body → `earliestDepartureAt` á að vera sett (`"2026-07-22T14:00"`).
4. Veðurpunktar á kortinu ættu að sýna ETA-tíma miðað við þann brottfarartíma.
5. Hreinsa brottfarartíma (eyða úr reitnum) og reikna aftur.
6. Skoða request body → `earliestDepartureAt` á EKKI að vera sett.

Próf 3: Active field ring
1. Hreinsa leið.
2. Smella í Frá-reitinn → Frá á að fá primary-lit border ring.
3. Smella á staðarheiti á kortinu → `Frá` fyllst; `Til`-reiturinn fær ringinn.
4. Smella á annað staðarheiti → `Til` fyllst.
5. Smella beint í Til-reitinn → Til fær ringinn. Frá fær venjulegan border.

Próf 4: Hreinsa
1. Reikna leið með "Hjólhýsi" og brottfarartíma.
2. Smella "Hreinsa".
3. Eftirvagn á að fara til baka í "Enginn eftirvagn".
4. Brottfarartími á að tæmast.
5. Frá/Til tæmast, kort zoomar til baka á Ísland.

Próf 5: Regression — dropdown og kortasmellur
1. Prófið v273 próf 1-4 (dropdown, Reikna án vals, kortasmellur, map regression).
2. Þessir hlutir eiga ekki að hafa brotið.

Mobile/regression sem þarf sérstaklega að horfa á:
- Panelinn er nú hærri en áður. Á 390px breidd: gengst hann þannig að kortið er ennþá
  sýnilegt að hluta? Það er ásættanlegt að panelinn taki mikið pláss á mobile í prototype.
- Suggestion listi + nýr panel-hæðaraukning á mobile: gæti verið þétt. Ekki dealbreaker.
- `datetime-local` input á iOS: native UI ætti að birtast. Þarf að vera snertileg.

## Tillaga að næsta skrefi

Tvær mögulegar leiðir eftir M3A-2:

**M3A-3 (minni)**: Bæta við `svar` (AI-texti) og `stada`-flokkun sem compact summary card
neðan við kortið frekar en ofan á það, með betri meðferð á `vedurstofanLayer` (sýna fjölda
stöðva sem voru virkar á leiðinni).

**M3B (stærri)**: Byrja á open-data route graph prototype — nota Vegagerðar road-segment
geometry til að reikna leið án Google, þannig að proto geti virkt án providers.

Stebbi velur hvort/hvað er næst.
