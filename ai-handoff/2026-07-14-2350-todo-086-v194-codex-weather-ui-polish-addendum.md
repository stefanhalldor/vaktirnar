# TODO 086 v194 - Codex UI polish addendum after SQL77

Created: 2026-07-14 23:50
Timezone: Atlantic/Reykjavik

Mode:
- Rýni og handoff/plan only.
- Engar kóðabreytingar, engin SQL keyrð, ekkert commit/push/deploy.
- Byggt á nýjustu skjámynd/athugasemd Stebba eftir SQL77 umræðu.
- `Design.md` lesið fyrir UI-reglur: mobile-first, þétt en ekki þröngt, ekki kort inni í kortum, textar í `messages`, stable controls og enginn mobile overflow.

## Stebbi request

Stebbi vill fjóra polish-liði:

1. Kortið zoomi út um eitt zoom by default til að sjá allt Ísland.
2. Footer-línan `Byggt á gögnum frá MET Norway (met.no)` fari út allsstaðar í footerum.
3. Provider-filterinn fari aftur í einfaldari eina línu/þjappaða framsetningu:
   - `Sannreynt` / `met.no` / `Yr spágögnin`
   - `Í prófunum` / `Veðurstofan`
   - `Væntanlegt` / `Vegagerðin`
4. Varúðarboxið verði bara:
   - `Fyrir akstur skaltu líka athuga hviður og vegaaðstæður, t.d. hjá [Vegagerðinni](https://umferdin.is/), sérstaklega ef þú ert með kerru, fellihýsi eða hjólhýsi.`

## Findings / important nuance

### Medium - Remove footer attribution, but do not remove attribution entirely

Stebbi vill taka footer-línuna út allsstaðar. Codex er sammála að footer-línan sé núna ljót og ruglar þegar fleiri providerar eru inni.

En ekki fjarlægja MET Norway/met.no attribution algjörlega úr vörunni þegar met.no gögn eru notuð. Official api.met.no Terms of Service segja undir Attribution að open data require attribution under CC BY 4.0 and appropriate credit. Source: https://api.met.no/doc/TermsOfService

Ráðlegging:

- Fjarlægja standalone footer-línur úr UI.
- Halda provider attribution inni í provider-filter / provider-source samhengi.
- Fyrir met.no má `met.no` + helper `Yr spágögnin` vera nægilega sýnilegt í gagnaveitu-row, eða bæta mjög litlum source/info link síðar ef þarf.
- Ekki hafa botn-footer sem segir bara `Byggt á gögnum frá MET Norway (met.no)` þegar Veðurstofan er líka virk.

### Low - SQL77 comment typo er ekki tengt þessu

Active file er `sql/77_vedurstofan_forecasts_history.sql`, en þessi UI polish er óháð SQL77.

Ekki breyta SQL77 í þessum áfanga nema Claude Code vilji laga comment-only typo:

- núverandi comment segir `sql/74_vedurstofan_stations.sql`
- rétt filename er `sql/74_vedurstofan_product_tables.sql`

Þetta er ekki blocker og má bíða.

## Likely code touchpoints

### Map zoom

Station explorer / "Elta veðrið":

- `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx`
- Núverandi:

```ts
center: { lat: 64.9, lng: -18.8 },
zoom: 6,
```

Stebbi request: zooma út um eitt til að sjá allt Ísland.

Recommendation:

- Breyta `zoom: 6` í `zoom: 5` fyrir Elta veðrið station map.
- Ekki breyta route/weather audit map nema Stebbi sé sérstaklega að tala um það kort.

Route audit map:

- `components/weather/TravelAuditMap.tsx` er með initial `zoom: 7`, en route map kann að nota bounds síðar.
- Ef Claude sér að screenshotið er úr `TravelAuditMap`, þá þarf varlega að stilla fitBounds/padding/maxZoom frekar en blind `zoom: 7 -> 6`.

### Footer attribution

Likely places:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
  - footer line around `t('attribution')`
- `app/auth-mvp/vedrid/VedridClient.tsx`
  - footer line around `t('attribution')`
- `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx`
  - station explorer attribution line around `{t('attribution')} · {data.attribution.serviceUrl}`
- `messages/is.json`
  - `"attribution": "Byggt á gögnum frá MET Norway (met.no)"`
- `messages/en.json`
  - `"attribution": "Based on data from MET Norway (met.no)"`

Recommendation:

- Remove/hide footer render sites, not necessarily delete message keys unless unused.
- If message keys become unused, remove only after `rg` confirms no references.
- Keep provider source visible in provider filter/chips.

### Provider filter one-line layout

Likely place:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- Current provider filter is a vertical stack with three groups and helper copy.

Target layout:

- Compact horizontal provider row inside the existing result summary card.
- Mobile-first, no overflow at 360px.
- Use three compact provider tiles/chips in a `grid grid-cols-3 gap-2` or `flex flex-wrap`.
- Each tile:
  - tiny status label above or inline: `Sannreynt`, `Í prófunum`, `Væntanlegt`
  - provider name
  - toggle for enabled providers
  - disabled visual for Vegagerðin
