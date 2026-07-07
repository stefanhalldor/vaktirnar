# TODO #67 Vedrid - Phase 2B shipped

Created: 2026-07-05 21:05
Timezone: Atlantic/Reykjavik
From: Claude Code (Sonnet 4.6)
To: Stebbi og Codex
Status: Handoff — Phase 2B framkvæmt. Engar production env breytingar, commit eða push gerðar.

---

## Skilningur á samþykki

Stebbi samþykkti afmarkaða kóðabreytingu fyrir Phase 2B Ferðalagið MVP í v050 handoff með
"Skoðaðu workflow og svo máttu fara í framkvæmd á 2b".

Þetta felur í sér UI/API/helper/test/message breytingar sem þarf til að gera Ferðalagið nothæft á
localhost. Þetta felur EKKI í sér commit, push, deploy, production env breytingar, Supabase
migration, SQL keyrslu, Google billing/key setup eða dev-server restart.

---

## Staða

Phase 2B er **lokið. `npm run type-check` tóm (engar villur). 51 test files, 1631 prófanir, ekkert
brotið.**

---

## Hvað var gert

### 1. `LodgingKind` type bætt við `lib/weather/types.ts`

```ts
export type LodgingKind = 'none' | 'tent' | 'tent_trailer' | 'folding_camper' | 'caravan' | 'indoor' | 'other'
```

### 2. `lib/weather/travel.ts` — `checkTravelWeather()` deterministic tool

Nýr helper sem metur veðurmál á:
- **Brottferðarlegg**: `departureAt` → `departureAt + durationS`
- **Dvöl á áfangastað**: arrival → `returnDepartureAt` (ef outdoor gisting)
- **Heimferðarlegg**: `returnDepartureAt` → `returnDepartureAt + durationS` (ef sett)

**Eftirvagnsþröskuldar (driving legs, same as Phase 2A3):**
- cautionWindMs=13, redWindMs=18, redGustMs=25

**Tjaldþröskuldar (tent lodging only):**
- cautionWindMs=6, redWindMs=10

**Hjólhýsi/karavan/tjaldvagn/fellihýsi gisting**: notar sömu þröskulda og caravan driving.

**latestHomeBy check**: ef sett og heimkoma er seinna → bætt við facts.

**horse_trailer caveat** í facts ef við á.

**Disclaimer** alltaf í facts.

### 3. `app/api/teskeid/weather/travel/route.ts` — Structured endpoint

`POST /api/teskeid/weather/travel` — tekur við `TravelWeatherRequest`:
- `origin`, `destination`: ConfirmedPlace (server-side validate coords + name)
- `departureAt`: required ISO string
- `returnDepartureAt?`, `latestHomeBy?`: optional ISO
- `trailerKind`, `lodgingKind`: enum validated

Server validates:
- lat/lon eru tölur og innan Íslands (validateIcelandicCoords)
- name er non-empty
- departureAt er valid
- return/latestHomeBy eru logical ef sett (return > departure, latestHomeBy > return)
- enum gildi eru þekkt

Provider check → getRouteGeometry → weather point sampling (max 15) → parallel forecasts → checkTravelWeather.

**Engin candidates[0] geocoder gissing.** Coordinates koma alltaf frá notanda (PlaceSearch) eða
curated lista.

### 4. `app/auth-mvp/vedrid/FerdalagidClient.tsx` — 5-step wizard

Skiptir algerlega út VedridClient. Engin prompt box, engin grill/golf UI, ekkert chat.

**Step flow:**
1. **Origin** — PlaceSearch → text confirmation card + "Áfram"
2. **Destination** — PlaceSearch → text confirmation card + "Til baka" / "Áfram"
3. **Times** — `datetime-local` inputs (brottför required, heimferð + latestHomeBy optional)
4. **Trailer** — button group (6 options, default: none)
5. **Lodging** — button group (7 options, default: none) + "Skoða veður" submit

**Result step:** loading state → stada + svar + suggestedAction + "Af hverju?" disclosure + facts.
- Error path: shows error + "Til baka" button (back to lodging to fix + retry)
- Success path: shows result + "Byrja aftur" button

**datetime-local handling:** Iceland = UTC+0 year-round. `"YYYY-MM-DDTHH:MM"` + `":00Z"` = valid
UTC ISO string. Sent to server as-is.

**Mobile:** font-size 16px on all inputs (no zoom). No horizontal overflow. Buttons are full-width
except "back" buttons.

**Provider not configured / route unavailable / forecast unavailable:** all show friendly IS/EN
error messages from messages files. No crash.

