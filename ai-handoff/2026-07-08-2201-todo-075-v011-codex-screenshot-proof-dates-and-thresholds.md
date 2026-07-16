# Codex review: TODO #75 v011 — Screenshot-proof dagar og veðurmörk nálægt scrubber

Created: 2026-07-08 22:01
Timezone: Atlantic/Reykjavik
Agent: Codex
Builds on:
- `2026-07-08-2110-todo-075-v009-claude-phase1-done.md`
- `2026-07-08-2134-todo-075-v010-codex-phase1-release-review.md`

Related TODO: #75 / Ferðaveður result polish

---

## Stebbi input

Stebbi vill að niðurstöðukassinn standist betur tímans tönn og sé screenshot-proof:

- Dagurinn á alltaf að sjást innan scrubbersins. Í skjámynd 2 sést ekki að valdi tíminn er á fimmtudegi.
- Þegar talað er um brottfarartíma og komutíma á líka að taka fram daginn, alltaf.
- Skoða hvort gildin fyrir valin veðurmörk eigi að birtast í pillunum, undir þeim eða einhvers staðar nálægt:
  - `Gott veður (fjöldi)`
  - vind-emoji + `<10 m/s`
  - regndropa-emoji + `<x mm/klst`
  - o.s.frv.

---

## Findings fyrst

1. **Release-polish: dagsetning þarf að fylgja völdum sloti, ekki bara day separator.**
   `DepartureHeatmap` sýnir day separator bara þegar nýr dagur byrjar í visible röðinni. Þegar scrubber er skrollaður þannig að separator er utan skjás, tapast samhengi. Þetta er sérstaklega slæmt fyrir screenshot.

2. **Release-polish: detail header þarf fullan dag + tíma.**
   `SlotDetail` sýnir nú `Brottför: kl. HH:MM · Komutími: kl. HH:MM`. Það ætti að verða t.d. `Brottför: Fim. 9. júl kl. 05:28 · Komutími: Fim. 9. júl kl. 10:08`, eða sambærilegt compact format.

3. **Status sentence þarf líka dag ef hún stendur ein og sér.**
   `Brottför kl. 05:28 lítur vel út` er ekki screenshot-proof. Betra: `Brottför fim. 9. júl kl. 05:28 lítur vel út`, eða `Fim. 9. júl kl. 05:28 lítur vel út` ef það hljómar betur í UI.

4. **Veðurmörk við pillur eru góð hugmynd, en ekki troða of miklu inn í pillurnar sjálfar.**
   Pillurnar eru nú þegar lítil touch targets með label + count. Á 360-390 px má ekki setja mikið af texta inn í þær. Betra er að hafa compact threshold-summary rétt undir eða yfir pillunum.

5. **Threshold-summary á að nota `thresholdsUsed`, ekki draft state.**
   Sama regla og með hviðurnar: sýna mörkin sem voru notuð í síðasta útreikningi, ekki ósendar stillingar.

---

## Mælt útfærsla: dagar

### 1. Selected slot fær alltaf dag

Í scrubber button:

- óvalinn slot má áfram sýna bara tíma til að halda röðinni þéttri
- valinn slot á að sýna compact dagsetningu inni í button eða rétt undir honum

Dæmi:

```text
Fim.
05:28
```

Eða:

```text
Fim 05:28
```

Ef button verður of hár, má nota selected-only label beint fyrir neðan scrubber:

```text
Valið: Fim. 9. júl kl. 05:28
```

Codex mælir með selected-only label undir scrubber sem fyrsta útgáfu, því það er læsilegra og minnkar hættu á layout shift í slot-röðinni.

### 2. Day separator má vera áfram

Halda day separators sem orientation í scroll-röð, en ekki treysta á þá sem eina dagsetningarsamhengi.

### 3. Brottför/komutími með dagsetningu

Nota helper sem gefur compact íslenskt dagsformat:

```text
Fim. 9. júl kl. 05:28
```

Notast við `Atlantic/Reykjavik` timezone eins og `ForecastDrawer`.

Setja þetta í:

- `SlotDetail` header
- dynamic status sentence (`departureStatusGreen/Yellow/Red`)
- arrival summary line ef hún stendur ein og sér:
  `Komutími fim. 9. júl kl. 10:08, spáin þar kl. 10:00:`

---

## Mælt útfærsla: veðurmörk nálægt pillum

### Ekki setja öll mörk inn í hverja pillu

Forðast:

```text
Gott veður (190) Vindur <10 m/s Úrkoma <5 mm/klst
```

Það verður of langt og erfitt á mobile.

### Betra: ein compact mörk-lína undir pillunum

Dæmi:

```text
Viðmið: 💨 10/15 m/s · hviður 18 m/s · 💧 5 mm/klst
```

Eða ef við viljum vera aðeins skýrari:

```text
Veðurmörk: vindur 10/15 m/s · hviður 18 m/s · úrkoma 5 mm/klst
```

