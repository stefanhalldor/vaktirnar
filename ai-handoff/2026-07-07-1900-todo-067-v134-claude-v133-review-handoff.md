# Handoff: todo-067 v134 - Claude rýni á v133 + framkvæmdaplan

**Date:** 2026-07-07 19:00
**From:** Claude (Sonnet 4.6)
**To:** Codex
**Branch:** main (uncommitted - v130/v131/v132 breytingar bíða commit)

---

## Markmið þessarar sendingar

Claude rýndi v133 Codex review og bætir við eigin niðurstöðum. Þetta er send til Codex til staðfestingar áður en framkvæmd hefst á v134.

---

## Phase A - Smá lagfæringar (v134)

### A1 - PlaceSearch empty-state 1-lína fix

**Skrá:** `components/weather/PlaceSearch.tsx`

Í `handleSelect` catch branch (Google fetchFields bilar) er þetta rangur kóði:

```ts
const outcome = await searchViaServer(fallbackQuery)
setSuggestions(outcome.results)
if (!outcome.ok) setFetchError(true)
else if (outcome.results.length === 0) setFetchError(true)  // RANGT
```

Þegar `ok: true` og `results.length === 0` á að vera `setNoResults(true)` ekki `setFetchError(true)`. Sama aðgreining og við innleiddum í venjulegu search flæðinu í v131.

Fix:

```ts
if (!outcome.ok) setFetchError(true)
else if (outcome.results.length === 0) setNoResults(true)
```

---

### A2 - Úrkomunivið: 2.0 → 5.0 mm/klst + dauður kóði

**Skrár:** `lib/weather/thresholds.ts`, `lib/__tests__/weather-travel.test.ts`

Núverandi staða:

```ts
travel: {
  cautionPrecipMmPerHour: 2.0,
  heavyPrecipMmPerHour: 3.0,  // <-- DAUÐUR KÓÐI
},
```

`heavyPrecipMmPerHour` er skilgreint en aldrei notað neins staðar í kóðanum. Einungis `cautionPrecipMmPerHour` er notað í `travel.ts:93`. Þetta er product gap: eitt úrkomustig (gult) en ekkert rautt.

**Breytingar:**

Valkostur A (einfaldur - aðeins laga caution):
- Breyta `cautionPrecipMmPerHour` í `5.0`
- Eyða `heavyPrecipMmPerHour` línunni (dauður kóði ruglar)
- Uppfæra tests sem nota 2.0 boundary: `lib/__tests__/weather-travel.test.ts` línur 76, 102, 599-617, 787

Valkostur B (betri UX - bæta við rauðu stigi):
- `cautionPrecipMmPerHour: 5.0` (létt rigning → gult)
- `heavyPrecipMmPerHour: 15.0` (þung rigning → rautt)
- Tengja `heavyPrecipMmPerHour` við rautt stig í `travel.ts` (líklegast nálægt línu 93)
- Uppfæra tests

**Spurning til Codex:** Er Valkostur B framkvæmanlegur í v134 scope án þess að það verði of stór breyting? Ef já, mun það gera veðurmatið miklu nákvæmara. Ef nei, A er ásættanlegt en við eigum að skrá B sem strax næsta skref.

Notendabreyting virkar áfram: `resolveThresholds` notar `overrides?.cautionPrecipMmPerHour ?? WEATHER_THRESHOLDS.travel.cautionPrecipMmPerHour` svo custom thresholds í UI eru óbreyttir.

---

### A3 - Fela "Hugmyndir" fyrir innskráða notendur

**Skrá:** `components/teskeid/TeskeidMenu.tsx`

Núverandi `AUTH_ITEMS` (lína 16-21):

```ts
const AUTH_ITEMS = [
  { href: '/auth-mvp/heim', labelKey: 'teskeidar', icon: LayoutGrid, activePrefixes: [...] },
  { href: '/auth-mvp/minn-profill', labelKey: 'profile', icon: UserCircle },
  { href: '/', labelKey: 'ideas', icon: Lightbulb },        // <-- FJARLÆGJA
  { href: '/senda-hugmynd', labelKey: 'submitIdea', icon: Send },
] as const
```

Fjarlægja `ideas` línuna úr `AUTH_ITEMS`. `Lightbulb` import er áfram í notkun í `PUBLIC_ITEMS` svo engin import-breyting.

`Senda hugmynd` (`submitIdea`) er áfram í AUTH_ITEMS - Stebbi vill halda þeim.

---

## Framkvæmdaplan sem Codex þarf að staðfesta

### Röð innan v134

1. A1 (PlaceSearch 1-lína) - mest áhættusnauð
2. A3 (Hugmyndir) - einföld
3. A2 (úrkomuþröskuldur) - þarf að staðfesta Valkost A eða B

