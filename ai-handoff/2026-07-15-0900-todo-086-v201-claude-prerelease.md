# Handoff: v201 prerelease — met.no selected/worst no_data fix

Created: 2026-07-15 09:00
Timezone: Atlantic/Reykjavik
TODO: todo-086

---

## Hvað var lagað

### Blocker: met.no selected/worst panel sýndi "Ófullnægjandi gögn"

**Rót vandans:**
`PointDetailsPanel` í `TravelAuditMap` reiknaði `windDisplayStatus` með:
```ts
classifyPointWindDisplayStatus(summary.windMs, summary.status !== undefined, ...)
```

`buildPointSummary` setur `status: undefined` þegar `activeCandidate` er virk (active-slot mode) — af því windMs kemur úr displayPoint eða derived row, ekki úr summaryForWindow. Þetta er rétt. En `summary.status !== undefined` er þá alltaf `false` → `hasData = false` → `no_data`.

Map markers og status counts notuðu rétta lógík (`forecastRows.length > 0`). RoutePointRow í FerdalagidClient notaði líka rétta lógík. En PointDetailsPanel notaði ranga lógík — þess vegna sá Stebbi `Nálgast óþægindi (72)` í map pills en `Ófullnægjandi gögn` á worst/selected kort.

**Lagfæring:**

1. Bætt `hasData: boolean` við `PointSummary` type og `buildPointSummary`:
   ```ts
   hasData: dp !== undefined ? true : derived !== null ? true : activeCandidate ? false : pt.summaryForWindow !== undefined
   ```
   - displayPoint present → `true`
   - derived row found from forecastRows → `true`
   - activeCandidate en engar forecastRows → `false`
   - enginn activeCandidate → `pt.summaryForWindow !== undefined`

2. `PointDetailsPanel` notar nú `summary.hasData` í stað `summary.status !== undefined`.

3. `RoutePointRow` í FerdalagidClient einfaldað til að nota `summary.hasData` í stað sérstakrar `ptHasData` útreiknings — gildi eru jafngildar.

Þetta þýðir að öll þrjú samhengið (map markers, selected/worst panel, allir spápunktar) nota nú sömu `hasData` skilgreiningu.

---

## Við lítum á arkitektúr í framtíð

Codex v202 bendir á að shared provider card logic sé mikilvæg áður en Vegagerðin bætist við. Veðurstofan selected/worst er rétt eins og er. Þess vegna er þessi fix `hasData`-grunnum skref í átt að sameiginlegri lógík — ekki fullkláruð sameiginleg card shell. Það kemur á undan Vegagerðin integration.

---

## Typecheck & Próf

```
npx tsc --noEmit                              → hreinn
npx vitest run [...travelAuditMap.helpers...] → 105 passed
```

5 nýir `hasData` próf bætt við sem ná yfir:
- enginn summaryForWindow, enginn activeCandidate → `false`
- summaryForWindow til staðar → `true`
- displayPoint í active mode (status undefined) → `true`, windMs rétt
- non-displayPoint með forecastRows → `true`
- non-displayPoint án forecastRows → `false`

---

## Skrár breyttar

| Skrá | Breyting |
|------|----------|
| `components/weather/travelAuditMap.helpers.ts` | `hasData` bætt við `PointSummary` og `buildPointSummary` |
| `components/weather/TravelAuditMap.tsx` | `PointDetailsPanel` notar `summary.hasData` |
| `app/auth-mvp/vedrid/FerdalagidClient.tsx` | `RoutePointRow` notar `summary.hasData` |
| `lib/__tests__/travelAuditMap.helpers.test.ts` | 5 nýir `hasData` próf |

---

## Localhost checks fyrir Stebbi

Ekki keyra SQL77 aftur.

1. Opna `/auth-mvp/vedrid` sem notandi með weather aðgang.
2. Velja leið þar sem met.no sýnir `Nálgast óþægindi` eða `Óþægilegt`.
3. Slökkva á Veðurstofan, kveikja aðeins á met.no.
4. Velja departure slot í heatmap.
5. Athuga "Mest krefjandi" kort undir kortinu:
   - Á að sýna sama status chip og map pills og "Allir spápunktar" raðir (t.d. `● 😬 Nálgast óþægindi`)
   - Á EKKI að sýna `Ófullnægjandi gögn`
6. Smella á punkt á kortinu handvirkt:
   - "Valin veðurspá" kort á að sýna sama status chip og samsvarandi röð í "Allir spápunktar"
7. Samanber "Allir spápunktar" og selected/worst kort:
   - Sama point, sama provider, sama status chip stíll
8. Kveikja á Veðurstofan:
   - Veðurstofan selected/worst kort á að vera óbreytt (rétt eins og áður)
9. Kveikja á báðum:
   - Provider labels skýrir í öllum samhengum
