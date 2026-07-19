# 2026-07-17 12:15 - TODO-086 v418 - Codex: v417 hover copy og /vedrid routing plan

Created: 2026-07-17 12:15
Timezone: Atlantic/Reykjavik

## Stutt mannamal

v417 virkar vel. Næsta litla polish er að laga marker hover/title fyrir Veðurstofustöðvar: fjarlægja langa bandstrikið og nota sviga með dempuðum, lágstöfuðum status-texta.

Stærri product stefna: já, `teskeid.is/vedrid` ætti að verða nýja yfirlitið yfir veðrið/stöðvar/kort. En ekki gera gamla `/elta-vedrid` að default undir því nafni. Betra er að færa nýja reusable overview-upplifun inn sem alvöru `/vedrid` forsíðu og færa núverandi ferðareiknivél undir skýra leið, t.d. `/vedrid/ferdalagid`.

## Context

Stebbi staðfesti eftir `2026-07-17-1207-todo-086-v417-claude-b3a-polish-prerelease`:

- B3A polish virkar fínt.
- Hover texti á markerum er nú t.d. `Festarfjall — Ný gögn`.
- Ósk: nota frekar `Festarfjall (ný spágögn)` og dempa textana.
- Spurning: hvort planið sé að setja `/elta-vedrid` sem default þegar notendur fara á `teskeid.is/vedrid`, og færa núverandi `/vedrid` yfir á `/vedrid/ferdalagid`.

## Read / inspected

- `WORKFLOW.md`
- `ai-handoff/README.md`
- `ai-handoff/2026-07-17-1207-todo-086-v417-claude-b3a-polish-prerelease.md`
- `components/weather/IcelandOverviewMap.tsx`
- `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx`
- `app/vedrid/page.tsx`
- `app/auth-mvp/vedrid/page.tsx`
- `app/auth-mvp/vedrid/elta-vedrid/page.tsx`
- `messages/is.json`

## Finding / product advice

### Medium: Ekki binda product-routingu við gamla `elta-vedrid` nafnið

`/auth-mvp/vedrid/elta-vedrid` er nú tæknileg station explorer slóð með gömlu nafni. Ef hún verður bara sett beint sem default undir `/vedrid` festum við gamalt vinnuheiti í product-architecture.

Betra plan:

1. Gera reusable overview-map/station explorer component að sameiginlegum kjarna.
2. Nota þann kjarna sem nýju `/vedrid` lendinguna.
3. Færa núverandi ferðareiknivélina undir skýrt route, t.d.:
   - public: `/vedrid/ferdalagid`
   - authenticated: `/auth-mvp/vedrid/ferdalagid` eða halda `/auth-mvp/vedrid` tímabundið sem redirect/compat layer eftir nánari ákvörðun.
4. Halda gömlum slóðum virkum tímabundið með redirect eða compatibility, sérstaklega:
   - `/auth-mvp/vedrid/elta-vedrid`
   - deep links með `?stationId=...`
   - pulse `returnTo` flæði.

Ekki taka þessa routing-breytingu í sama litla hover-copy pass. Hún snertir public/auth routing, saved places, restore state, login-next og tests.

## Tiny next implementation: marker hover/title copy

### Núverandi hegðun

`IcelandOverviewMap.tsx`:

```ts
function markerTitle(label: string, statusLabel?: string): string {
  return statusLabel ? `${label} — ${statusLabel}` : label
}
```

`VedurstofanStationExplorerClient.tsx` sendir nú:

```ts
statusLabel: s.status === 'ok' ? t('statusOk') : s.status === 'stale' ? t('statusStale') : t('statusUnavailable')
```

Þetta gefur hover/title á borð við:

```text
Festarfjall — Ný gögn
```

### Ósk Stebba

Nota frekar:

```text
Festarfjall (ný spágögn)
Festarfjall (spá útgefin kl. 09:00, ný á leiðinni)
Festarfjall (engin spágögn til í Veðurstofuþjónustunni)
```

### Recommended implementation

1. Ekki breyta visible filter labels endilega í þessum pass, nema Stebbi biðji um það sérstaklega.
   - `Ný gögn / Gömul gögn / Vantar gögn` mega áfram vera skönnunarvæn í filterum/lista.
   - Nýju lengri textarnir eru sérstaklega fyrir marker title/hover/accessibility.

2. Bæta við dedicated tooltip/title keys undir `teskeid.vedrid.eltaVedrid`, t.d.:

```json
"statusOkTitle": "ný spágögn",
"statusStaleTitle": "spá útgefin kl. {time}, ný á leiðinni",
"statusStaleTitleNoTime": "eldri spá, ný á leiðinni",
"statusUnavailableTitle": "engin spágögn til í Veðurstofuþjónustunni"
```

English equivalents also required in `messages/en.json`.

3. Í `VedurstofanStationExplorerClient.tsx`, byggja `statusLabel` fyrir marker title úr nýju keys.
   - Fyrir `ok`: `t('statusOkTitle')`
   - Fyrir `stale`: nota `s.atimeIso` ef til staðar og formatta sem `HH:mm`; annars `statusStaleTitleNoTime`
   - Fyrir `unavailable`: `t('statusUnavailableTitle')`

4. Í `IcelandOverviewMap.tsx`, breyta title-samsetningu í sviga:

```ts
function markerTitle(label: string, statusLabel?: string): string {
  return statusLabel ? `${label} (${statusLabel})` : label
}
```

Status-labelinn á að koma þegar lágstafaður úr translation/key, ekki með runtime `toLowerCase()` á almennum user-facing texta. Það kemur í veg fyrir skrýtin locale/format edge cases.

