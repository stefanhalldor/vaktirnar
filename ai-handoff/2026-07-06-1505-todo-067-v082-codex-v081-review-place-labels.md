# todo-067 v082 - Codex review of v081, place labels for forecast points

Created: 2026-07-06 15:05  
Timezone: Atlantic/Reykjavik  
Review target: `2026-07-06-1500-todo-067-v081-claude-v080-done`  
Reviewer: Codex  
Relevant TODO: #67 / ongoing `todo-067` Ferðalagið weather work

## Findings

### P1 - Raw i18n keys are visible in the UI

Stebbi's screenshots show raw keys in user-facing UI:

- `teskeid.vedrid.ferdalagid.nextCautionLine`
- `teskeid.vedrid.ferdalagid.pointTimeLine`
- `teskeid.vedrid.ferdalagid.routePointCoord`

This is a release blocker for this pass. It makes the feature look broken even though the underlying data may be right.

Local code check:

- `messages/is.json` does contain these keys under `teskeid.vedrid.ferdalagid`.
- `components/weather/TravelAuditMap.tsx` calls `tf('pointTimeLine')`, `tf('routePointCoord')`, `tf('forecastPointCoord')`.
- `app/auth-mvp/vedrid/FerdalagidClient.tsx` calls `tf('nextCautionLine')`.

So this may be stale dev-server/message cache after message-file changes, but Claude Code should not assume that. Before marking V081 done, verify after a full dev restart and hard refresh. If raw keys still show, fix the namespace/message loading issue and add a small regression check.

### P1 - Stebbi wants a human place label, not only coordinates

The new map auditability is directionally right, but the current details still feel too technical:

- `Spápunktur met.no: 64.280, -21.840`
- Yr opens a page titled `64.280, -21.840`

That is mathematically honest, but it will irritate normal users. They expect something closer to:

- `Spápunktur met.no nálægt Lokufjalli`
- `Punktur á leið við Hvalfjörð`
- `Skoða spá hjá Yr fyrir svæðið nálægt Lokufjalli`

Important terminology: do not call this a `veðurstöð` unless we add actual observation station data. In this phase it should be a human-readable label for a forecast/model point.

### P2 - Place names must be approximate context, not a new source of truth

Coordinates remain the source of truth for weather lookup and deterministic scoring.

The place name should be presented as context:

- Good: `nálægt Lokufjalli`
- Good: `við Hvalfjörð`
- Risky: `Lokufjall` as if the exact forecast point is the named place
- Wrong: `veðurstöðin Lokufjall` unless an actual station is used

Use wording that admits approximation. This protects trust when reverse geocoding returns a nearby mountain, farm, road, municipality or water body that is close but not exact.

### P2 - Do not reverse-geocode every marker eagerly

The route can have many weather points. Calling a geocoder or Places endpoint for all of them immediately can create latency, quota/billing noise and unstable UI.

Recommended first implementation:

- Resolve a human label lazily for the selected point.
- Also resolve the initially selected issue point, highlighted point or next-caution point.
- Cache by forecast coordinate, e.g. `forecastLat,forecastLon` rounded consistently.
- Do not block rendering the map while the name is loading.
- If no useful name is found, fall back gracefully to coordinates.

Later, if this proves valuable, we can pre-resolve all points server-side with caching.

### P2 - `Skoða veðurspá` cannot guarantee Yr displays a name for arbitrary coordinates

Yr may still show the page title as coordinates for arbitrary lat/lon URLs. We should not rely on controlling the external page title.

What we can control:

- The selected point card in Teskeið should show the human label before the user clicks.
- The link text can be more contextual, e.g. `Skoða spá hjá Yr`.
- Coordinates should remain visible in a secondary audit line.
- If a later phase finds a stable Yr named-place URL, use it. Do not block this pass on that.

### P2 - The map should eventually mark next-caution on green results

V081's open question 3 is valid. When the current result is green but `nextCaution` exists, the map should eventually be able to show `Næsta varúð` on the relevant point/time.

This does not have to be bundled with place labels if the pass gets too large, but it is the natural next auditability step after the raw i18n leak is fixed.

## Recommended implementation direction

Add a lightweight place-label layer for forecast points.

Suggested data shape in the UI/helper layer:

- `forecastPlaceLabel?: string`
- `forecastPlaceSource?: 'reverse_geocode' | 'known_place' | 'origin' | 'destination' | 'fallback'`
- `forecastPlaceConfidence?: 'nearby' | 'approximate' | 'unknown'`

Suggested UI copy:

- Header or subline:
  - `Spápunktur met.no nálægt {place}`
  - fallback: `Spápunktur met.no`
- Coordinate audit lines:
  - `Punktur á leið: {lat}, {lon}`
  - `Spápunktur met.no: {lat}, {lon}`
- Link area:
  - `Skoða spá hjá Yr`
  - `Opna á korti`
  - `Hrá met.no gögn`

Suggested technical approach for this pass:

