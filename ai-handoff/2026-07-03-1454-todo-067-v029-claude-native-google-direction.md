# TODO #67 Vedrid - Native app, Google Maps, og map confirmation direction

Created: 2026-07-03 14:54
Timezone: Atlantic/Reykjavik
From: Claude Code (Sonnet 4.6)
To: Stebbi og Codex
Status: Stefnuhandoff — fangar ákvarðanir úr samtali Stebba og Claude Code. Engin kóðavinna, SQL, env, Supabase, commit, push, deploy eða production breytingar gerðar.

---

## Ákvarðanir skráðar

Stebbi staðfesti eftirfarandi í samtali 2026-07-03:

| Atriði | Ákvörðun |
|--------|----------|
| App mode | **Capacitor** — wrappar núverandi Next.js app |
| Provider | **Google Maps Platform** — Google Cloud billing til staðar |
| Map confirmation | Static map mynd + Places Autocomplete leit |
| Manual pin | Ekki í MVP. Notandinn leitar og velur þekktan stað í nágrenninu |
| Geocoding cache | `places.ts` first, Google Geocoding fyrir óþekkt staðarheiti (live, ekki cached) |
| Geocoding geymsla | Ekki persistent í Phase 2. Aðeins places.ts entries eru curated gögn |

Þetta eru planning-ákvarðanir, ekki framkvæmdarleyfi. Engin kóðavinna hefst fyrr en Stebbi gefur skýrt og afmarkað framkvæmdarleyfi.

---

## Capacitor — hvað það þýðir í reynd

**Gott:** Allt sem er þegar skrifað lifir.
- `lib/weather/` — óbreytt
- `app/auth-mvp/vedrid/` — óbreytt
- Supabase auth, API routes, messages, tests — allt lifir
- Capacitor wrappar Next.js í native shell

**Þarf skoðun síðar (ekki Phase 2):**
- Supabase session/cookie handling í Capacitor WebView — öðruvísi en í browser, þarf test
- Deep links (t.d. OAuth redirect eftir login)
- App icons, splash screens, store metadata
- Push notifications — sérstakt verkefni

**Mæling:** Capacitor setup er ekki hluti af Phase 2 (veður). Það er sérstakt verkefni sem getur farið samhliða eða strax eftir Phase 2A. Veðurkóðinn þarf ekkert breytingar vegna Capacitor.

---

## Google Maps Platform — tveir lyklar, tvær notkunarlegar

### Lykill 1: Server-side (secret)
`GOOGLE_MAPS_SERVER_KEY` — aldrei í browser, aldrei í `NEXT_PUBLIC_*`

Notað fyrir:
- Google Geocoding API (leysa staðarheiti → koordinaður)
- Google Routes API (route geometry + duration)
- Google Static Maps API (staðfestingarmyndin)

### Lykill 2: Browser-restricted (public)
`NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` — sýnilegur í browser, **þarf að takmarka** í Google Cloud Console:

- Takmarka á domain: `teskeid.is`, `*.teskeid.is`, `localhost` (development)
- Þegar Capacitor er komið: takmarka á app bundle ID líka
- Notað fyrir: Places Autocomplete leit í leiðréttingarflæðinu, Map display (ef við sýnum kort)

**Mikilvægt:** Þessir tveir lyklar þarf Stebbi að búa til í Google Cloud Console og setja í `.env.local` og Vercel env vars áður en route/map checkpoint getur verið prófað.

---

## Map confirmation flæði — nákvæmt scope

### Tilfelli 1: Staðurinn leystur af places.ts (kunnugur staður)

```
Notandi: "Er mér óhætt að keyra með hjólhýsi frá Reykjavík að Apavatni?"

Teskeid: [Static map mynd: pin á Reykjavík, pin á Apavatni]
         Frá: Reykjavík
         Til: Apavatn
         [Já, þetta er rétt] [Nei, breyta]
```

Ef "Já": heldur áfram í route weather.
Ef "Breyta": fer í leiðréttingarflæðið (sjá neðar).

Þar sem báðir staðir eru í `places.ts` þarf **engin Google API köll** í þetta tilfelli — aðeins Static Maps mynd.

---

### Tilfelli 2: Staðurinn ekki þekktur (ekki í places.ts)

```
Notandi: "Er mér óhætt að keyra með hjólhýsi frá Reykjavík að Húsavík?"

Teskeid: Þetta staðarheiti þekki ég ekki nákvæmlega.
         Leitaðu að staðnum:
         [Leitarbox: "Húsavík..."]

         → Google Places Autocomplete → sýnir candidates:
           • Húsavík, Norðurþing
           • Húsavíkurkirkja, Húsavík
           • Húsavík Whale Museum

         Notandi velur: "Húsavík, Norðurþing"

         [Static map mynd: pin á Húsavík]
         Til: Húsavík, Norðurþing
         [Já, þetta er rétt] [Leita aftur]
```

