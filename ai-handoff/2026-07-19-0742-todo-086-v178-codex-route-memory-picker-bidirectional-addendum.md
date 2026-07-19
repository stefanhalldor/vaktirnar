# 2026-07-19 07:42 - TODO 086 v178 - Codex: route-memory picker bidirectional addendum

Created: 2026-07-19 07:42
Timezone: Atlantic/Reykjavik

---

## Stutt mannamál

Stebbi er sáttur við að route-memory valið sé pillur, ekki sér kort, því það
heldur `/vedrid` einfaldara. En flowið þarf að verða tvíátta: á Íslandi skiptir
oft engu hvort leiðin er skráð Reykjavík -> Akureyri eða Akureyri -> Reykjavík
fyrir yfirlitskortið. Ef route-memory þekkir leið milli tveggja staða eiga báðir
staðir að birtast strax í fyrsta vali.

---

## Breytt product direction frá Stebba

Í stað þess að bæta öðru korti inn fyrir `Frá`/`Til`:

- halda route-memory valinu sem pillum
- setja það skýrt fyrir ofan aðalkortið á `/vedrid`
- bæta við fyrirsögn/copy, t.d.:
  - `Skoða veðrið á ákveðinni leið`
- undir fyrirsögninni sýna pillur fyrir alla staði sem koma fyrir í
  route-memory, óháð því hvort þeir eru `from` eða `to`

Þetta á að vera léttur hraðskjár, ekki full ferðareiknivél.

---

## Mikilvæg hegðunarbreyting: route-memory á að vera bidirectional í overview

Núverandi v176 flow virðist gera:

1. `/places` skilar bara distinct `from_place_key`
2. `/destinations?from=reykjavik` skilar bara `to_place_key` þar sem
   `from_place_key = reykjavik`

Stebbi vill frekar:

1. Fyrsta pill-lista skili öllum stöðum sem koma fyrir í route-memory:
   - `from_place_key`
   - `to_place_key`
   - dedupe-að í einn lista
2. Þegar notandi velur stað A, þá skili næsti listi öllum stöðum B þar sem annaðhvort:
   - A er `from` og B er `to`
   - A er `to` og B er `from`
3. Þegar notandi velur B, þá á `/vedrid` lookup að finna route-memory recordið þó
   það sé geymt í öfugri átt.

Dæmi:

- Ef route-memory inniheldur `Reykjavík -> Akureyri`
- Þá eiga bæði `Reykjavík` og `Akureyri` að birtast strax í fyrsta pill-lista
- Ef notandi velur `Akureyri`, þá á `Reykjavík` að birtast sem valkostur
- Kortið á að filtera á sama station-sett og leiðin `Reykjavík -> Akureyri`

---

## Implementation guidance

### 1. Places endpoint

`GET /api/teskeid/weather/route-memory/places` ætti að skila union af
`from_place_*` og `to_place_*`.

Ekki þarf nýja migration fyrir þetta.

### 2. Destinations endpoint

`GET /api/teskeid/weather/route-memory/destinations?from={placeKey}` ætti að
skila counterpart-stöðum úr báðum áttum:

- rows where `from_place_key = placeKey` -> return `to_place_*`
- rows where `to_place_key = placeKey` -> return `from_place_*`

Dedup-a eftir key.

### 3. Lookup endpoint

`POST /api/teskeid/weather/route-memory/lookup` ætti að reyna:

1. exact lookup: `fromKey -> toKey`
2. reverse lookup: `toKey -> fromKey`

Ef reverse lookup hittir, má response halda `routeLabel` úr geymdu route-memory,
eða setja routeLabel út frá selected direction. Fyrir overview skiptir station
settið mestu.

Ath: ef route-order er notað síðar í UI, þá þarf að vita hvort lookup var reverse
til að geta snúið röðuninni við. Í núverandi overview-filter skiptir röðin ekki
máli.

### 4. UI copy

Bæta við translations í `messages/is.json` og `messages/en.json`, ekki hardcode:

- `routeMemoryPickerTitle`: `Skoða veðrið á ákveðinni leið`
- mögulega stuttur help text ef þarf, en forðast langan texta fyrir ofan kortið.

Setja þetta fyrir ofan aðalkortið á `/vedrid` og halda því léttu.

### 5. Ekki koma Google aftur inn

Þetta flow má ekki nota:

- `PlaceSearch`
- Google Places autocomplete
- Google Routes

Allt á að koma úr SQL86 route-memory.

---

## Route intelligence check

- Snertir `/vedrid` overview route-memory selection.
- Engin ný Google data er vistuð.
- Engin raw heimilisföng eða user_id eiga að bætast við.
- Þetta styrkir provider-neutral route-memory: route pair er concept, ekki
  direction-bound Google route.
- Ef síðar þarf direction-sensitive station order, þarf `lookup` response að
  skila `direction: 'forward' | 'reverse'`.

---

## Localhost checks for Stebbi

1. Reikna leið í `/ferdalagid`, t.d. `Reykjavík -> Akureyri`.
2. Fara á `/vedrid`.
3. Vænt: bæði `Reykjavík` og `Akureyri` birtast í fyrsta pill-lista undir
   `Skoða veðrið á ákveðinni leið`.
4. Velja `Akureyri`.
5. Vænt: `Reykjavík` birtist sem mögulegur áfangastaður.
6. Velja `Reykjavík`.
7. Vænt: kortið filterar á sama station-sett og þegar valið er
   `Reykjavík -> Akureyri`.
8. DevTools Network:
   - engin Google Places autocomplete köll við þessi val
   - engin Google Routes köll við þessi val
   - aðeins route-memory API köll

---

## Release note

Þetta er lítið en mikilvægt release-polish áður en hraðskjárinn fer út. Það
eykur notagildi route-memory strax og gerir UI-ið eðlilegra fyrir Ísland:
leiðin milli tveggja staða er til þó hún hafi fyrst verið reiknuð í hinni áttinni.

