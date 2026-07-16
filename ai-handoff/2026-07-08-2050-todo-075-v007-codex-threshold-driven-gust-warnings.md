# Codex review: TODO #75 v007 — Hviðumerki stýrast af sömu veðurmörkum og ferðamatið

Created: 2026-07-08 20:50
Timezone: Atlantic/Reykjavik
Agent: Codex
Review target: `2026-07-08-2047-todo-075-v006-claude-v005-review.md`
Builds on:
- `2026-07-08-2045-todo-075-v005-codex-gust-display-review.md`
- `2026-07-08-2047-todo-075-v006-claude-v005-review.md`

Related TODO: #75

---

## Findings fyrst

1. **Já: hviðumerki/varúð á að stýrast af þeim thresholds sem ferðamatið notar.** Þetta á ekki að vera nýtt fast UI-gildi. Ef notandi velur engan eftirvagn, hjólhýsi/hestakerru eða stillir sín eigin mörk, á `Spá 🥄` taflan að sýna varúð miðað við nákvæmlega sömu mörk.

2. **Nota `travelPlan.thresholdsUsed` eða server-side resolved thresholds, ekki draft state í UI.** `FerdalagidClient` getur haft ósend draft-gildi í threshold-step. Spátaflan á að endurspegla síðasta reiknaða mat, ekki óvistaðar breytingar sem notandi hefur ekki keyrt.

3. **V006 notice-spurningin verður einfaldari ef notice er líka threshold-relative.** Í stað þess að `notice` sé fyrst og fremst `gustMs >= windMs * 1.35`, ætti það að vera tengt `redGustMs`, með litlum spike-check til að forðast merkingarlausar viðvaranir í logni.

4. **Þetta styrkir product-trust.** Sama tafla og segir `Spá 🥄` þarf að svara: “Miðað við þau veðurmörk sem þú valdir, er þessi hviða eitthvað sem skiptir máli?”

---

## Núverandi kóði styður þessa stefnu

Í kóðanum er þetta nú þegar til:

- `resolveThresholds(trailerKind, thresholdOverrides)` sameinar valinn eftirvagn/engan eftirvagn og custom gildi.
- `travelPlan.thresholdsUsed` geymir resolved gildin sem voru raunverulega notuð.
- `evalDrivingLeg(...)` notar `ResolvedTravelThresholds`.
- `deriveThreshold(...)` getur skilað notendamiðuðum threshold-gildum ef `resolved` er sent inn.
- UI notar nú þegar `thresholdsUsed` í heatmap/detail samhengi.

Því ætti `buildForecastRows(...)` eða sambærilegur helper að taka `ResolvedTravelThresholds` inn sem parameter.

---

## Mælt severity-regla

Nota resolved `redGustMs` sem grunn.

```ts
type GustSeverity = 'none' | 'notice' | 'caution' | 'danger'

function deriveGustSeverity(
  windMs: number,
  gustMs: number,
  thresholds: ResolvedTravelThresholds,
): GustSeverity {
  const red = thresholds.redGustMs
  if (gustMs >= red) return 'danger'
  if (gustMs >= red * 0.8) return 'caution'
  if (gustMs >= red * 0.65 && gustMs - windMs >= 3) return 'notice'
  return 'none'
}
```

Ástæða:

- `danger` er nákvæmlega sama rauða hviðamark og ferðamatið notar.
- `caution` er “nálægt þínum mörkum”, ekki föst tala.
- `notice` sýnir áhugaverða hviðu þegar hún er bæði nokkuð nálægt mörkum og talsvert yfir meðalvindi.
- Sama forecast getur því verið `none` án eftirvagns en `caution` með hestakerru eða custom lágum mörkum. Það er rétt hegðun.

Athugið: 0.8 og 0.65 eru UI-severity thresholds, ekki ný ferðamatsmörk. Þau eiga aðeins að stjórna birtingu/athygli í töflunni.

---

## Dæmi um hegðun

Ef `redGustMs = 35` (enginn eftirvagn):

- hviða 15 m/s: yfirleitt engin varúð
- hviða 24 m/s með vind 18 m/s: `notice`
- hviða 29 m/s: `caution`
- hviða 35 m/s: `danger`

Ef `redGustMs = 18` (viðkvæmur eftirvagn/hestakerra):

- hviða 15 m/s: `caution`
- hviða 18 m/s: `danger`

Ef notandi setur custom `redGustMs = 12`:

- hviða 10 m/s: `caution`
- hviða 12 m/s: `danger`

Þetta passar við væntingu Stebba: varúðin fylgir því sem notandi valdi.

---

## UI texti

Ekki segja bara `⚠`.

Tooltip/aria/accessibility þarf að nefna mörkin:

- `Hviður 15,8 m/s, nálægt þínum hviðamörkum 18 m/s`
- `Hviður 18,4 m/s, yfir hviðamörkum 18 m/s`

