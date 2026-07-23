# TODO-086 - Post-release handoff: Mitt veður reorder + sticky date header

Created: 2026-07-23 16:46
Timezone: Atlantic/Reykjavik

## Skilningur á samþykki

Stebbi gaf framkvæmdarleyfi með skýrum lýsingum. Commit, push og Vercel-build staðfest.

Ekki samþykkt og ekki gert: SQL, migration, Supabase, auth, secrets, billing, deploy utan push.

## Hvað var gert

### 1. Mitt veður — töflan fyrst, stillingarnar faldar

File: `components/weather/WeatherChasePanel.tsx`

Röðin í glugganum er nú:

1. **Töflan** (veðurstöðvar notandans / default stöðvar) — alltaf sýnileg efst
2. **Tímar í töflu** — takkarnir til að velja klukkustundir
3. **Breyta / stilla** — takki sem opnar/lokar stillingasvæði
4. (þegar opið) **Stillingarsvæði:**
   - Titill + undirtitill ("Mitt veður" / skýring)
   - Leitargluggi (bæta við stöð)
   - Veðurgildi: hitastig, vindur, úrkoma
   - Röðunarlisti (með nálægar stöðvar)

Áður var röðin: titill → leit → veðurgildi → tafla → röðunarlisti.

Nýtt state: `settingsOpen` (boolean, default `false`).

Nýtt label: `settingsLabel` — "Breyta / stilla" (IS) / "Edit / settings" (EN).

### 2. Fest efsta röð í töflu (>3 stöðvar)

Þegar fleiri en 3 stöðvar eru valdar birtist töflan sem CSS grid. Áður var
`overflow-x-auto` á ytri wrapper, sem krafðist þess að `sticky top-0` gilti
miðað við þann scroll-container. En `overflow-x-auto` setur upp nýjan stacking
context, svo sticky-ið virkaði ekki þegar notandinn skrollaði niður í glugganum.

Lagfæring: yfirliggja wrapper breyttist í `overflow-auto` með `maxHeight: '55vh'`.
Þannig er töflan sjálfstæður scroll-container (bæði x og y), og `sticky top-0`
á dagsetningarröðinni virkar rétt í þeim feli.

### 3. WORKFLOW.md uppfært

Nafnaregla fyrir handoff-skrár uppfærð:
- Codex skrár: `codex`
- Claude Code skrár: `-Claude-` (há-C)

### 4. Skilaboðalyklar bætt við

| Skrá | Lykill | IS | EN |
|------|--------|----|----|
| is.json / en.json | `roadMapPrototypeWeatherChaseSettings` | "Breyta / stilla" | "Edit / settings" |

### 5. RoadMapPrototypeMap.tsx

`settingsLabel` bætt við labels-hlutinn sem er sendur til `WeatherChasePanel`.

## Skrár breyttar

- `components/weather/WeatherChasePanel.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`
- `WORKFLOW.md`

## Skipanir og niðurstöður

1. `npm run type-check` — exit code 0
2. `npm run test:run` — 129 skrár, 3577 próf, 27 skipped, 8 todo. Exit code 0.
3. `git commit` — `6663233`
4. `git push` — tókst
5. `vercel ls` — build `● Ready` eftir ~44s

## Localhost checks fyrir Stebbi

Síða: `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`

1. Opnaðu Mitt veður (🌦️). Staðfestu að töflan komi strax efst — ekki leitargluggi eða stillingarsvæði.
2. Staðfestu að "Tímar í töflu" komi rétt fyrir neðan töfluna.
3. Staðfestu að "Breyta / stilla ▼" takki sé til staðar. Ýttu á hann.
4. Staðfestu að stillingarsvæðið opnist: titill, leit, veðurgildi, röðunarlisti.
5. Lokaðu stillingarsvæðinu með "Breyta / stilla ▲". Staðfestu að töflan sé eina sýnilega innihaldið (auk "Tímar í töflu").
6. Veldu 4+ stöðvar. Opnaðu Mitt veður. Skrollaðu niður í töflunni. Staðfestu að dagsetningarröðin (efsta röð) fylgi með niður (sticky).
7. Skrollaðu til hliðar í töflunni. Staðfestu að fyrsti dálkurinn (staðarheiti) sé einnig fastur (sticky left).
8. Athugaðu á mobile-breidd (360/390px) að ekkert renni út af skjá.

## Óvissa

- `maxHeight: '55vh'` á töflunni er fast gildi. Á mjög lágum skjám (< 600px hæð) gæti taflan þrengt sig. Hægt að breyta í `60vh` eða `calc(100vh - 18rem)` ef þörf krefur.
- Vercel-build staðfest `Ready`. Lauslegar build-viðvaranir (hook-dependency í `RoadMapPrototypeMap.tsx`) eru eldri og ekki nýjar.