Google Places Autocomplete → notandinn velur → Static map mynd til staðfestingar.

---

### Tilfelli 3: Staðurinn rangur (places.ts fann rangan stað)

```
Notandi: "Veðrið á Grafarlandi í dag?"

Teskeid: [Static map mynd: pin á Grafarlandi í Reykjavík]
         Grafarlandi, Reykjavík
         [Já, þetta er rétt] [Nei, breyta]

Notandi: "Nei, breyta"

Teskeid: [Leitarbox: "Grafarlandi..."]
         → Places Autocomplete → candidates
         → Notandi velur réttan stað
         → Nýtt static map til staðfestingar
```

---

### Tilfelli 4: Golf

```
Notandi: "Hvenær er best að spila golf í Grafarholti á morgun?"

Teskeid: [Static map mynd: pin á Grafarholt golfvelli]
         Grafarholt golfvöllur, Reykjavík
         [Já, þetta er rétt] [Breyta]
```

Engin route-line. Einn pin. Einfalt.

---

## Tæknileg uppbygging map confirmation

### Server-side (secret key)
```
lib/weather/google.server.ts
  geocodePlace(query) → { lat, lon, displayName } | null
  getRouteGeometry(from, to) → RouteGeometry | null
  staticMapUrl(pins, route?) → string  // URL til að senda client
```

Static map URL er búin til server-side og send til client sem venjuleg mynd-URL. Lykillinn er **aldrei** sendur til browser — aðeins myndin.

### Client-side (browser key)
Places Autocomplete leit þegar notandinn vill leiðrétta. Þetta notar Google Places JS library eða `@googlemaps/js-api-loader` í browser.

Leitarbox → Places Autocomplete → notandinn velur candidate → server fær staðarsíðan og reiknar static map URL.

### Engin map rendering library í Phase 2
Við notum **Static Maps API** (myndir) fyrir staðfestingu, ekki full interactive map. Þetta þýðir:
- Engin `google-maps-react`, engin `@googlemaps/react-wrapper`
- Aðeins `@googlemaps/js-api-loader` (eða vanilla script tag) fyrir Places Autocomplete leit
- Mun léttara dependency footprint

---

## Google API kostnaður — mat

| API | Ókeypis | Eftir það |
|-----|---------|-----------|
| Static Maps | 100,000 req/mánuð | $2/1000 |
| Geocoding | 40,000 req/mánuð | $5/1000 |
| Routes (Essentials) | 10,000 req/mánuð | ~$10/1000 |
| Places Autocomplete | 10,000 sessions/mánuð | $17/1000 sessions |

Við MVP-umfang Teskeid (hundruð users, ekki þúsundir) er þetta vel innan $200/mánuð free credit á Google Cloud. Routes API er dýrast — 10,000 free er tiltölulega lítið ef við vöxumst. En það er ekki vandinn núna.

---

## Uppfærður phase plan

### Phase 2A1 — Intent + golf + route skeleton (engir Google API lyklar þarf)

- `detectIntent`: + `activity_window_golf` + `route_towable_trailer`
- `extractGolfPlace`, `extractTrailerKind`, `extractRouteOrigin`, `extractRouteDestination`
- `checkGolfWindow` tool (sliding window, best slot + alternatives)
- Route intent: þekkist en skilar `needs_place_confirmation` state þangað til staður er staðfestur
- Golf-specific `places.ts` aliases (Grafarholt golfvöllur o.fl.)
- Bæta Apavatn, Húsavík og fáeinum fleiri við `places.ts` handvirkt
- Messages: golf svör, route disclaimer, "staður óþekktur" textar
- Tests: golf evaluator, intent detection, regression (grill)

**Google API lyklar þarf EKKI til að prófa Phase 2A1.** Golf virkar af `places.ts` og met.no einu saman.

---

### Phase 2A2 — Google provider adapter + map confirmation (krefst Google lykla)

Stebbi þarf að hafa sett upp báða Google lykla í `.env.local` og Vercel áður en þetta getur verið prófað.

- `lib/weather/google.server.ts`: `geocodePlace`, `getRouteGeometry`, `staticMapUrl`
- Map confirmation UI component (static map mynd + confirm/change buttons)
- Places Autocomplete leitarbox (correction flow)
- `checkTrailerRouteWeather` tool: places.ts first → Google Geocoding → route geometry → met.no sampling → worst-case
- Tests: mocked Google API responses, provider failure paths, unknown place flow

---

### Phase 2A3 — Combined pre-release

Phase 1 + Phase 2A1 + Phase 2A2 saman til localhost prófunar.

Grill, golf, route, map confirmation, flags, AI fallback — allt prófað saman áður en farið er í production.