Ef ekki er gott að segja “þínum” þegar engin custom gildi eru valin, má nota hlutlausara:

- `nálægt völdum hviðamörkum`
- `yfir völdum hviðamörkum`

Mælt er með að textar fari í `messages/is.json` og `messages/en.json`.

---

## Mikilvægt data-state atriði

Ef notandi breytir threshold inputs eftir að niðurstaða er komin, en keyrir ekki matið aftur:

- spátaflan á áfram að nota `result.travelPlan.thresholdsUsed`
- ekki `effectiveThresholds` úr núverandi draft state

Annars getur notandi séð töflu sem sýnir varúð miðað við önnur mörk en niðurstöðuspjaldið og heatmap voru reiknuð með.

Ef UI vill sýna að stillingar hafi breyst eftir reikning, má það vera sér “reiknaðu aftur” state, en ekki hluti af #75 Phase 1 nema það sé þegar til.

---

## Tæknileg leið

Phase 1:

1. `buildForecastRows(hours, thresholdsUsed)` tekur `ResolvedTravelThresholds`.
2. `ForecastDrawerGustCell.severity` reiknast út frá `thresholdsUsed.redGustMs`.
3. `ForecastDrawerGustCell.accessibleLabel` inniheldur bæði hviðugildi og viðmiðið sem var notað.
4. `ForecastDrawer` renderar:
   - `danger`: rauður tónn + varúðarmerki
   - `caution`: amber tónn + varúðarmerki
   - `notice`: mildur tónn, líklega án sterks varúðarmerkis
   - `none`: venjulegur texti
5. Arrival forecast rows og route point forecast rows nota sama helper, svo hegðun sé samræmd.

Ekki reikna severity beint í React component nema sem síðasta fallback. Það á að vera unit-testable.

---

## Prófanir

Unit tests:

- `redGustMs=35`, `gust=20`, `wind=10` -> ekki `caution/danger`
- `redGustMs=35`, `gust=29` -> `caution`
- `redGustMs=35`, `gust=35` -> `danger`
- `redGustMs=18`, `gust=15` -> `caution`
- `redGustMs=18`, `gust=18` -> `danger`
- `redGustMs=12`, `gust=10` -> `caution`
- `gust=5.4`, `wind=4`, `redGustMs=35` -> `none`, svo v006 áhyggjan um of næmt `notice` lokist
- `notice` þarf bæði að vera threshold-relative og spike yfir meðalvindi

Integration-ish:

- Sama forecast row, mismunandi `thresholdsUsed`, skilar mismunandi `gust.severity`.
- `buildForecastRows` notar parameterinn sem hann fær, ekki global `WEATHER_THRESHOLDS`.

---

## Localhost checks for Stebbi

Opna `http://localhost:3004/auth-mvp/vedrid` eða það localhost-port sem Stebbi er með í gangi.

Prófa:

1. Reikna leið, t.d. Garðabær -> Þorlákshöfn, með `Enginn eftirvagn`.
2. Opna `Spá 🥄` og skoða hviðumerkingar í vinddálki.
3. Fara aftur í eftirvagnsskref og velja viðkvæmari valkost, t.d. hestakerru/hjólhýsi eftir því hvað er í UI.
4. Reikna aftur.
5. Opna sömu `Spá 🥄` og staðfesta að hviðumerki séu næmari ef mörkin eru lægri.
6. Stillta custom hviðamörk lægra en default, reikna aftur og staðfesta að hviðumerki fylgi custom gildinu.
7. Breyta custom input eftir niðurstöðu án þess að reikna aftur ef UI leyfir það. Staðfesta að taflan endurspegli enn síðast reiknuð `thresholdsUsed`, ekki ósend draft-gildi.
8. Prófa 390 px mobile viewport: hviður í vinddálki mega ekki valda láréttu overflowi.

Regression sem þarf að passa:

- Niðurstöðuspjald, heatmap, `Mest krefjandi` og `Spá 🥄` mega ekki nota mismunandi thresholds fyrir sömu niðurstöðu.
- Engin hardcoded gust warning tala sem hunsar custom veðurmörk.
- Engin SQL/RLS/auth breyting.
- Engin ný met.no eða Google API köll nema það sé sérstaklega samþykkt.

---

## Codex niðurstaða

Stebbi hefur rétt fyrir sér: varúðin á að stýrast af thresholds sem Teskeið á nú þegar.

Mælt er með að v006 opna ákvörðunin um `notice` lokist svona:

`danger/caution/notice` eru öll afleidd af `thresholdsUsed.redGustMs`, með spike-check fyrir `notice`.

Þá verður `Spá 🥄` taflan samkvæm ferðamatinu, eftirvagnavalinu og custom veðurmörkunum.