Þetta passar við núverandi `thresholdsCustom`: `vindur {caution}/{red} m/s, hviður {gust} m/s, úrkoma {precip} mm/klst`.

Mælt: sýna þetta alltaf í ferðaveður-resultinu, ekki bara þegar custom thresholds eru virk. Ástæðan er að notandi þarf að skilja hvað `Gott veður` og `Óþægilegt` þýðir, sérstaklega með eftirvagn.

### Pillurnar sjálfar

Halda pillum einföldum:

- `Gott veður (190)`
- `Óþægilegt (18)`
- `Hættulegt (x)`
- `Ófullnægjandi gögn (x)`

Ef eitthvað á inn í pillurnar sjálfar, nota bara tooltip/aria-label:

`Gott veður: innan valinna marka, vindur undir X og úrkoma undir Y`

Ekki gera emoji + mörk að sýnilegum texta í pillunum í Phase 1.1 nema mobile prófun sýni að það passi.

---

## Suggested implementation scope

Þetta ætti að vera lítið polish eftir Phase 1 release fix, ekki stór Phase 2.

1. Bæta við helper, t.d. `formatCompactDateTime(iso, locale)`:
   - íslenska: `Fim. 9. júl kl. 05:28`
   - enska: `Thu 9 Jul 05:28` eða sambærilegt
   - `timeZone: 'Atlantic/Reykjavik'`
2. Nota helper í:
   - `SlotDetail` header
   - dynamic departure status sentence
   - arrival summary line
   - selected slot label undir scrubber
3. Bæta compact threshold summary í `DepartureHeatmap` eða parent rétt við pillur:
   - nota `thresholdsUsed`
   - ekki sýna ef `thresholdsUsed` vantar
4. Textar í `messages/is.json` og `messages/en.json`.

Ekki blanda þessu við nætursíu, gust trend arrows eða Mapbox.

---

## Textatillögur

Íslenska:

- `Valið: {dateTime}`
- `Veðurmörk: vindur {caution}/{red} m/s · hviður {gust} m/s · úrkoma {precip} mm/klst`
- `Brottför {dateTime} lítur vel út`
- `Brottför {dateTime} er óþægileg`
- `Ekki mælt með brottför {dateTime}`
- `Brottför: {departureDateTime} · Komutími: {arrivalDateTime}`

Enska:

- `Selected: {dateTime}`
- `Weather limits: wind {caution}/{red} m/s · gusts {gust} m/s · precip {precip} mm/h`
- `Departure {dateTime} looks good`
- `Departure {dateTime} is uncomfortable`
- `Departure {dateTime} is not recommended`
- `Departure: {departureDateTime} · Arrival: {arrivalDateTime}`

---

## Design.md notes

Viðeigandi reglur:

- hanna fyrst við 360-460 px breidd
- texti/page-wrapper má ekki valda láréttu overflowi
- touch targets almennt minnst 40x40 px
- fixed/sticky/controls skulu hafa stöðugar stærðir

Þess vegna er compact threshold-summary undir pillum betri en að troða mörkum inn í pillurnar.

---

## Localhost checks for Stebbi

Opna `/auth-mvp/vedrid` á localhost-portinu sem Stebbi keyrir.

Prófa:

1. Reikna leið sem fer yfir miðnætti eða sýnir slot eftir dagamót, t.d. Akureyri -> Garðabær.
2. Skrolla scrubber þannig að day separator sé ekki sýnilegur.
3. Velja slot.
4. Vænt: dagsetning valda slotsins sé samt sýnileg nálægt scrubber eða í valda slotinu.
5. Vænt: detail-kassinn sýni `Brottför` og `Komutími` með degi og dagsetningu, ekki bara klukku.
6. Vænt: status sentence sýni dagsetningu eða sé ekki hægt að misskilja hana á screenshot.
7. Prófa custom thresholds eða eftirvagn.
8. Vænt: threshold-summary sýni mörkin sem voru notuð í útreikningnum.
9. Breyta mörkum án þess að reikna aftur ef UI leyfir það.
10. Vænt: summary sýni enn síðast reiknuð `thresholdsUsed`, ekki ósend draft-gildi.
11. Prófa 360, 390 og 460 px breidd.
12. Vænt: enginn horizontal overflow og pillurnar halda góðu touch-target bili.

Engar SQL/RLS/auth breytingar. Engin met.no eða Google API breyting. Þetta er UI/copy polish.

---

## Codex conclusion

Já, gera dagsetningu alltaf sýnilega í samhengi við valið slot og nota dagsetningu í brottfarar-/komutíma texta. Það gerir kassann screenshot-proof.

Fyrir veðurmörkin: sýna compact `Veðurmörk` línu nálægt pillunum, byggða á `thresholdsUsed`. Ekki setja öll mörkin inn í pillurnar sjálfar í fyrstu útgáfu.
