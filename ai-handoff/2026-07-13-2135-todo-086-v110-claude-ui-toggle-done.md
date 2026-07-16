# TODO 086 v110 - Claude: Veðurstofan toggle UI done

Created: 2026-07-13 21:45
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Input: v109 Codex review (no blockers, proceed to UI)

---

## Staða

Timer cleanup + count rename + UI toggle/disclaimer eru útfærð. Ócommitað. type-check ok, 2400 prófanir standast.

---

## Breytingar

### 1. Timer cleanup (`app/api/teskeid/weather/travel/route.ts`)

Skipt út `Promise.race` í lausskel fyrir `withLayerTimeout` helper með `clearTimeout` í `finally`:

```ts
function withLayerTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<T>(resolve => {
    timer = setTimeout(() => resolve(fallback), VEDURSTOFAN_LAYER_BUDGET_MS)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>
}
```

### 2. Count rename (`lib/weather/providers/vedurstofanBlend.ts` + travel route)

`mappedStationCount`, `availableStationCount`, `staleStationCount`, `unavailableStationCount`
→ `mappedPointCount`, `availablePointCount`, `stalePointCount`, `unavailablePointCount`

Skýrir að þetta eru route-point tölur, ekki unique station tölur.

### 3. UI toggle (`app/auth-mvp/vedrid/FerdalagidClient.tsx`)

**Nýtt state:**
```ts
const [baselineResult, setBaselineResult] = useState<DeterministicResult | null>(null)
const [vedurstofanLayer, setVedurstofanLayer] = useState<VedurstofanTravelLayer | null>(null)
const [showVedurstofan, setShowVedurstofan] = useState(false)
```

**Á nýrri niðurstöðu:**
```ts
const travelData = data as DeterministicResult & { vedurstofanLayer?: VedurstofanTravelLayer }
setBaselineResult(travelData)
setVedurstofanLayer(travelData.vedurstofanLayer ?? null)
setShowVedurstofan(false)  // reset toggle on new query
setResult(travelData)
```

**Toggle handler:**
```ts
function toggleVedurstofan(show: boolean) {
  if (!baselineResult || !vedurstofanLayer) return
  setShowVedurstofan(show)
  setResult(show ? vedurstofanLayer.augmentedResult : baselineResult)
}
```

**Toggle UI** (bætist eftir audit map, á undan return heatmap):
```jsx
{vedurstofanLayer && result && !loading && (
  <div className="bg-card border border-border rounded-xl px-4 py-3 flex flex-col gap-2">
    <div className="flex items-center justify-between gap-3 min-h-[40px]">
      <span className="text-sm text-muted-foreground">{tf('vedurstofanLayerToggleLabel')}</span>
      <button role="switch" aria-checked={showVedurstofan} onClick={() => toggleVedurstofan(!showVedurstofan)} ...>
        ...
      </button>
    </div>
    {showVedurstofan && (
      <p className="text-xs text-muted-foreground">{tf('vedurstofanLayerDisclaimer')}</p>
    )}
  </div>
)}
```

**Toggle er:**
- Aðeins sýnilegt þegar `vedurstofanLayer` er til staðar í API svari
- Instant/client-side: skiptar á milli `baselineResult` og `vedurstofanLayer.augmentedResult`
- Engar nýjar API/Google/met.no beiðnir við toggle
- Resetast á hverri nýrri niðurstöðu

### 4. Þýðingar (`messages/is.json`, `messages/en.json`)

Nýjar lyklar í `ferdalagid`:
- `vedurstofanLayerToggleLabel`: "Veðurstofan (í prófun)" / "Veðurstofan (in testing)"
- `vedurstofanLayerDisclaimer`: "Veðurstofugögn eru í prófun. MET/Yr er áfram grunnspáin. Vegagerðin er ekki komin inn." / "Veðurstofan data is in testing. MET/Yr remains the baseline forecast. Road conditions (Vegagerðin) are not included yet."

---

## Þrjú gate-flags

Layer toggle er aðeins sýnilegt þegar API svar inniheldur `vedurstofanLayer`, sem krefst:
1. `VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true`
2. `WEATHER_ELTA_VEDRID_FLAG=true`
3. Per-user `elta-vedrid` access

---

## Test results

```
type-check: exit 0
npm run test:run: 81 files, 2400 passed, 0 failed
```

---

## Breyttar skrár (allar ócommitaðar)

```
M  app/api/teskeid/weather/travel/route.ts
M  app/auth-mvp/vedrid/FerdalagidClient.tsx
M  lib/__tests__/weather-travel-api.test.ts
M  lib/weather/providers/vedurstofanBlend.ts
M  messages/en.json
M  messages/is.json
?? lib/__tests__/weather-vedurstofan-blend.test.ts
```

---

## Localhost próf fyrir Stebbi

### Uppsetning (til að sjá toggle):
```
VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true
WEATHER_ELTA_VEDRID_FLAG=true
(+ per-user elta-vedrid access)
```

### Próf:

1. **Layer disabled (default)**:
   - Keyra ferðaveðursleit
   - Veðurstofan toggle sést EKKI í UI
   - UI hegðar sér nákvæmlega eins og áður

2. **Layer enabled, stöðvar til**:
   - Sama leit með flags kveikt
   - Toggle "Veðurstofan (í prófun)" birtist eftir kortið
   - Network tab: API svar inniheldur `vedurstofanLayer`

3. **Toggle on**:
   - Smella á toggle
   - UI uppfærist augnablikslega (engar nýjar API beiðnir)
   - Disclaimer birtist: "Veðurstofugögn eru í prófun..."
   - `stada` gæti breyst ef Veðurstofan hækkaði einhverja gildi

4. **Toggle off**:
   - Smella aftur
   - UI snýr aftur í MET/Yr baseline nákvæmlega
   - Disclaimer hverfur

5. **Mobile breidd (360, 390, 460 px)**:
   - Toggle línan oferfyllir ekki
   - Texti styttist ekki eða brotnar

6. **Ný leit**:
   - Toggle resetsast sjálfkrafa í off

Ekki testa production cron, Vercel env eða production Supabase án samþykkis.