---

### Capacitor setup (sérstakt verkefni, samhliða eða eftir Phase 2A)

- `npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android`
- `capacitor.config.ts` setup
- `npx cap add ios` / `npx cap add android`
- Test auth flow í Capacitor WebView
- App icons, splash screens
- App Store / Play Store developer accounts og metadata

Þetta kemur í sérstaka handoff þegar veðurhlutinn er kominn.

---

## Hvað þarf frá Stebba áður en framkvæmd getur byrjað

### Fyrir Phase 2A1 (golf, engin Google API):
- [ ] Framkvæmdarleyfi: "Claude Code, framkvæmdu Phase 2A1"
- [ ] Staðfesting: hvaða golf courses á að bæta við `places.ts`? (Grafarholt er þegar þar)
- [ ] Staðfesting: hvaða ferðamannastaðir í `places.ts`? (Apavatn, fleiri?)

### Fyrir Phase 2A2 (Google API, map confirmation):
- [ ] Google Cloud: `GOOGLE_MAPS_SERVER_KEY` búinn til og sendur (eða settur í .env.local)
- [ ] Google Cloud: `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` búinn til, takmarkaður á teskeid.is og localhost
- [ ] Framkvæmdarleyfi: "Claude Code, framkvæmdu Phase 2A2"

### Fyrir Capacitor:
- [ ] Apple Developer account ($99/ár) ef App Store er markmið
- [ ] Google Play account ($25 einu sinni) ef Play Store er markmið
- [ ] Sérstakt framkvæmdarleyfi fyrir Capacitor setup

---

## Localhost checks for Stebbi

### Phase 2A1 (golf, engin Google API þarf)
1. Golf þekktur staður:
   - `Hvenær er best að spila golf í Grafarholti á morgun?`
   - Expected: best tímagluggi + alternatives, vindur/úrkoma/hitastig rökstuðningur. 10-11 m/s er ekki sjálfkrafa rautt.
2. Golf óþekktur staður:
   - Golfvöllur sem er ekki í `places.ts`
   - Expected: "þetta staðarheiti þekki ég ekki" — ekkert hallucinated veðurmat
3. Route intent (án Google lykils):
   - `Er mér óhætt að keyra með hjólhýsi frá Reykjavík að Apavatni?`
   - Expected: "staðfesting þarf" eða "route provider ekki stilltur" — ekkert fake route weather
4. Grill regression:
   - `Er grillveður í Mosó í kvöld?`
   - Expected: virkar eins og Phase 1

### Phase 2A2 (Google API, map confirmation)
5. Map confirmation, þekktur staður:
   - Route með Reykjavík og Apavatn
   - Expected: static map mynd með tveimur pinna, confirm buttons
6. Map confirmation, óþekktur staður:
   - Route með stað sem er ekki í `places.ts`
   - Expected: Places Autocomplete leitarbox opnar, notandinn velur, static map sýnd
7. Map confirmation, leiðrétting:
   - Þegar staður lítur rangur út → "Breyta" → leit → nýr staður valinn
   - Expected: nýr static map til staðfestingar
8. Secrets:
   - DevTools network tab: `GOOGLE_MAPS_SERVER_KEY` sést aldrei í browser requests
   - `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` er restricted og virkar aðeins á teskeid.is og localhost
9. Mobile (360, 390, 460 px):
   - Map confirmation er readable, buttons reachable, engin overflow
   - Places Autocomplete leitarbox zoom-ar ekki á mobile (16px font)
10. Provider failure:
    - Slökkt á Google lykli eða rangt → skýr "get ekki leyst staðinn" svar, ekkert crash

### Ekki prófa:
- High-volume leit loops gegn Google billing
- Production secrets í dev tools
- Mapbox og Google blönduð (við notum Google only)

---

## Óvissa / þarf að staðfesta

- **Google Places Autocomplete session billing:** Sessions eru $17/1000. Ef notandinn skrifar langa leit án þess að velja þarf að passa að session model sé rétt implementað. Google reiknar session sem leitarbox-opnun til vals. Claude Code þarf að nota session tokens rétt.
- **Google Static Maps í Capacitor WebView:** Líklega virkar eins og í browser (venjuleg mynd-request) en þarf staðfestingu í test.
- **Google Routes API free tier:** 10,000/mánuð er tiltölulega lítið. Ef Teskeid vex hratt getur þetta orðið kostnaðarmál. Mæling: cach-a EKKI route geometry í Phase 2, endurskoðum þegar við sjáum raunverulegan traffic.
- **Confidence: high** á Capacitor + Next.js — þetta er vel þekkt pattern og virkar vel.
- **Confidence: medium** á Google Places Autocomplete session billing — þarf að lesa Google docs nánar við implementation.
