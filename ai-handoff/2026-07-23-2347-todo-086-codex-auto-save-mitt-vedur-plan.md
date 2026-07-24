# TODO-086 - Codex yfirferð: Auto-save Mitt veður + Vista-takki fyrir óinnskráða

Created: 2026-07-23 23:55
Timezone: Atlantic/Reykjavik

## Beiðni Stebbi

> "Sem innskráður notandi ætti allt undir 'mitt veður' að auto vistast... líka tímarnir sem maður velur að séu sýnilegir í samanburðartöflu og scrubber korts. Vista hnappurinn ætti bara að vera sýnilegur notanda sem er ekki innskráður og ætti þá að senda viðkomandi í innskráningarferli og aftur inn á sama stað og hann var (þ.e. muna öll gildi) og byrja að auto-save'a þar eftir."

## Núverandi staða

### Hvað er til staðar

**Persistence layer (`/api/teskeid/weather/preferences/chase/route.ts`):**
- `GET` — skilar `selectedItems` + `criteria` úr `weather_chase_preferences` töflu (Supabase). Skilar `{ hasPreferences: false }` ef tafla vantar eða notandi er ekki innskráður (401).
- `PUT` — tekur við `{ selectedItems, criteria }`, upsert á `user_id`.
- Taflan: `weather_chase_preferences(user_id PK, selected_items JSONB, criteria JSONB)`. **Engin `visible_hours` dálkur til.**

**Client (`RoadMapPrototypeMap.tsx`):**
- `WeatherChasePreferencesPayload = { selectedItems, criteria }` — engir `visibleHours`.
- `handleSaveWeatherChaseDefault(payload)`:
  1. Vista í `localStorage` (WEATHER_CHASE_LOCAL_STORAGE_KEY)
  2. Kalla `PUT /api/.../chase`
  3. Ef 401 → vista pending í `sessionStorage` → redirect til `/innskraning?next=...?saveWeatherChaseDefaults=1`
- `useEffect` við mount:
  - Les pending sessionStorage + `?saveWeatherChaseDefaults=1` param → auto-PUT eftir innskráningu
  - Annars: les frá localStorage → les frá API (API vinnur yfir localStorage ef bæði eru til)
- `onSaveDefault` er alltaf sent á `WeatherChasePanel` → "Vista mitt veðurkort" takki alltaf sýnilegur.
- Engin auto-save. Notandi þarf alltaf að smella á "Vista".

**`mapVisibleHours` state** (bætt við í þessari lotu): array af völdum klukkutímum í `RoadMapPrototypeMap`. Uppfærist þegar notandi breytir tímum í panel. **Vistast hvergi.** Endurstillist alltaf í `[12]` við endurnýjun.

**WeatherChasePanel:**
- `visibleHours` state inni í component (default `[12]`).
- `onVisibleHoursChange` prop sendir update út á `RoadMapPrototypeMap` → `setMapVisibleHours`.
- Þegar "Vista" er smellt: `onSaveDefault({ selectedItems, criteria })` — **visibleHours eru EKKI í payload**.

### Skrár sem skipta máli

- `components/weather/RoadMapPrototypeMap.tsx` (~5950 línur)
- `components/weather/WeatherChasePanel.tsx`
- `app/api/teskeid/weather/preferences/chase/route.ts`
- `app/auth-mvp/vedrid/road-map-prototype/page.tsx`
- `messages/is.json`, `messages/en.json`

## Plan til framkvæmdar

### Skref 1 — SQL migration (Stebbi keyrir)

Ný skrá: `sql/91_weather_chase_visible_hours.sql`

```sql
ALTER TABLE weather_chase_preferences
ADD COLUMN IF NOT EXISTS visible_hours JSONB DEFAULT NULL;
```

Engar aðrar breytingar á töflu. `visible_hours` er JSONB array, t.d. `[6, 12, 18]`.

### Skref 2 — API endpoint uppfærsla

**GET** — bæta `visible_hours` við select og svari:
```ts
.select('selected_items, criteria, visible_hours')
// ...
return NextResponse.json({
  hasPreferences: true,
  selectedItems: normalizeSelectedItems(data.selected_items),
  criteria: normalizeCriteria(data.criteria),
  visibleHours: normalizeVisibleHours(data.visible_hours), // nýtt
})
```

