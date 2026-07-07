# TODO #67 Vedrid - Ferðalagið implementation plan

Created: 2026-07-05 20:20
Timezone: Atlantic/Reykjavik
From: Claude Code (Sonnet 4.6)
To: Stebbi og Codex
Status: Plan handoff — engar kóðabreytingar. Bíður eftir framkvæmdarleyfi.

---

## Grunnur: hvað er í spilinu

### Stebbi vill (úr samtal 2026-07-05):
1. Ferðalagið sem aðalupplifun (v046 samþykkt)
2. "Finndu góðan stað innan X km" leit
3. Supabase admin toggle til að skipta á milli Google Maps og Mapbox

### v046 (Codex) segir um 2 og 3:
> Non-goals now: "Finndu góðan stað", Supabase admin provider toggle.

Þarf ákvörðun á þessum tveimur. Greining hér að neðan.

---

## Um "Finndu góðan stað innan X km"

Þetta er **discovery feature** — allt önnur vara en Ferðalagið. Ferðalagið er "ég veit hvert ég er að fara, er veðrið gott?". Discovery er "hvar á ég að fara?".

**Tæknilegt:** Krefst Google Places Nearby Search API (annar endpoint en það sem við höfum). Nýr server adapter í `google.server.ts`, nýtt UI flæði, nýr deterministic tool.

**Tillaga:** Framkvæma **eftir** Ferðalagið MVP. Ástæður:
- Ferðalagið MVP er 60-70% af vinnu — það á ekki að þeyja sig
- Discovery þarfnast sér UX hugsunar (radius, category, filters) sem er ekki tilbúin
- Google Nearby Search er annað billing scope — þarf sér quota cap

Discovery gæti orðið Phase 2C. Ferðalagið er Phase 2B.

**Spurning til Stebbi og Codex:** Er þetta í lagi að vísa í Phase 2C, eða á Discovery að fylgja Ferðalaginu í sömu útgáfu?

---

## Um Supabase admin provider toggle

Þetta er **lítið og nytsamlegt** — hægt að gera samhliða Ferðalaginu án þess að seinka.

**Hugmynd:** Ný tafla `app_settings` í Supabase. Lykill `weather_map_provider` með gildi `'google'`, `'mapbox'` eða tómt. `getWeatherMapProvider()` les fyrst úr DB, faller á env var.

**Kostir:**
- Engin endurræsing þarf til að skipta provider
- Mapbox getur bæst við síðar án code deploy
- Admin hefur stjórn á þessu líkt og feature_access

**Áhætta:** Provider.server.ts þarf að verða `async` (les úr DB). Þetta kallar á breytingar á öllum API route.ts sem kalla `getWeatherMapProvider()`. Tveir staðir núna: `/ask` og `/travel` (nýr). Handanlegt.

**Tillaga:** Framkvæma sem hluta af Phase 2B.

---

## Fasaskipting

### Phase 2A4 — v043 blockers (lítið, þarf að gera fyrst)

Þessa lagfæringar þarf áður en við höldum áfram. Taka um ~45 mín.

1. **googleMaps.client.ts**: `new Loader()` → `{ setOptions, importLibrary }` functional API
2. **Strict sampling caps**: `samplePoints` og route subsampling → `slice(0, maxPoints)` eftir append
3. **Textar í messages**: PlaceSearch og MapConfirmation → `messages/is.json` + `en.json`
4. **`npm run type-check`**: á að vera grænt eftir þetta

### Phase 2B — Ferðalagið + admin toggle

Þetta er aðalvinna. Sjá nákvæmar skrár og test plan hér að neðan.

### Phase 2C — Discovery

"Finndu góðan stað" — kemur eftir Phase 2B.

---

## Phase 2B — Nákvæmar skrár

### Nýjar skrár

| Skrá | Lýsing |
|------|--------|
| `app/api/teskeid/weather/travel/route.ts` | Nýr structured endpoint, tekur `TravelWeatherRequest` |
| `lib/weather/travel.ts` | `checkTravelWeather()` deterministic tool |
| `app/auth-mvp/vedrid/FerdalagidClient.tsx` | Step wizard UI |
| `sql/69_app_settings.sql` | `app_settings(key, value, updated_at)` tafla |
| `app/api/admin/weather-settings/route.ts` | Admin API: GET/PUT provider setting |
| `lib/__tests__/weather-travel.test.ts` | Prófanir á checkTravelWeather |