### 5. `app/auth-mvp/vedrid/page.tsx` — switched to FerdalagidClient

```ts
import { FerdalagidClient } from './FerdalagidClient'
// ...
return <FerdalagidClient />
```

VedridClient er enn til en er ekki lengur sýnilegur í app.

### 6. Messages

`teskeid.vedrid.ferdalagid` bætt við bæði `messages/is.json` og `messages/en.json`:
- Step titles, field labels, trailer/lodging option labels
- "Áfram", "Til baka", "Skoða veður", "Sæki veðurspá...", "Byrja aftur"
- 5 error string keys

### 7. `lib/__tests__/weather-travel.test.ts` — 17 prófanir

| Flokkur | Prófanir |
|---------|----------|
| No trailer, calm → graent | 2 |
| Caravan thresholds (caution, red wind, red gust, precip) | 4 |
| Worst-case across route points | 1 |
| Tent lodging (caution, red, indoor skipped) | 3 |
| Return leg triggers rautt | 1 |
| latestHomeBy warning | 2 |
| Special cases (no_data, horse_trailer, disclaimer, result shape) | 4 |

---

## Skrár breyttar

| Skrá | Breyting |
|------|----------|
| `lib/weather/types.ts` | `LodgingKind` type bætt við |
| `messages/is.json` | `teskeid.vedrid.ferdalagid.*` lyklar |
| `messages/en.json` | `teskeid.vedrid.ferdalagid.*` lyklar |
| `app/auth-mvp/vedrid/page.tsx` | `VedridClient` → `FerdalagidClient` |

## Skrár búnar til

| Skrá | Lýsing |
|------|--------|
| `lib/weather/travel.ts` | `checkTravelWeather()` deterministic tool |
| `app/api/teskeid/weather/travel/route.ts` | Structured `/travel` endpoint |
| `app/auth-mvp/vedrid/FerdalagidClient.tsx` | 5-step Ferðalagið wizard |
| `lib/__tests__/weather-travel.test.ts` | 17 tests |

---

## Skipanir keyrðar

| Skipun | Exit code |
|--------|-----------|
| `TZ="Atlantic/Reykjavik" date "+%Y-%m-%d %H:%M"` | 0 |
| `npx tsc --noEmit` | 0 (engar villur) |
| `npm test -- lib/__tests__/weather-travel.test.ts` | 0 (17/17 passed) |
| `npm test` | 0 (1631/1631 passed, 51 test files) |

---

## Ákvarðanir teknar

**1. PlaceConfirmation án static map í wizard.** Static map URL kemur frá server í gamla /ask
flæðinu. Í nýja wizard flæðinu eru places valin af notanda beint — ekki þörf á extra API call bara
til að sýna kort í wizard. Notandinn sér nafn + formatted address í confirmation card.

**2. VedridClient ósnertur (heldur áfram að vera til).** Aðeins `page.tsx` var uppfært. VedridClient
er fallback ef þarf að kveikja á gamla flæðinu síðar.

**3. Iceland = UTC+0 alltaf.** `datetime-local` value + `:00Z` → valid UTC ISO. Ekkert timezone
flækjuverk þarf.

**4. Outdoor lodging stay aðeins ef returnDepartureAt er sett.** Ef enginn returnDepartureAt →
engin dvöl í útreikningi. Rökrétt: ef enginn heimferð, er ekki hægt að reikna stay window.

**5. `trailerKind: 'none'` → engin driving threshold.** Þegar engin eftirvagn er valinn skilar
eval alltaf graent á drivinglegg. Veðurmat er þá bara upplýsandi (facts) en hefur ekki áhrif á
stöðuna.

**6. GolfWindow/Grill UI algerlega falin.** Aðeins `FerdalagidClient` er rendered í page.tsx.
Grill/Golf virkni er enn til í codebase (tools.ts, ask/route.ts) en er óaðgengileg frá UI.

---

## Áhætta sem er enn til staðar

1. **`/api/teskeid/weather/ask` route helst áfram.** Gamla route-branch í `/ask` velur enn
   `candidates[0]` fyrir óþekktan origin/destination ef curated list mistekst. Þetta er ekki
   notendaútsett lengur frá nýja Ferðalagið UI, en routeinn er enn virk. Ætti að verða addressed
   í Phase 2C eða remove route-branch.

