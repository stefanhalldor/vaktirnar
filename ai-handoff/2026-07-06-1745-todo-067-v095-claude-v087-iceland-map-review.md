# todo-067 v095 - Claude Code rýni: v087 Iceland travel conditions map plan

Created: 2026-07-06 17:45
Timezone: Atlantic/Reykjavik
Reviews: `2026-07-06-1632-todo-067-v087-codex-iceland-travel-conditions-map`
Author: Claude Code

## Samantekt

Planið er vel hugsað og vandlega afmarkað. Meginlínan — road-aware sample points, server-side snapshot, deterministic engine reuse, BFF-only met.no calls, internal-first rollout — er rétt. Nokkur opinn spurning þarf ákvörðun áður en Phase B byrjar.

Engar framkvæmdarbreytingar í þessari rýni.

---

## Styrkur plansins

### Road-aware vs dense grid

Ákvörðunin um road-aware sample points fyrst (ekki dense grid) er rétt af nokkrum ástæðum:

- Dense grid yfir Ísland (t.d. 0.1° x 0.1° ≈ ~1000 punktar á landi) myndi þykja gagnslaus fyrir ferðalag sem fylgir vegum. Vindur á Heklu skiptir litlu máli ef þú ert á þjóðvegi 1.
- 50-150 curated road points er hægt að validate handvirkt af Stebbi — mun skilvirkara fyrir model-lab.
- met.no load er handanleg: 150 punktar = 150 BFF calls per snapshot (eitt API call per punkti, ekki 150 × 48 klukkutímar sér). Þetta er lítið.

### BFF-only met.no constraint

Sérstaklega mikilvægt og rétt. Núverandi route-weather fer þegar í gegnum BFF (`/api/teskeid/weather/travel`). Iceland map snapshot á að fylgja sama mynstri — server-side generation, browser fær bara JSON payload. Þetta verndar bæði mot.no compliance og app performance.

### Deterministic engine reuse

Rétt stefna. Núverandi `lib/weather/thresholds.ts` og `deriveThreshold()` eru þegar hlutlægar og hægt að nota beinlínis. Ef snapshot generator kallar sama evaluation logic og route weather, þá er model consistency tryggð á milli þeirra tveggja.

### Phased rollout

Internal → public beta röðin er skynsamleg. Ekki hægt að "unsee" of miklum villum ef þetta er opið almenningi. Model-lab phase leyfir Stebbi að laga thresholds áður en veðurnördar sjá niðurstöðurnar.

---

## Opnar spurningar sem þurfa ákvörðun

### 1. Snapshot storage — þarf ákvörðun í Phase A

Planið lætur þessa spurningu hanga opna á milli fjögurra valkosta (in-memory, file, Supabase, Vercel KV). Þetta þarf ákvörðun áður en Phase B getur klárast.

**Tillaga:**

- **Phase B/C (dev + internal):** in-memory eða temp file cache á BFF. Engin database-dependency þar til þörf er staðfest.
- **Phase D/E (public beta):** Supabase tafla er líklegasta leiðin þar sem allt annað infrastructure er þegar þar. KV/blob er aukakerfi sem þarf ekki.

Spurning til Stebbi: er Supabase nú þegar närrí capacity, eða er auðveldara að nota file cache á Vercel í fyrstu?

### 2. Road sample point uppspretta — óskilgreind

Planið segir "50-150 road/weather points" en nefnir ekki hvernig þeir punktar eru valdir eða hvonær þeir eru uppfærðir. Þetta er mikilvæg hönnunarspurning:

**Valkostur A:** Handvirkur curated listi (JSON eða Supabase tafla) sem Stebbi heldur við. Einfalt, full control, en þarf handvirka viðhaldi.

**Valkostur B:** Automated sample á þekkta vegakerfa (t.d. OpenStreetMap þjóðvegar). Flóknara í upphafi en scalable.

**Tillaga für Phase B:** Byrjaðu á handvirkum curated lista með ~50-80 punktum á meginstofnvegum (1, 41, 43, 47, 54, Suðurlandsvegur, Reykjanesbraut, helstu fjallvegar). JSON skrá í repo. Hægt að bæta við síðar.

### 3. met.no API call math — þarf að skjalfesta

Planið nefnir "150 punktar" en er óljóst um hvað nákvæmlega eitt "snapshot" kostar. Þetta þarf að vera skýrt:

- 1 snapshot = 1 met.no call per punkti (locationforecast gefur 48-90 klukkutímar í einu).
- 150 punktar = 150 HTTP calls per snapshot update.
- Cache key er `{rounded_lat},{rounded_lon}` eins og núverandi route flow.
- Ef sama forecastLat/lon er notuð fyrir nærliggjandi vegapunkta (eins og núverandi route sampling), þá minnka raunveruleg calls enn frekar.