### Breyttar skrár

| Skrá | Breyting |
|------|----------|
| `app/auth-mvp/vedrid/page.tsx` | Nota `FerdalagidClient` í stað `VedridClient` |
| `lib/weather/provider.server.ts` | `getWeatherMapProvider()` verður `async`, les úr DB fyrst |
| `app/api/teskeid/weather/ask/route.ts` | `await getWeatherMapProvider()` |
| `messages/is.json` + `messages/en.json` | Ferðalagið strings, PlaceSearch/MapConfirmation strings |
| `app/(admin)/admin/page.tsx` | Bæta við weather provider toggle section |

### Skrár sem breytast EKKI

`metno.server.ts`, `forecast.ts`, `thresholds.ts`, `coords.ts`, `places.ts`, `provider.types.ts`, `google.server.ts` (nema sampling fix í 2A4), `tools.ts` — allt endurnýtt.

---

## TravelWeatherRequest data model

```ts
type ConfirmedPlace = {
  name: string
  lat: number
  lon: number
}

type TravelWeatherRequest = {
  origin: ConfirmedPlace          // required, server-validated
  destination: ConfirmedPlace     // required, server-validated
  departureAt: string             // ISO, required
  returnDepartureAt?: string      // ISO, optional
  latestHomeBy?: string           // ISO, optional
  trailerKind?: 'none' | 'tent_trailer' | 'folding_camper' | 'caravan' | 'horse_trailer' | 'generic_trailer'
  lodgingKind?: 'none' | 'tent' | 'tent_trailer' | 'folding_camper' | 'caravan' | 'indoor' | 'other'
}
```

Server validate-ar öll coords (`validateIcelandicCoords`), tímastreng (`isValidISO`), og enum gildi.

---

## `checkTravelWeather()` deterministic tool

**Input:** origin + destination coords, route points, time window, trailerKind, lodgingKind

**Output:** `DeterministicResult` með:
- Útleið: worst-case yfir route punkta á `departureAt` +/- ferðatíma
- Dvöl (ef gisting úti): veður á áfangastað á gistutíma
- Heimleið (ef `returnDepartureAt` gefið): worst-case á heimleiðinni
- Heildarstaða: versta staða af þessum þáttum
- facts[]: hvað réði niðurstöðunni, hversu marga punkta skoðað
- Disclaimer alltaf: "Þetta er veðurmat, ekki umferðar- eða farartrygging."

**Lodging rules (einfaldar í MVP):**
- `tent` / `tent_trailer` / `folding_camper` / `caravan`: same vind/rigning threshold og trailer route
- `indoor`: enginn sérstakur veðurþáttur fyrir dvöl (veðrið á leiðinni skiptir máli, ekki í hótel)

---

## FerdalagidClient step wizard

5 skref (svipað og v046 leggur til):

```
1. Staðir
   - "Hvaðan?" → PlaceSearch eða curated list val
   - "Hvert?" → PlaceSearch eða curated list val
   - Báðir staðir staðfestir áður en farið í skref 2

2. Tímar
   - "Hvenær leggur þú af stað?" → date + time picker
   - "Hvenær kemur þú heim?" → date + time (optional)
   - "Síðast heima klukkan?" → time (optional, sér frá heimferð)

3. Farartæki
   - "Ert þú með eftirvagn?" → Já / Nei
   - Ef já: veldu tegund (chips/radio)

4. Gisting
   - "Ert þú að gista?" → Já / Nei
   - Ef já: veldu gistimáta (chips/radio)

5. Niðurstaða
   - Loading state meðan route + forecast sótt
   - Stöðulitur (graent/gult/rautt) + svar
   - "Af hverju?" disclosure
   - "Breyta" → fara aftur í skref 1
```

**Place confirmation í skrefi 1:**
- Curated staður valinn úr lista → auto-confirmed, sýnir static map (ef provider)
- Handskrifað eða PlaceSearch valið → sýnir static map + "Þetta er réttur staður?" + "Breyta" hnappur
- Ferðalagið fer ekki í skref 2 fyrr en báðir staðir eru confirmed

---