### Tests sem þarf að uppfæra (A2)

`lib/__tests__/weather-travel.test.ts` - Codex greindi línur 76, 102, 599-617, 787 sem nota 2.0 boundary. Við þurfum að:
- Breyta assertion-gildum sem gera ráð fyrir caution við 2-4 mm/klst
- Bæta við tests sem staðfesta að 3-4 mm/klst sé nú green, ekki yellow
- Ef Valkostur B: bæta við tests fyrir heavy/rautt stig

---

## Framtíðarfasar (EKKI v134)

### Phase B - Route alternatives (v135)

**Lykilatriði sem Codex þarf að hafa í huga:**

Route picker VERÐUR að vera text-first. Við byggjum v130 resilience vegna þess að Google Maps JS bilar í production. Ef route picker krefst interactive map er vandinn kominn aftur.

Text-first UI (án map):
```
Stysta leið    188 km · 2 klst 10 mín   [Velja]
Önnur leið     220 km · 2 klst 35 mín   [Velja]
```

Interactive map sýnir leiðirnar þegar hann hleðst - en notandinn getur valið án hans.

Aðrar kröfur:
- `computeAlternativeRoutes: true` í Routes API body (Basic SKU, engin aukakostnaður - staðfest í v067 handoffs)
- Google skilar ekki alltaf alternatives. Þegar bara ein leið kemur: "Fundin ein leið. Staðfestu til að reikna veður." - enginn tómur picker
- Bæta við `getRouteOptions` í `provider.types.ts` (halda `getRouteGeometry` í bili)
- `RouteOption` type: `RouteGeometry & { id: string; routeIndex: number; source: 'google' }`
- State: ef notandi breytir Frá/Til, hreinsa valda leið og veðurniðurstöður

### Phase C - Vestmannaeyjar / Herjólfur (v136)

**Textajafngreiðsla er of víð** - `name.includes('Heimaey')` gæti slegið við staði eins og "Heimaey Guesthouse, Akureyri". Nota coordinates: ef destination er innan Vestmannaeyjar bounding box (lat 63.3-63.5, lon -20.4 til -20.1) þá er þetta eyjuáfangastaður.

Vantar í Codex-tillögu: Landeyjahöfn lokar reglulega vegna öldugengis. Bæta við: "Athugaðu opnunartíma Herjólfs áður en þú leggur af stað."

### Phase D - Saved places (v137)

**`usage_kind = 'both'` schema vandamál.** Ef notandi notar Reykjavík sem `from` (→ row), svo sem `to` (→ row), hvernig verður þetta `both`? Þarf sérstaka upsert-logic.

Einfaldara: Enginn `'both'`. Tvær rows: `from` og `to`. Sýna top-5 per field. Ef sömu staður er í báðum listum, birtist hann í báðum - eðlilegt.

Unique constraint: nota `place_id` (Google gefur hann) þegar til staðar, lat/lon sem fallback. `unique (user_id, usage_kind, place_id)` er stöðugra en `unique (user_id, usage_kind, lat, lon)`.

### Phase E - Login UI clarity (v138)

**Stebbi staðfesti**: Enginn hlekkur í email. 6-stafa kóði í email er endanlegt. Phase E er EINGÖNGU UI-skýrleiki:

- Skýrari texti: "Sláðu inn netfangið þitt. Við sendum þér 6 stafa kóða. Þú þarft ekki lykilorð."
- Sýna target-email á kóðaskjá
- "Athugaðu ruslpóst ef kóðinn kemur ekki"
- Auto-submit þegar 6 tölustafir eru slegnir inn (sýna loading, leyfa endursendingu ef villa)
- Betra resend/breyta-email UI

Engin breyting á backend. `request-code` og `verify-code` routes eru óbreyttir.

---

## Spurningar til Codex

1. **A2 Valkostur A eða B?** Valkostur B (bæta við rauðu úrkomu-stigi) er betri UX en stærra scope. Rétt að gera báðar breytingar í v134 eða skipta?

2. **Phase B map degradation**: Codex-tillaga lýsir mini route preview á interactive map. Hvernig á þetta að virka þegar Google JS er óaðgengilegt? Tillaga Claude: text-first (distance + duration) sem primary UI, map sem sjónræn aukning.

3. **Vestmannaeyjar detection**: Coordinate-based vs. string-based - er bounding box nálgunin sem Claude leggur til framkvæmanleg án of mikils overhead?

---

## Stada á kóða

Allar breytingar frá v130-v132 eru uncommitted. v134 breytingar koma ofan á þær í sama commit eða aðskildum commit - allt eftir hvað Codex mælir með.

Baseline tests: 1769 passed / 27 skipped / 8 todo (54 files).
