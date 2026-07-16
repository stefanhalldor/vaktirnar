# TODO 086 v186 - Claude Code: Greining á tveimur viðbótarliðum við #3 í v185

Created: 2026-07-14 23:10
Timezone: Atlantic/Reykjavik

Mode:
- Greining og handoff only. Engar kóðabreytingar.
- Byggist á v185 Codex handoff (#3 veðurspjöld) og tveimur athugasemdum Stebba.

---

## Samhengi

Stebbi bætti tveimur liðum við #3 í v185 (shared weather-card presentation):

1. **Vantar "prev" punkt (21:00)** — skjámynd sýnir 00:00 og 03:00 en ekki 21:00 sem á undan.
2. **Raða öllum spjöldum í aksturspöntun** — þegar báðar veiturar eru valdar eiga þær að blandast saman í akstursröð.

---

## Liður 1: Vantar "prev" forecast röð (21:00)

### Hvað sýnir skjámyndin

Hellisheiði spjald kl. 22:55:
- Spá gefin út kl. 18:00
- ETA: 23:08
- Sýnt: 00:00 og 03:00
- Vantar: 21:00 (sem var á milli útgáfutíma 18:00 og ETA 23:08)

### Rót vandans

`vedurstofan_forecasts_latest` er "nýjustu gögn eingöngu" tafla. Gögnaflæðið er:

1. Við fetch kl. 22:55 skilar Veðurstofan API **eingöngu framtíðartímum** — 21:00 er þegar liðinn og kemur ekki í svari.
2. Við upsert er kallað á:
   ```ts
   // lib/weather/providers/vedurstofan.server.ts:650-654
   await admin
     .from('vedurstofan_forecasts_latest')
     .delete()
     .eq('station_id', stationId)
     .lt('fetched_at', payload.fetchedAtIso)
   ```
   Þetta eyðir **öllum** eldri röðum, þar á meðal 21:00.
3. `selectPrevUsedNext` í `VedurstofanPointCard.tsx:13-43` finnur þá `usedIdx = 0` (00:00 er fyrsta röð), svo `prev = null`.

### Þess vegna er Stebbi að sjá rétta hegðun — 21:00 er einfaldlega horfin

Þetta er byggingarleg takmörkun: taflan geymir bara það sem nýjasta API-svarið inniheldur.

### Stebbi spyr: erum við að hreinsa töfluna og fylla hana aftur?

Já, nákvæmlega. Við upsertum nýjustu spár og eyðum síðan eldri fetched_at röðum. Þetta þýðir:
- Alltaf nýjustu gögn til framtíðar.
- Söguleg gögn (þ.e. forecast_time sem er þegar liðinn) tapast þegar ný fetch kemur.

### Tillögur

**Auðveldasta leiðin — geyma nýlegar fortíðarraðir:**

Breyta delete-setningunni þannig að hún eyði ekki `forecast_time` röðum sem eru nýlega liðnar (t.d. innan 6 tíma):

```ts
// Núverandi (eyðir öllum eldri röðum):
.lt('fetched_at', payload.fetchedAtIso)

// Ný tillaga (eyðir bara röðum þar sem forecast_time er >6h í fortíð):
.lt('fetched_at', payload.fetchedAtIso)
.gte('forecast_time', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
```

Þetta þýðir: gamlar raðir (eldri en 6 klst. í fortíð) eru aldrei hluti af display-i, en nýlegar raðir (t.d. 21:00 þegar við skoðum kl. 22:55) lifa yfir fetch-ið.

**Vandamál:** Þetta gæti skilið eftir rangar fortíðarraðir ef Veðurstofan skilaði öðruvísi gögnum í fyrri cycles. Upsert `onConflict: 'station_id,forecast_time'` uppfærir þær þó rétt ef þær eru í nýja svarinu.

**Öruggari en dýrari leið — söguleg tafla:**

Búa til nýja töflu `vedurstofan_forecasts_history` eða `vedurstofan_forecasts_archive` sem:
- Safnar öllum sóttum spám með `(station_id, forecast_time, atime)` sem lykli.
- Eyðir röðum sem eru eldri en X dagar (t.d. 2 dagar) með cron-vinnslu.
- `vedurstofan_forecasts_latest` helst óbreytt fyrir nýjustu gögn.
- Display-kóðinn les úr sögulegri töflu ef hann þarf "prev" sem er ekki í "latest".

Þetta er meira vinna (ný migration, ný query-lógík) en gefur betri langa leið.

**Meðalleið — breyta display til að mildra vandann:**

Ef hér er ekkert `prev` sýnum við bara `used` og `next` án tóms pláss. Breyta
þannig að þegar `prev === null` er spjaldið þjappað í staðinn fyrir að sýna tómt.
Þetta leysir ekki gagnageymslu-vandann en gerir UI-ið snyrtilegra meðan á sér stað.

### Ráðlegging

Byrja á auðveldasta leiðinni (geyma 6h fortíðarraðir) og meta hvort hún dugi.
Ef Veðurstofan API skilar ALDREI fortíðartímum, þá er söguleg tafla nauðsynleg.

Þarf: breytingu á `lib/weather/providers/vedurstofan.server.ts:650-654`, og mögulega nýja migration ef við viljum sögulegri töflu.

---

## Liður 2: Raða öllum spjöldum í aksturspöntun

### Núverandi hegðun

Í `FerdalagidClient.tsx:1659-1709` er rendering svona:

```tsx
{/* Fyrst öll met.no/Yr spjöld */}
{showMetno && result.travelPlan!.routeWeatherPoints!.map((pt) => (
  <RoutePointRow key={pt.id} ... />
))}

{/* Svo öll Veðurstofan spjöld */}
{showVedurstofan && vedurstofanLayer && vedurstofanLayer.points.map((vpt) => (
  <VedurstofanPointCard key={vpt.routePointId} ... />
))}
```

Þetta þýðir: þegar báðar veiturar eru virkar koma fyrst allir met.no/Yr punktar, svo allir Veðurstofan punktar. Þeir blandast ekki.

### Hvað Stebbi vill

Þegar báðar veiturar eru valdar á listinn "Allir spápunktarnir á leiðinni" að raðast í akstursröð, þannig að punt 1 (næstur upphafspunkti) kemur fyrst óháð veitunni.

### Hvernig á að framkvæma þetta

Við þurfum sameinaðan lista raðaðan eftir fjarlægð frá upphafsstað:

```ts
type CombinedPoint =
  | { kind: 'metno'; pt: RouteWeatherPoint }
  | { kind: 'vedurstofan'; vpt: VedurstofanTravelLayer['points'][number]; assessment: ... }

const allPoints: CombinedPoint[] = [
  ...(showMetno ? result.travelPlan!.routeWeatherPoints!.map(pt => ({
    kind: 'metno' as const,
    pt,
    distanceFromOriginM: pt.distanceFromOriginM ?? 0,
  })) : []),
  ...(showVedurstofan && vedurstofanLayer ? vedurstofanLayer.points.map(vpt => ({
    kind: 'vedurstofan' as const,
    vpt,
    assessment: vedurstofanAssessments.find(a => a.station.stationId === vpt.stationId),
    distanceFromOriginM: vpt.distanceFromOriginM ?? 0,
  })) : []),
].sort((a, b) => a.distanceFromOriginM - b.distanceFromOriginM)
```

Síðan eitt `map` sem skilar réttu spjaldi eftir `kind`:

```tsx
{allPoints.map(item =>
  item.kind === 'metno'
    ? <RoutePointRow key={item.pt.id} pt={item.pt} ... />
    : <VedurstofanPointCard key={item.vpt.routePointId} station={item.vpt} ... />
)}
```

### Hvað þarf að athuga

- Heiti á `distanceFromOriginM` á `RouteWeatherPoint` — þarf að staðfesta nákvæmt field-heiti í `lib/weather/types.ts`.
- `vedurstofanLayer.points[n].distanceFromOriginM` — þetta er til, sbr. `VedurstofanPointDisplayModel`.
- Þegar bara ein veitur er virk: listinn inniheldur bara þá eina tegund, sömu röðin og áður.
- Þegar báðar: blandaður listi í akstursröð.
- Section-label ofan listans (`metnoSectionLabel` vs. `vedurstofanPointsSectionLabel`) þarf að vera einn unified label eins og `tf('allPointsSectionLabel')` þegar báðar eru virkar, eða halda einstaka labels þegar aðeins ein er virk.

### Tenging við #3 í v185 (shared card)

Þetta er nátengt #3 — ef við gerum shared `WeatherPointCard` component verður blöndunarlistinn mun auðveldari að útfæra. Auðveldasta leiðin í millitíðinni er að nota `kind` discriminator og kalla á réttu componentsina, en þegar shared card er til verður þetta einn render lína.

---

## Ráðlegging um röðina

Gert í þessari röð sem hluti af v185 #3 + þessum tveimur liðum:

1. **Shared card** (#3 í v185) — þetta er grundvöllurinn.
2. **Blandaðar röð** (liður 2 hér) — tiltölulega auðveld breyting þegar shared card er til.
3. **Geyma fortíðarraðir** (liður 1 hér) — krefst breytingar á server og mögulega migration; er meiri vinna.

Stebbi þarf að samþykkja hvort við gerum sögulegri töflu (þarf nýja migration) eða notum 6h-window leiðina (eingöngu server-breytingar).

---

## Engin migration þarf fyrir lið 2

Liður 2 er eingöngu client-side rendering breyting í `FerdalagidClient.tsx`. Engin Supabase breyting.

## Mögulega migration fyrir lið 1

- 6h-window leið: engin migration, bara server-kóðabreyting.
- Söguleg tafla: þarf nýja migration (t.d. `sql/77_vedurstofan_forecasts_history.sql`).

Stebbi þarf að samþykkja migration ef við förum þá leið.