## Admin provider toggle

### SQL (sql/69_app_settings.sql)
```sql
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.app_settings(key, value)
  VALUES ('weather_map_provider', '')
  ON CONFLICT DO NOTHING;
```

### `provider.server.ts` (breytt)
```ts
export async function getWeatherMapProvider(): Promise<WeatherMapProvider | null> {
  // DB override takes precedence over env var
  let provider: string | null = null
  try {
    const { data } = await getAdmin().from('app_settings').select('value').eq('key', 'weather_map_provider').maybeSingle()
    if (data?.value) provider = data.value
  } catch { /* fall through to env var */ }

  const value = provider ?? process.env.WEATHER_MAP_PROVIDER ?? ''
  if (value === 'google') return googleProvider
  return null
}
```

### Admin API (app/api/admin/weather-settings/route.ts)
- `GET /api/admin/weather-settings` → skilar `{ weather_map_provider: string }`
- `PUT /api/admin/weather-settings` → body: `{ weather_map_provider: 'google' | 'mapbox' | '' }`
- Requires `requireAdmin()`

### Admin UI (admin/page.tsx viðbót)
Lítill section: "Veðurkort provider" + radio: Óvirkt / Google / Mapbox (Mapbox disabled á meðan ekki útfært).

---

## Test plan

### Nýjar prófanir í Phase 2A4:
- `weather-google.test.ts`: sampling cap prófanir (≤80, aldrei 81)
- PlaceSearch/MapConfirmation: input-textar koma úr messages (mocked t())

### Nýjar prófanir í Phase 2B:
- `weather-travel.test.ts`:
  - graent: góð leið, gott veður á dvöl, góð heimleið
  - gult: vindhviður á leiðinni
  - rautt: of mikill vindur
  - lodging úti vs. inni (mismunandi threshold)
  - horse_trailer caveat
  - no_data
  - disclaimer alltaf til staðar
  - returnDepartureAt: heimleið worst-case tekur þátt í heildarstöðu
- Admin provider toggle: GET/PUT viðbrögð

---

## Localhost checks for Stebbi eftir Phase 2B

**Án Google lykla:**
1. Opna `/auth-mvp/vedrid` → Ferðalagið wizard sést (ekki chat textasvæði)
2. Velja curated staði → skref 2 opnast
3. Velja non-curated stað → PlaceSearch birtist, þarf staðfestingu
4. Ferðalagið keyrir ekki route weather fyrr en báðir staðir confirmed
5. Án WEATHER_MAP_PROVIDER → villa: provider_not_configured (skýrt)
6. Admin panel → weather provider toggle visible

**Með Google lykla:**
7. Velja "Reykjavík" → "Akureyri" → static map sést við báðar staðfestingar
8. Route weather keyrir með curated endpoints → niðurstaða með route punktum
9. Non-curated "Suðurgata" → PlaceSearch → notandi staðfestir réttan stað
10. DevTools Network: GOOGLE_MAPS_SERVER_KEY sést aldrei

**Admin toggle:**
11. Skipta úr Google yfir í "" (óvirkt) í admin → route weather skilar provider_not_configured án endurræsingar
12. Skipta til baka → route weather virkar aftur

**Mobile:**
13. 360/390/460 px: enginn overflow, inputs ≥16px, allir hnapparnir reachable á hverju skrefi

---

## Opnar spurningar til Stebbi og Codex

1. **"Finndu góðan stað":** Phase 2C (eftir Ferðalagið MVP) eða inn í Phase 2B?
2. **Grill/Golf:** Á chat UI að sjást enn einhvers staðar (t.d. "Aðrar spurningar" tab) eða vera algjörlega falið?
3. **Tímaval UI:** Á Phase 2B að nota native `<input type="datetime-local">` (einfalt, Mobile-safe) eða sérhannað tímaval? Native er einfaldara.
4. **Admin toggle:** Þarf `mapbox` að vera disabled-option í admin UI strax, eða bara `google | ''`?

---

Þegar svör við spurningum 1-4 liggja fyrir og framkvæmdarleyfi er gefið:
**"Claude Code, framkvæmdu Phase 2A4"** — lagfærir v043 blockers.
**"Claude Code, framkvæmdu Phase 2B"** — Ferðalagið + admin toggle.