**PUT** — taka við og vista `visible_hours`:
```ts
const visibleHours = normalizeVisibleHours(input.visibleHours)
// ...upsert með visible_hours: visibleHours
```

**Validation** (`normalizeVisibleHours`):
```ts
const VALID_HOURS = new Set([0, 3, 6, 9, 12, 15, 18, 21])
function normalizeVisibleHours(value: unknown): number[] {
  if (!Array.isArray(value)) return [12]
  const filtered = value.filter(h => typeof h === 'number' && VALID_HOURS.has(h))
  return filtered.length > 0 ? [...new Set(filtered)].sort((a,b) => a-b) : [12]
}
```

### Skref 3 — Client-side payload

**Bæta `visibleHours` við `WeatherChasePreferencesPayload`:**
```ts
type WeatherChasePreferencesPayload = {
  selectedItems: WeatherChasePreferenceItem[]
  criteria: WeatherChaseCriteria
  visibleHours?: number[]
}
```

**`normalizeWeatherChasePreferences`** — bæta við:
```ts
visibleHours: normalizeVisibleHoursClient(input.visibleHours) // client-side variant
```

**`applyWeatherChasePreferences`** — bæta við:
```ts
if (payload.visibleHours) setMapVisibleHours(payload.visibleHours)
// WeatherChasePanel fær initialVisibleHours prop (sjá neðar)
```

### Skref 4 — `page.tsx`

Bæta við `isAuthenticated` prop (alltaf `true` á þessari síðu):
```tsx
<RoadMapPrototypeMap isAuthenticated />
```

Prop type í `RoadMapPrototypeMap`: `isAuthenticated?: boolean` (default `false` ef einhvern tíma notað á opnum síðum).

### Skref 5 — Auto-save í `RoadMapPrototypeMap.tsx`

```ts
const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

useEffect(() => {
  if (!isAuthenticated) return
  if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
  autoSaveTimerRef.current = setTimeout(() => {
    void handleSaveWeatherChaseDefault({
      selectedItems: weatherChaseSelectedItems.map(preferenceItemFromWeatherChaseItem),
      criteria: weatherChaseCriteria,
      visibleHours: mapVisibleHours,
    })
  }, 1500)
  return () => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
  }
}, [weatherChaseSelectedItems, weatherChaseCriteria, mapVisibleHours, isAuthenticated])
```

**Vandamál: handleSaveWeatherChaseDefault í dependency array.**
`handleSaveWeatherChaseDefault` er `useCallback` — hægt að hafa í deps. Þó þarf að passa að save-statusinn sé ekki misleiðandi (user sér "Vista..." þegar auto-save keyrir). Líklega betra að:
- Þegar `isAuthenticated`: auto-save **án** þess að setja `saveStatus` (sleppa `setWeatherChaseSaveStatus` calls í auto-save path)
- Skipta `handleSaveWeatherChaseDefault` í tvo hluta: `saveToApi(payload)` (low-level) og `handleManualSave(payload)` (með status updates) — auto-save notar `saveToApi` beint.

### Skref 6 — Fela "Vista" takka fyrir innskráða

**Núverandi hegðun:** `onSaveDefault` prop á WeatherChasePanel ákvarðar hvort takkinn sést (`{onSaveDefault && <button>...`).

**Lausn:** Þegar `isAuthenticated` — senda **ekki** `onSaveDefault` prop á WeatherChasePanel. Takkinn hverfur sjálfkrafa. Auto-save (skref 5) tekur við.

```tsx
// Í RoadMapPrototypeMap JSX:
{!isAuthenticated && (
  onSaveDefault={handleSaveWeatherChaseDefault}  // sýnir Vista takka + gerir login redirect
)}
// Þegar isAuthenticated: prop er undefined → takki felinn, auto-save keyrir
```

**Þegar !isAuthenticated og notandi smellir Vista:**
Vista → `handleSaveWeatherChaseDefault` → API skilar 401 → pending í sessionStorage (með visibleHours!) → redirect til `/innskraning?next=...?saveWeatherChaseDefaults=1` → eftir innskráningu → auto-apply + auto-save.