Þetta er lítið. Til samanburðar: vedur.is hefur marga þúsunda notendur sem sækja hvern sinn. 150 calls á klukkutíma (eða sjaldnar ef cache er lengi gott) er vel innan marka.

**Phase A ætti að skjalfesta þetta í provider policy note.**

### 4. THREDDS / gridded data — rannsókn getur beðið

Planið bendir réttilega á THREDDS sem mögulegan valkost en segir að rannsóknin sé ófullkomin. Mælist til að fá þessa rannsókn ekki inn í Phase A scope — hún gæti auðveldlega seinkað Phase B ef hún er utan ramma.

Gridded data er líklegast of flókið og of mikið fyrir model-lab MVP. Geymið sem "Phase F" hugsun ef road-aware map reynist ófullnægjandi síðar.

### 5. Feedback layer — GDPR consideration

Phase D nefnir "optional email/contact field only if Stebbi approves." Ef email er geymt þarf GDPR consideration (processing basis, retention, deletion). Tillaga:

- Geyma **ekki** email í feedback í Phase D, nema sérstaklega samþykkt.
- Structured feedback (location/time/issue/comment) án contact fields er nægilegt fyrir model tuning.
- Ef contact kellist skuldugur síðar má bæta við með sérstakri rýni.

---

## Minniháttar athugasemdir

### `TravelConditionSnapshot` gerð

Gerðaruppástunga í planinu er góð. Einn hlut ber þó að skoða:

```ts
valuesByTime: Record<string, { ... }>
```

`Record<string, ...>` þar sem lykillinn er ISO tímastrengur getur verið erfitt að iterate í réttri röð. Íhugaðu `Array<{ time: string; ... }>` eða `{ validTimes: string[]; valuesByTimeIndex: Array<...> }` til að tryggja að UI geti scrubbed í réttri tímaröð án `Object.keys().sort()`.

### `modes` í snapshot

Planið stingur upp á `modes: Array<'car' | 'caravan' | 'horse_trailer'>`. Ef snapshot inniheldur **allar** modes í einu (ekki bara valda mode), þá getur UI skipst á milli modes án þess að þurfa nýjan server call. Þetta er ákjósanlegt — einn snapshot fyrir allt. Skulu vera explicit um þetta í Phase A.

### `symbolCode` í snapshot

Planið inniheldur `symbolCode` í `valuesByTime`. Þetta er gagnlegt fyrir UI (sólskin, rigning, snjór) en þarf `symbolCode` source í met.no compact format — það er til. Gott að hafa inni, engin athugasemd.

### `forecastLat`/`forecastLon` vs `lat`/`lon`

Gott að hafa bæði. `lat`/`lon` = vegapunktur á korti, `forecastLat`/`forecastLon` = met.no forecast grid punktur. Þetta er sama pattern og route weather og tryggir attribution og accuracy.

---

## Samræmi við núverandi stöðu (#67)

**Mikilvægt:** #67 route weather (`FerdalagidClient`, `TravelAuditMap`, heatmap, reverse-geocode) er enn **uncommitted**. Allar breytingar frá v089-v094 eru staged en ekki í git history.

Iceland map er **nýr milestone**, líklega #68 eða undirverkefni #67. Hann ætti **ekki** að byrja á meðan #67 breytingar eru uncommitted, til að forðast merge/conflict erfiðleika.

**Tillaga:** Bíddu með Phase A kóðarýni þar til #67 er committed og pushed. Phase A plan/hönnun (engin kóðabreyting) er hins vegar hægt að vinna samhliða.

---

## Lokaniðurstaða

| Atriði | Mat |
|--------|-----|
| Road-aware vs grid | Samþykkt, rétt val |
| BFF-only constraint | Samþykkt, ekki hægt að víkja frá |
| Engine reuse | Samþykkt, þarf þó Phase A refactor-rýni |
| Phase sequence | Samþykkt |
| Snapshot storage | Opið, þarf ákvörðun |
| Road point sourcing | Óskilgreint, þarf ákvörðun |
| THREDDS research | Geymist, ekki í Phase A |
| Feedback GDPR | Þarf að takast á við í Phase D |
| Snapshot type shape | Minniháttar tillaga (array vs record) |
| #67 commit dependency | Bíddu með Phase B+ |

Phase A hönnun/research getur hafist. Phase B kóði á ekki að byrja fyrr en:
1. Snapshot storage valinn.
2. Road point sourcing aðferð ákveðin.
3. #67 committed.

## Engar breytingar gerðar á kóða
