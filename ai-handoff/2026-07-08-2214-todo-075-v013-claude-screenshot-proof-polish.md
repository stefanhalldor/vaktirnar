# Handoff: TODO #75 — Screenshot-proof dagsetningar og veðurmörk við pillur

Created: 2026-07-08 22:14
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Related TODO: #75

Byggir á: `2026-07-08-2201-todo-075-v011-codex-screenshot-proof-dates-and-thresholds.md`

---

## Staða

Kóðabreytingar framkvæmdar og type-check hreinn. Tester: 1958 passed, 0 failures. Ekki commitað — Stebbi ákveður þegar hann hefur prófað á localhost.

---

## Hvað var gert

### Nýr helper: `formatCompactDateTime`

Bætt við `components/weather/travelAuditMap.helpers.ts`:

```
IS: "Fim. 9. júl kl. 05:28"
EN: "Thu 9 Jul 05:28"
```

Notast við `Intl.DateTimeFormat` með `timeZone: 'Atlantic/Reykjavik'` og `formatToParts` til að setja saman rétt format á báðum tungumálum. Fyrsti stafur í vikudagsnafni gerður hástafur.

### `DepartureHeatmap.tsx`

1. **Veðurmörk-lína** — bætt beint undir `thresholdsUsed` check yfir filter chips:
   ```
   Veðurmörk: vindur 10/15 m/s · hviður 18 m/s · úrkoma 5 mm/klst
   ```
   Sýnd alltaf þegar `thresholdsUsed` er til (ekki bara við custom overrides). Notast við `thresholdSummaryLine` message-lykil.

2. **Selected slot label** — bætt undir scrubber row, yfir SlotDetail:
   ```
   Valið: Fim. 9. júl kl. 05:28
   ```
   Alltaf sýnilegur þegar slot er valið, jafnvel þótt day separator sé skrollaður út úr sýn.

3. **SlotDetail header** — uppfært til að nota `formatCompactDateTime` í stað `formatKlTime`:
   ```
   Brottför: Fim. 9. júl kl. 05:28 · Komutími: Fim. 9. júl kl. 10:08
   ```

### `FerdalagidClient.tsx`

4. **Status sentence** — breyst úr `{time}` í `{dateTime}`:
   ```
   Brottför fim. 9. júl kl. 05:28 lítur vel út
   ```

5. **Arrival summary line** — `{arrivalTime}` → `{arrivalDateTime}`:
   ```
   Komutími fim. 9. júl kl. 10:08, spáin þar kl. 10:00:
   ```

6. **Gömul threshold-lína fjarlægð** — `hasOverrides`-girtin threshold display (sem sýndi bara við custom overrides) var fjarlægð. `hasOverrides` breytan var líka fjarlægð þar sem hún var orðin ónotuð. Threshold-upplýsingarnar eru nú alltaf í `DepartureHeatmap`.

### Messages

| Lykill | Gamalt | Nýtt |
|--------|--------|------|
| `departureStatusGreen` | `Brottför kl. {time} lítur vel út` | `Brottför {dateTime} lítur vel út` |
| `departureStatusYellow` | `Brottför kl. {time} er óþægileg` | `Brottför {dateTime} er óþægileg` |
| `departureStatusRed` | `Ekki mælt með brottför kl. {time}` | `Ekki mælt með brottför {dateTime}` |
| `arrivalSummaryLine` | `Komutími kl. {arrivalTime}, ...` | `Komutími {arrivalDateTime}, ...` |
| `thresholdSummaryLine` | (nýtt) | `Veðurmörk: vindur {caution}/{red} m/s · hviður {gust} m/s · úrkoma {precip} mm/klst` |
| `selectedSlotLabel` | (nýtt) | `Valið: {dateTime}` |

---

## Skrár breyttar

- `components/weather/travelAuditMap.helpers.ts` — `formatCompactDateTime` bætt við
- `components/weather/DepartureHeatmap.tsx` — veðurmörk, selected slot label, SlotDetail header
- `app/auth-mvp/vedrid/FerdalagidClient.tsx` — status sentence, arrival line, old threshold display fjarlægt
- `messages/is.json` — 4 breytt, 2 nýtt
- `messages/en.json` — 4 breytt, 2 nýtt

---

## Localhost checks for Stebbi

Opna `/auth-mvp/vedrid` á localhost.

**1. Veðurmörk við pillur:**
- Reikna hvaða sem er leið
- Vænt: `"Veðurmörk: vindur 10/15 m/s · hviður 18 m/s · úrkoma 5 mm/klst"` sést beint yfir pillunum (Gott veður / Óþægilegt / o.s.frv.) — alltaf, ekki bara þegar custom thresholds eru stilltar
- Breyta veðurmörkum og reikna aftur — talan á að uppfærast

**2. Selected slot label:**
- Velja slot í scrubber
- Vænt: `"Valið: Fim. 9. júl kl. 05:28"` birtist beint undir scrubber row
- Skrolla scrubber þannig að day separator er ekki sýnilegur
- Vænt: dagsetning sést samt í "Valið:"-línunni

**3. SlotDetail header:**
- Velja slot
- Expand SlotDetail (birtist sjálfkrafa neðar)
- Vænt: `"Brottför: Fim. 9. júl kl. 05:28 · Komutími: Fim. 9. júl kl. 10:08"` — bæði með degi og mánuði

**4. Status sentence:**
- Skoða stöðusetninguna í combined card yfir scrubber
- Vænt: `"Brottför fim. 9. júl kl. 05:28 lítur vel út"` — dagur alltaf með
- Athuga líka gult og rautt (velja slot með gult/rautt)

**5. Arrival summary:**
- Ef áfangastaðurinn hefur arrivalWeather data
- Vænt: `"Komutími fim. 9. júl kl. 10:08, spáin þar kl. 10:00:"` — komutími með degi

**6. Engar afturfarir:**
- Yr / Google Maps tenglar virka enn
- Spá 🥄 drawer opnast frá öllum þremur stöðum
- Highlighted röð í drawer er rétt

**7. Mobile breidd:**
- Prófa við 390 px
- Vænt: `"Veðurmörk:"`-línan er lesanleg en brýtur ekki layout; selected slot label er lesanleg

---

## Ekki gert / frestað

- Raw met.no tenglar enn sýnilegir (Finding 3 úr v010, frestað)
- Phase 2: náttúrusíun, hviðuþróunarörvar, hitastigslitir