1. Fix/verify i18n key rendering first.
2. Add lazy client-side place label resolution for selected forecast point only.
3. Use the existing Google Maps setup if it can provide reverse geocoding without a new package.
4. If that requires enabling a new Google API/SKU, stop and flag it for Stebbi before implementation or make it optional behind env/provider config.
5. Cache resolved names per selected forecast coordinate during the session.
6. Keep coordinates visible as audit data.
7. Use approximate wording everywhere.

Potential resolver priority:

1. Origin or destination name if the selected point is the origin/destination point.
2. Reverse-geocoded local/natural/place label for `forecastLat/forecastLon`.
3. Nearest known place from existing local place data if available and close enough.
4. Coordinate fallback.

Do not add scraping of Yr or Veðurstofan pages for place names.

## Suggested message for Claude Code

```text
V081 er ekki tilbúið sem localhost-polish enn. Bættu þessum fixum við næsta pass áður en við metum þetta sem gott:

1. P1 blocker: raw i18n keys sjást í UI samkvæmt screenshots:
   - teskeid.vedrid.ferdalagid.nextCautionLine
   - teskeid.vedrid.ferdalagid.pointTimeLine
   - teskeid.vedrid.ferdalagid.routePointCoord

   Keys virðast vera til í messages/is.json, þannig að fyrst þarf að staðfesta eftir full dev restart + hard refresh. Ef raw keys sjást enn, laga namespace/message loading og bæta regression-check þannig að nýju keys leki ekki aftur.

2. Stebbi vill ekki bara hnit. Selected point/details þarf human-readable staðarheiti eða nálægðarheiti fyrir spápunktinn.

   Ekki kalla þetta "veðurstöð" nema við séum í alvöru að nota physical observation station. Í þessum fasa er rétta orðalagið:
   - "Spápunktur met.no nálægt {place}"
   - eða fallback "Spápunktur met.no"

3. Hnitin eiga áfram að vera audit/source-of-truth details:
   - Punktur á leið: {lat}, {lon}
   - Spápunktur met.no: {lat}, {lon}

4. Ekki reverse-geocode-a alla punkta eagerly. Byrjaðu með lazy lookup fyrir selected point / highlighted point / next-caution point og cache-aðu niðurstöðu per forecast coordinate. Map og kortaupplýsingar mega renderast strax á meðan label er að hlaðast.

5. Ef þú notar Google reverse geocoding eða Places fyrir þetta og það krefst nýs API/SKU/stillingar, stoppaðu og flaggaðu það fyrir Stebba áður en það verður dependency. Ef hægt er að nota núverandi Google Maps setup án nýrrar stillingar, gerðu það varlega og með fallback.

6. UI copy:
   - sýna "Spápunktur met.no nálægt {place}" ef nafn fannst
   - nota approximate wording, ekki fullyrða að punkturinn sé nákvæmlega í staðnum
   - link text má vera "Skoða spá hjá Yr"
   - gera ráð fyrir að Yr sjálft geti samt sýnt hnit í page title; Teskeið þarf að gefa context áður en notandi smellir

7. Localhost QA eftir fix:
   - engir raw teskeid.vedrid lyklar sjást
   - route eins og Ásgarðslaug -> Akranes sýnir point details með mannamálsheiti ef resolver finnur það
   - ef ekkert heiti finnst, fallback er snyrtilegt og hnitin sjást enn
   - mobile 390px: map, point card og links overflowa ekki
   - ekkert nýtt Google/API billing dependency er komið inn án þess að það sé skýrt í handoffinu
```

## Localhost checks for Stebbi

After Claude Code implements the next pass:

1. Restart the dev server once after message-file changes, then hard refresh the browser.
2. Open `/auth-mvp/vedrid`.
3. Test `Ásgarðslaug -> Akranes`.
4. Confirm no raw text keys beginning with `teskeid.vedrid` are visible anywhere.
5. Tap/click several map points.
6. Confirm the selected point card shows a human-readable forecast point label when available, e.g. `Spápunktur met.no nálægt ...`.
7. Confirm it still shows both coordinate audit lines:
   - point on route
   - met.no forecast point
8. Click `Skoða spá hjá Yr`.
9. It is acceptable if Yr itself still titles the external page with coordinates, but Teskeið should have shown the contextual place label before the click.
10. Test a point where no useful place name is found. The fallback should look intentional, not broken.
11. Test mobile around 360-430px. The map card, selected point panel and links must not overflow.
12. Watch Google/API console only if a new reverse-geocoding call is introduced. Do not enable new paid APIs or loosen key restrictions casually just to test labels.

## Uncertainty / needs confirmation

- I have not confirmed whether the raw i18n keys are a real code bug or stale dev-server state after message changes. They are visible in Stebbi's screenshot, so the next pass must verify this explicitly.
- I have not confirmed whether Google reverse geocoding is already usable with the current API key restrictions. If it requires enabling a new API/SKU, that should be treated as a small provider/billing decision before implementation.
- Yr may not support a stable named-place URL for arbitrary route forecast coordinates. The product should not depend on external Yr titles becoming pretty.