### Skref 7 — `initialVisibleHours` prop á WeatherChasePanel

Þegar `applyWeatherChasePreferences` er kallað (við load eða eftir login), þarf WeatherChasePanel að vita um visibleHours. Tveir möguleikar:

**A) Key reset:** Gefa WeatherChasePanel `key={JSON.stringify(mapVisibleHours)}` — en þetta mountar component upp á nýtt og er of þungt.

**B) Controlled `visibleHours`:** Gera `visibleHours` + `onVisibleHoursChange` að controlled props á WeatherChasePanel (taka state út úr component). Þetta er hreinlegasta lausnin en krefst nokkurra breytinga á WeatherChasePanel.

**C) `initialVisibleHours` + useEffect í WeatherChasePanel:**
```ts
// Í WeatherChasePanel:
const [visibleHours, setVisibleHours] = useState<WeatherChaseVisibleHour[]>(
  props.initialVisibleHours?.length ? props.initialVisibleHours as WeatherChaseVisibleHour[] : [12]
)
// Þegar initialVisibleHours breytist (apply frá API):
useEffect(() => {
  if (props.initialVisibleHours?.length) {
    setVisibleHours(props.initialVisibleHours as WeatherChaseVisibleHour[])
  }
}, [props.initialVisibleHours])
```

**Mæli með B (fully controlled)** ef við erum að gera þetta rétt. Lessens duplication á state. En C er einfaldari og nægir fyrir þessa útfærslu.

## Vandamál til yfirlits hjá Codex

1. **`handleSaveWeatherChaseDefault` og `saveStatus`** við auto-save: Á notandinn að sjá einhverjar vísbendingar um að auto-save keyrði? T.d. lítinn "Vistað" texta sem hverfur? Eða þögullt?

2. **`weatherChaseSelectedItems` í auto-save useEffect**: Þetta er array af hlutum. React comparison er reference-based. `handleWeatherChaseSelectedItemsChange` uppfærir `weatherChaseSelectedItems` state í hvert sinn sem items breytast — þetta virkar rétt með useEffect dependency.

3. **Mount-time save**: Auto-save useEffect mun keyra við fyrstu mount (þegar `isAuthenticated` er `true`). Þetta þýðir að save keyrði um leið og notandi opnar síðuna, jafnvel áður en gögn hafa loadast frá API. **Fix**: Bæta við guard: `if (weatherChaseSelectedItems.length === 0 && !weatherChasePreferenceItems) return` eða nota ref til að sleppa fyrsta render.

4. **Race condition**: API load (mount useEffect) getur verið í gangi á meðan auto-save timer rennur. Ef API load skilar gögnum eftir 500ms og timer fires eftir 1500ms frá mount, getum við vistað gamlar items. Þetta er lítið vandamál í reynd (items load hratt) en Codex gæti haft tillögu að því.

5. **SQL migration timing**: Til `visibleHours` fari í Supabase þarf migration (skref 1). Þar til þá: `visible_hours` dálkur vantar → PUT skilar ekki villu (PostgreSQL hunsar unknown columns í upsert data... nei, það er rangt — PostgreSQL mun gefa villu). **Lausn**: API PUT þarf að sleppa `visible_hours` ef dálkurinn er ekki til, eða við keyrum migration strax. Codex ætti að meta hvort við getum notað `isMissingTableError` pattern eða hvort við þurfum að bæta við sérstakri villumeðferð fyrir missing column.

6. **`preferenceItemFromWeatherChaseItem`**: Þetta fall er notað í `handleSaveWeatherChaseDefault` núna. Við auto-save þurfum við aðgang að því úr useEffect. Þetta er líklega import eða util function — athugaðu hvort það sé accessible.

## Skrár sem breytast

- `sql/91_weather_chase_visible_hours.sql` (ný)
- `app/api/teskeid/weather/preferences/chase/route.ts`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/WeatherChasePanel.tsx`
- `app/auth-mvp/vedrid/road-map-prototype/page.tsx`

## Ekki í scope

- Breyting á `weather_route_memory_*` töflum
- Breytingar á `/vedrid` (RouteMemoryPicker, WeatherOverviewShell)
- Önnur auth-kerfi