2. **Google Maps API lyklar ekki settir upp á localhost.** `WEATHER_MAP_PROVIDER=google` með réttum
   lyklum þarf til að prófa endanleg flæði. Án þess skilar `/travel` `provider_not_configured`
   eða `route_unavailable`. Ferðalagið UI sýnir friendly error.

3. **PlaceSearch krefst `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`.** Án þess keyrir PlaceSearch en
   kemst ekki í Google API. Notandi sér loading state án suggestions.

4. **Return leg "no_data" → gult.** Ef forecast nær ekki yfir return tíma → gult stöðu. Þetta er
   viljandi (conservative) en gæti verið ruglingslegt ef notandi velur heimferð langt fram í tímann.
   Má addressa í Phase 2C með betri skilaboð.

---

## Supabase / production / billing

Engar Supabase breytingar, engar SQL breytingar, keyrði enga migration, breytti engum RLS
policies, auth, grants, functions, secrets, Vercel env, production stillingum eða billing.

Engar production env breytingar, engar commit, engar push, engin deploy.

---

## Localhost checks for Stebbi

**Forsendur:** `WEATHER_MAP_PROVIDER=google` með Google Maps API lyklum í `.env.local`, og
notandi með `vedrid` feature access.

1. Opna `/auth-mvp/vedrid` sem notandi með `vedrid` aðgang.
2. Staðfesta að sést AÐEINS Ferðalagið wizard — engin prompt box, engin Grill/Golf val,
   engin "Aðrar spurningar", engin chat UI.
3. **Skref 1 (origin):** Slá inn "Reykjavík" → sjá suggestions → velja "Reykjavík, Iceland".
   Staðfesta að confirmation card sýni nafn og formatted address.
4. Smella "Áfram" → komast í skref 2 (destination).
5. **Skref 2 (destination):** Sjá mini summary "Frá: Reykjavík" efst. Slá inn "Akureyri" →
   velja → confirmation card.
6. Smella "Áfram" → skref 3 (tímar).
7. **Skref 3 (tímar):** Sjá route summary "Reykjavík → Akureyri". Fylla inn brottfarardag/-tíma.
   Staðfesta á mobile: input zoom-ar EKKI (font-size 16px). Skilja heimferð og latestHomeBy tómt.
8. Smella "Áfram" (disabled ef brottför tómt) → skref 4 (eftirvagn).
9. **Skref 4 (eftirvagn):** Velja "Hjólhýsi / karavan" → sjá highlighted button.
10. Smella "Áfram" → skref 5 (gisting).
11. **Skref 5 (gisting):** Velja "Tjald" → smella "Skoða veður".
12. Staðfesta að UI fari strax í result step og sýni loading ("Sæki veðurspá...").
13. **Niðurstaða:** Sjá stöðu (graent/gult/rautt), `svar` texta, og "Suggestað aðgerð" ef við á.
14. Smella "Af hverju?" → sjá facts lista (leið, vindur per legg, hestakerra ef við á, disclaimer).
15. Smella "Byrja aftur" → komast aftur í skref 1 með tómt form.
16. **Prófa tímaröðun:** Fylla inn heimferð FYRR en brottför → staðfesta villumeldingu frá server
    (`errorTimesInvalid`).
17. **Prófa án lykla:** Fjarlægja `WEATHER_MAP_PROVIDER` eða setja `WEATHER_MAP_PROVIDER=none` →
    staðfesta að result step sýni friendly "Veðurspá á leiðinni er í þróun" villu, ekki crash.
18. **Mobile layout:** Staðfesta ekkert horizontal scroll, buttons eru full-width, engin overlap.
19. **Hestakerra:** Velja "Hestakerra" sem eftirvagn → staðfesta að facts innihaldi hestakerra
    caveat.
20. **Útigisting:** Velja "Tjald" sem gisting + setja heimferð → ef veður er gott á þeim tíma
    ætti stöðan aðeins að taka tillit til tjaldþröskulda (gult ef vindur >= 6 m/s).

Ekki prófa production, Vercel env, Google billing, Supabase migrations, RLS, auth policy
breytingar eða notendagögn í tengslum við Phase 2B nema Stebbi gefi sérstakt leyfi.

---

## Næsta skref

**Phase 2C** — mögulegar framtíðarítrekarnir:
- "Finndu góðan stað" discovery (var skráð non-goal í Phase 2B)
- Supabase admin provider toggle (var skráð non-goal í Phase 2B)
- Fjarlægja/fela gamla `/ask` route-branch í `/api/teskeid/weather/ask` (candidates[0] gissing)
- Commit Phase 2A1-2B þegar Stebbi er sáttur