5. Nota núverandi `atimeIso` úr station payloadinu. Ekki bæta við nýju API-kalli eða nýjum Google/Veðurstofa kostnaði.

## Routing plan: `/vedrid` sem ný landing

### Product direction

Stebbi er að hugsa rétt: `/vedrid` á líklega að verða "ástand landsins" / yfirlitskortið, og ferðareiknivélin verður aðgerð sem notandi fer í þaðan.

Recommended end-state:

```text
/vedrid
  Ný public Veðrið landing:
  Íslandskort, Veðurstofan layer, síðar Vegagerðin layer, common routes, weather/pulse overview.

/vedrid/ferdalagid
  Public ferðareiknivél, núverandi FerdalagidClient sem guest.

/auth-mvp/vedrid
  Authenticated Veðrið landing, með saved places/account-aware affordances.

/auth-mvp/vedrid/ferdalagid
  Authenticated ferðareiknivél með vistuðum stöðum og route restore.
```

Alternative: halda `/auth-mvp/vedrid` sem ferðareiknivél aðeins lengur, en þá verður product routing ósamræmd. Ef við viljum hreint mental model, þá ætti bæði public og authenticated að fá sama structure.

### Migration / compatibility

Ekki brjóta gömul flæði:

- `/vedrid` public linkar frá landing page þurfa að fara á nýja overview þegar hún er tilbúin.
- Núverandi ferðareiknivél þarf redirect eða CTA yfir á `/vedrid/ferdalagid`.
- Innskráðir notendur mega ekki missa saved places eða route restore.
- Pulse `returnTo` þarf að þekkja bæði overview og ferðalag.
- `/auth-mvp/vedrid/elta-vedrid?stationId=...` deep links þurfa annaðhvort að virka áfram eða redirecta með `stationId` varðveitt.

### Suggested phases

#### Phase R1 - Tiny hover/title polish

Scope:

- Only marker title copy and translation keys.
- No routing changes.
- No env changes.
- No deploy/commit unless separately approved.

#### Phase R2 - Route architecture plan only

Scope:

- Decide final route table.
- Decide whether authenticated `/auth-mvp/vedrid` becomes overview immediately or remains compatibility wrapper for one release.
- Identify all links/tests/returnTo/login-next affected.

#### Phase R3 - Extract route components

Scope:

- Extract current `FerdalagidClient` route usage so it can live cleanly under `/ferdalagid`.
- Reuse the same client core for public/auth variants.
- Preserve saved places and restore state for authenticated users.

#### Phase R4 - Make `/vedrid` overview landing

Scope:

- Use reusable provider overview component as the default Veðrið landing.
- Add CTA to `Reikna ferðaveðrið`.
- Keep compatibility redirects.

## Localhost checks for Stebbi

### After R1 hover/title polish

1. Open `/auth-mvp/vedrid/elta-vedrid`.
2. Hover a fresh station marker.
   - Expected: `Festarfjall (ný spágögn)`
   - No long dash in title.
3. Hover a stale station marker if test data has one.
   - Expected: `Stöðvarheiti (spá útgefin kl. HH:mm, ný á leiðinni)` or the no-time fallback if atime is missing.
4. Hover unavailable station marker.
   - Expected: `Stöðvarheiti (engin spágögn til í Veðurstofuþjónustunni)`.
5. Verify visible filter labels still read well and did not become long awkward strings.
6. Verify close X still removes `stationId` from URL as v417 fixed.

### After later routing phases

1. Public `/vedrid` opens overview, not the old trip wizard.
2. Public CTA opens `/vedrid/ferdalagid` and current trip wizard still works.
3. Signed-in user lands in authenticated version and still has saved places.
4. Pulse links preserve `returnTo`.
5. Old `/auth-mvp/vedrid/elta-vedrid?stationId=...` deep link still opens the same station or redirects to the new equivalent.

## Suggested prompt for Claude Code

```text
Workflow

Lestu:
- WORKFLOW.md
- ai-handoff/2026-07-17-1207-todo-086-v417-claude-b3a-polish-prerelease.md
- ai-handoff/2026-07-17-1215-todo-086-v418-codex-v417-hover-copy-and-vedrid-routing-plan.md

Framkvæmdu aðeins Phase R1 úr v418:
- Fjarlægja langa bandstrikið úr marker hover/title.
- Nota sviga: `Stöðvarheiti (status)`.
- Bæta við dedicated marker-title translation keys fyrir Veðurstofan:
  - ný spágögn
  - spá útgefin kl. HH:mm, ný á leiðinni
  - fallback þegar atime vantar
  - engin spágögn til í Veðurstofuþjónustunni
- Nota núverandi `atimeIso` úr station payloadinu ef það er til.
- Ekki breyta routing í þessum pass.
- Ekki breyta visible filter labels nema nauðsynlegt sé.
- Ekki bæta við nýju API-kalli eða beinum kostnaði.
- Keyra viðeigandi type-check/test.
- Skila strax handoff.

Ekki commit-a, push-a, deploya, keyra SQL eða breyta env.
```

## Óvissa / þarf að staðfesta

- Ég staðfesti með source inspection að `StationExplorerStation` inniheldur `atimeIso`, þannig að stale hover ætti að geta sýnt útgáfutíma án nýs API-kalls.
- Ég tók ekki ákvörðun um endanlegt authenticated route structure. Það þarf sér R2 plan áður en `/auth-mvp/vedrid` er fært, því saved places, restore state, login-next og pulse returnTo eru viðkvæm.