- Vegagerðin should include/link to `https://umferdin.is/`, but stay disabled.

Text changes:

- `providerMetnoHelperText`: `Yr spágögnin`
- `providerVedurstofanHelperText`: remove from visible UI, or keep empty/unused.
- `providerVegagerdinHelperText`: remove from visible UI; just show `Vegagerðin`.
- Make `Í prófunum` visually enough to explain Veðurstofan status. No extra sentence needed.

Important:

- Keep toggles accessible:
  - `role="switch"`
  - `aria-checked`
  - keyboard focus-visible
  - touch target around 40px
- Do not let `Vegagerðin` disabled tile look clickable unless the link is separate and clearly only opens `umferdin.is`.

### Varúðarbox copy

Likely message key:

- `messages/is.json`
  - `features.weather.travel.weatherDisclaimer`
- `messages/en.json`
  - same key in English

Current IS includes extra sentence:

```text
Þetta er mat sem byggir á gögnum frá sömu veðurþjónustu og Yr notar. Fyrir akstur ...
```

Replace IS visible copy with:

```text
Fyrir akstur skaltu líka athuga hviður og vegaaðstæður, t.d. hjá <link>Vegagerðinni</link>, sérstaklega ef þú ert með kerru, fellihýsi eða hjólhýsi.
```

English equivalent:

```text
Before driving, also check gusts and road conditions, e.g. with the <link>Icelandic Road Administration</link>, especially if you are towing a trailer, folding camper, or caravan.
```

Places using this key:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `components/weather/VedurstofanPointCard.tsx`

Good: changing the message key should update both if both use `weatherDisclaimer`.

## Recommended implementation order for Claude Code

1. Adjust Elta veðrið map default zoom.
2. Remove standalone footer attribution render sites.
3. Rework provider filter to compact one-line/three-tile layout.
4. Update `weatherDisclaimer` text in both locales.
5. Verify no text overflow on 360px mobile.
6. Run focused tests/typecheck if touched files are covered.

## Out of scope

- Do not touch SQL77 for this UI polish except optional comment typo.
- Do not change provider calculation logic.
- Do not change feature flag contract.
- Do not remove met.no source attribution from the product entirely; remove the footer placement.
- Do not add Vegagerðin data ingestion in this pass.

## Localhost checks for Stebbi

After Claude Code implements:

1. Open `/auth-mvp/vedrid/elta-vedrid`.
   - Expected: initial Google map is zoomed out one level and shows all Iceland more comfortably.
   - Station markers should still be usable.
2. Open normal Ferðaveður flow on `/auth-mvp/vedrid`.
   - Expected: no footer line `Byggt á gögnum frá MET Norway (met.no)` at bottom.
   - Repeat on entry screen and result screen if both have footers.
3. With Veðurstofan provider flag enabled:
   - Expected provider filter is compact, one-line/three-tile style.
   - Text should read:
     - `Sannreynt` / `met.no` / `Yr spágögnin`
     - `Í prófunum` / `Veðurstofan`
     - `Væntanlegt` / `Vegagerðin`
   - Vegagerðin remains disabled and links to `umferdin.is`.
4. Toggle met.no and Veðurstofan:
   - Expected: same calculation behavior as before.
   - This is visual polish only.
5. Trigger a result with amber caution box:
   - Expected: box only contains the shorter Vegagerðin/hviður warning.
   - Link opens `https://umferdin.is/` in a new tab.
6. Check 360px/390px mobile width:
   - no horizontal overflow,
   - provider row does not overlap,
   - touch targets remain usable.

## Suggested copy/paste to Claude Code

```text
Claude Code, framkvæmdu afmarkaðan UI-polish á TODO 086 samkvæmt v194 Codex handoff.

Scope:
1. Elta veðrið station map: zoom out default by one level so all Iceland is visible more comfortably.
2. Remove standalone footer attribution lines such as “Byggt á gögnum frá MET Norway (met.no)” from weather footers. Do not remove provider attribution entirely from the product; keep source/provider identity in the provider filter/chips.
3. Rework provider filter into compact one-line/three-tile layout:
   - Sannreynt / met.no / Yr spágögnin
   - Í prófunum / Veðurstofan
   - Væntanlegt / Vegagerðin, disabled, with link to https://umferdin.is/
4. Replace `weatherDisclaimer` copy with:
   “Fyrir akstur skaltu líka athuga hviður og vegaaðstæður, t.d. hjá Vegagerðinni, sérstaklega ef þú ert með kerru, fellihýsi eða hjólhýsi.”
   Keep the Vegagerðin text as a link to https://umferdin.is/.

Constraints:
- Do not touch SQL77 except optional comment typo.
- Do not change provider calculation logic.
- Do not change feature flags.
- Keep mobile-first Design.md rules: no horizontal overflow, stable touch targets, all user text in messages/is.json and messages/en.json.
- Run relevant tests/typecheck.
- Do not commit, push, deploy, or run SQL unless Stebbi separately asks.
```
