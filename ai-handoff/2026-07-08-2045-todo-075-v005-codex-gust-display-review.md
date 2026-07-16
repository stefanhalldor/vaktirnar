# Codex review: TODO #75 v005 — Hviður í Spá 🥄 töflu

Created: 2026-07-08 20:45
Timezone: Atlantic/Reykjavik
Agent: Codex
Review target: `2026-07-08-2040-todo-075-v004-claude-v003-review.md`
Builds on:
- `2026-07-08-2037-todo-075-v003-codex-forecast-table-ux-iteration.md`
- `2026-07-08-2040-todo-075-v004-claude-v003-review.md`

Related TODO: #75

---

## Findings fyrst

1. **Claude v004 er rétt að hviður mega ekki týnast.** Hviður skipta mjög miklu í ferðaveðri, sérstaklega með eftirvagn, hestakerru, hjólhýsi eða öðrum viðkvæmum farangri.

2. **Ekki gera hviður alltaf að sér dálki á mobile.** Sér `Hviður` dálkur gerir töfluna breiðari og eykur líkur á láréttu overflowi. `Design.md` segir að hanna fyrst við 360-460 px breidd og að controls/texti/page-wrapper megi ekki valda láréttu overflowi.

3. **Mælt UX:** setja hviður innan vinddálksins, með varúðarmerki/badge aðeins þegar hviðan er safety-relevant. Það heldur töflunni þéttri en lætur mikilvægar hviður sjást.

4. **Varúðarmerki má ekki birtast í hverri línu.** Ef við merkjum allar hviður með ⚠/warning verður það sjónrænt suð. Merkið á að birtast þegar hviður eru nálægt eða yfir þeim mörkum sem skipta máli fyrir valin veðurmörk/eftirvagn.

---

## Mælt framsetning

### Vinddálkur

Header:

`m/s`

Eða ef pláss leyfir:

`Vindur`

Cell án sérstakrar hviðuáhættu:

`7,9 (hvið. 10,4)`

Cell með hviðu sem þarf athygli:

`7,9 (hvið. 15,8 ⚠)`

Cell þar sem hviða fer yfir rauð mörk:

`7,9 (hvið. 18,4 ⚠)`

Þá fær cell eða hviðu-pill rauðan/amber tón eftir alvarleika.

### Aðgengi

Ekki láta táknið eitt bera merkingu.

Nota t.d. lucide `TriangleAlert` ef það passar í UI, eða textatákn með `sr-only`.

Accessible label dæmi:

`Hviður 15,8 m/s, nálægt mörkum fyrir valin veðurmörk`

`Hviður 18,4 m/s, yfir hættumörkum fyrir valin veðurmörk`

---

## Tone-reglur fyrir hviður

Nota resolved thresholds úr mati, ekki hardcode-a eitt fast gildi.

Tillaga:

```ts
type GustSeverity = 'none' | 'notice' | 'caution' | 'danger'
```

Reglur:

- `danger`: `gustMs >= thresholds.redGustMs`
- `caution`: `gustMs >= thresholds.redGustMs * 0.8`
- `notice`: `gustMs - windMs >= 3` eða `gustMs >= windMs * 1.35`
- `none`: annars

Útskýring:

- `danger` fylgir núverandi rauðu hviðamörkum.
- `caution` sýnir að hviður eru farnar að skipta máli áður en þær fara yfir mörk.
- `notice` sýnir “hviður eru talsvert yfir meðalvindi” en þarf ekki sterkt varúðarmerki.

Mikilvægt: `caution`/`danger` ætti að nota warning icon. `notice` má vera mild texta/pill án icon.

---

## Trend-reglur fyrir hviður

Í v003 var talað um þróun per dálk. Fyrir vinddálkinn þarf þróunin að geta sýnt bæði vind og hviður án þess að verða löng.

Mælt:

- aðalgildi í vinddálki sýnir meðalvind
- hviða í sviga
- delta/tone í vinddálki skal byggjast á því sem er verra fyrir ferðaveður:
  - ef hviðan er `caution`/`danger`, nota hviðuþróun sem tone
  - annars nota vindþróun

Dæmi:

`7,9 ↓0,4 (hvið. 15,8 ↑1,2 ⚠)`

Ef þetta er of langt á 390 px mobile:

```
7,9 ↓0,4
hvið. 15,8 ↑1,2 ⚠
```

Þetta er enn einn dálkur, en cell má verða tveggja lína.

---

## Alternative útfærslur

### Valkostur A — Mælt: hviður í vinddálki

Kostir:

- mobile-first
- hviður týnast ekki
- enginn auka dálkur
- auðvelt að flagga safety-relevant hviðum

Gallar:

- cell verður stundum tveggja lína

### Valkostur B — Sér `Hviður` dálkur á desktop, inline á mobile

Kostir:

- mjög læsilegt á desktop
- hviður fá fullt vægi

Gallar:

- tvö layout fyrir sömu töflu
- meiri implementation complexity

Ef þetta er valið: nota CSS breakpoint, ekki tvö aðskilin data render.

### Valkostur C — Row-level hviðubadge

Sýna `Hviður ⚠` badge við tíma þegar hviður skipta máli.

Kostir:

- mjög sýnilegt
- hægt að halda vinddálki einföldum

Gallar:

- notandi þarf samt að leita að hviðugildinu
- getur orðið noisy í mörgum röðum

### Valkostur D — Toggle: `Sýna hviður`

Ekki mælt í fyrstu útgáfu. Hviður eru of mikilvægar til að vera faldar sjálfgefið.

---

## Type/data tillaga

Í v004 var talað um `ForecastDrawerMetricCell`. Bæta við gust metadata sem hjálpar UI:

```ts
type ForecastDrawerMetricCell = {
  value: number
  delta?: number
  direction: 'up' | 'down' | 'steady' | 'none'
  tone: 'positive' | 'negative' | 'neutral'
  accessibleLabel: string
}

type ForecastDrawerGustCell = ForecastDrawerMetricCell & {
  severity: 'none' | 'notice' | 'caution' | 'danger'
}

type ForecastDrawerRow = {
  timeIso: string
  status: WeatherStatus | 'no_data'
  temperature: ForecastDrawerMetricCell
  wind: ForecastDrawerMetricCell
  gust: ForecastDrawerGustCell
  precipitation: ForecastDrawerMetricCell
  isHighlighted?: boolean
}
```

Athugið: `gust` ætti að vera required ef met.no gögn eru til, því `parseMetnoForecast` fyllir `windGustMs` með `windSpeedMs` ef `wind_speed_of_gust` vantar. UI getur svo ákveðið að sýna ekki sviga ef `gust.value <= wind.value` eða munurinn er ómarktækur.

---

## Messages sem þarf líklega að bæta við

Íslenska:

- `hviður`
- `hvið.`
- `Hviður nálægt mörkum`
- `Hviður yfir mörkum`
- `Hviður {value} m/s, {state}`

Enska:

- `gusts`
- `gust`
- `Gusts near limit`
- `Gusts over limit`

Ekki hardcode-a user-facing texta í component.

---

## Design.md athugasemd

Viðeigandi Design.md reglur:

- hanna fyrst við 360-460 px breidd
- controls/texti/page-wrapper mega ekki valda láréttu overflowi
- touch targets skulu almennt vera minnst 40x40 px
- UI breytingar eiga að hafa mobile-first wireframe/component-tree

Þess vegna er “hviður innan vinddálks” betri fyrsta útgáfa en sér hviðudálkur.

---

## Localhost checks for Stebbi

Opna `http://localhost:3004/auth-mvp/vedrid` eða það localhost-port sem Stebbi er með í gangi.

Prófa:

1. Reikna Garðabær -> Þorlákshöfn.
2. Opna `Spá 🥄` í áfangastaðaspjaldi.
3. Staðfesta að vinddálkur sýni hviður innan sviga, t.d. `7,9 (hvið. 10,4)`.
4. Finna klukkustund þar sem hviður eru greinilega hærri en vindur.
5. Staðfesta að mildar hviður séu sýndar án varúðarmerkis.
6. Staðfesta að hviður nálægt/yfir mörkum fái amber/rauðan tón og varúðarmerki.
7. Opna `Spá 🥄` í `Mest krefjandi á leiðinni`.
8. Staðfesta að hviðuviðvörun birtist þar líka ef við á.
9. Opna `Spá 🥄` á venjulegum spápunkti undir `Allir spápunktarnir á leiðinni`.
10. Prófa 390 px mobile viewport: taflan má ekki fá lárétt overflow og vindcell má vera tveggja lína ef þarf.
11. Prófa með eftirvagni/hjólhýsi valið ef mögulegt er: hviðumerki eiga að verða næmari vegna lægri `redGustMs`.

Regression sem þarf að passa:

- Hviður detti ekki út úr efsta spjaldi eða mest krefjandi spjaldi.
- Vindur og hviður ruglist ekki saman í textum eða aria-labels.
- Warning icon sé ekki notað svo víða að það verði merkingarlaust.
- Engar SQL/RLS/auth breytingar.
- Engin ný met.no eða Google API köll nema það sé sérstaklega samþykkt.

---

## Codex niðurstaða

Mælt er með að Claude Code útfæri hviður sem hluta af vinddálki í Phase 1:

`Vindur: 7,9 (hvið. 15,8 ⚠)`

Þetta er þétt, mobile-first og heldur hviðunum sýnilegum án þess að taflan verði of breið. Sér hviðudálkur má bíða eða aðeins birtast á desktop ef Stebbi vill það síðar.
