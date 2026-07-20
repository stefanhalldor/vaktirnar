# TODO 086 v249 — Road Intelligence á mannamáli

Created: 2026-07-20 18:25
Timezone: Atlantic/Reykjavik
Agent: Codex
Relevant TODO: 086
Type: Human-readable handoff for Stebbi and Claude

---

## Stutta útgáfan

Codex er búinn að búa til fyrsta grunninn að eigin leiðagreind Teskeiðar.

Þetta er ekki komið í viðmótið ennþá. Notendur sjá því ekkert nýtt strax. En
kóðinn er nú farinn að geta svarað spurningunni:

> “Þekkir Teskeið einhverjar mannamálslegar leiðir, valkosti eða varasama
> kafla fyrir þetta Frá/Til par?”

Dæmi:

- Reykjavík → Egilsstaðir
  - Um Hellisheiði
  - Til að sleppa við Öxi
  - Um firðina
  - Viðvaranir tengdar Hellisheiði og Öxi

- Reykjavík → Ísafjörður
  - Gegnum Hólmavík
  - Viðvörun tengd Hólmavík-suðurleið

- Reykjavík → Akureyri
  - Hringvegurinn

Allt er merkt sem `draft` og `verified: false`. Þetta er meðvitað: við erum að
byggja þekkingargrunn, ekki gefa opinbera færðarleiðsögn.

---

## Hvað Codex gerði í kóðanum

Codex bætti við þremur hlutum:

1. **Leiðavalkostum**

   Teskeið þekkir nú fyrstu curated leiðavalkostina sem eigin gögn:

   - `Gegnum Hólmavík`
   - `Um Hellisheiði`
   - `Til að sleppa við Öxi`
   - `Um firðina`
   - `Hringvegurinn`

2. **Varúðarmerkingum**

   Teskeið þekkir nú fyrstu segment-tengdu varúðarmerkingarnar:

   - Vindnæmt
   - Fjallvegur
   - Getur verið lokað
   - Varasamt með eftirvagn

3. **Resolver**

   Bætt var við hreinni function sem tekur `Frá` og `Til` og skilar því sem
   Teskeið veit um leiðina. Hún kallar ekki í Google, Supabase, Veðurstofu eða
   Vegagerð. Þetta er bara okkar eigin provider-neutral þekking.

---

## Af hverju þetta skiptir máli

Áður vorum við mikið að reyna að laga leiðir með Google Routes, route-memory og
viðkomustöðum.

Þetta nýja lag færir okkur í að Teskeið eigi sjálf einfaldan grunn um íslenskar
leiðir:

- hvaða leiðafjölskyldu ferðin tilheyrir
- hvaða mannamálslegir valkostir eru til
- hvaða kaflar eru varasamari
- hvaða viðvaranir eiga við

Google getur áfram verið provider og fallback seinna, en Teskeiðarþekkingin á
að vera okkar eigin.

---

## Hvernig planið spilast út

### Skref 1 — Core grunnur

Staða: **komið hjá Codex**

Þetta er það sem var klárað í v248:

- static route intelligence registry
- alternatives
- cautions
- pure resolver
- tests
- roadmap uppfærsla

Notandi sér ekkert nýtt ennþá.

### Skref 2 — Feature flag

Staða: **Claude er líklega í þessu næst**

Næst þarf að setja þetta bak við feature flagg:

- `road-intelligence-v1`
- env gate: `ROAD_INTELLIGENCE_V1_ENABLED`
- per-user access í `feature_access`

Þetta tryggir að bara Stebbi eða valdir prófnotendur sjái fyrstu útgáfuna.

Notandi án flaggs sér ekkert nýtt.

### Skref 3 — Fyrsta sýn á /auth-mvp/vedrid

Staða: **næsti UI skammtur eftir flagg**

Þegar notandi með flagg velur tvo staði á `/auth-mvp/vedrid`, getur birtst lítið
draft-spjald undir leiðarvalinu.

Mannamálslega gæti það litið svona út:

```text
Teskeið þekkir þessar leiðir · Tilraun

Reykjavík → Egilsstaðir

[Um Hellisheiði] [Til að sleppa við Öxi] [Um firðina]

Varúð: Vindnæmt · Fjallvegur · Varasamt með eftirvagn
Uppkast, óstaðfest
```

Þetta á fyrst bara að vera read-only. Það á ekki að filtera kortið, velja leið
sjálfkrafa eða breyta niðurstöðum.

### Skref 4 — Betra samhengi við kort og veður

Staða: **seinna**

Þegar við treystum grunninum betur má byrja að tengja þetta við:

- leiðarpillur
- map filter
- route-memory
- veðurstöðvar á segmentum
- Vegagerðar raungildi
- Veðurstofu forecast
- púlsgögn

Þetta er þá ekki lengur “Google fann leið”, heldur “Teskeið skilur þessa
leiðafjölskyldu og veit hvaða kaflar skipta máli”.

### Skref 5 — Eigin leiðakerfi sem hliðarleið

Staða: **roadmap, ekki núna**

Síðar má þetta verða grunnur að eigin leiðakerfi:

- node/segment graph
- route alternatives án Google
- open-data / OSM skoðun
- Google sem fallback og samanburður

En það á að koma á feature flaggi og í litlum, prófanlegum skömmtum.

---

## Hvernig þetta mun birtast notandanum

Í fyrstu verður þetta mjög einfalt:

1. Notandi opnar `/auth-mvp/vedrid`.
2. Notandi velur `Frá`.
3. Notandi velur `Til`.
4. Ef route intelligence flagg er virkt og Teskeið þekkir leiðina:
   - birtist lítið spjald með leiðavalkostum
   - birtast varúðarmerkingar
   - birtist skýr merking um að þetta sé tilraun / óstaðfest
5. Ef Teskeið þekkir ekki leiðina:
   - annaðhvort birtist ekkert
   - eða lítil skilaboð: `Teskeið þekkir ekki þetta leiðarpar enn`

Mikilvægt: fyrsta útgáfan á ekki að þykjast vera fullkomin navigation. Hún á að
vera hjálpleg innsýn ofan á núverandi veðurkort.

---

## Hvað Claude ætti að passa í næsta skammti

Claude ætti að forgangsraða þessu:

1. Klára feature flaggið áður en UI er sýnt.
2. Ekki keyra SQL nema Stebbi biðji sérstaklega um það.
3. Halda UI-inu read-only fyrst.
4. Merkja allt sem `Tilraun` og `Uppkast, óstaðfest`.
5. Ekki láta þetta filtera kortið eða breyta route-memory ennþá.
6. Ekki rugla saman:
   - varúð á leið sem er valin
   - varúð á leið sem við erum að forðast

Síðasta atriðið er mikilvægast fyrir UX. Ef við sýnum `Öxi · Varasamt með
eftirvagn` við valkostinn `Til að sleppa við Öxi`, þarf textinn að vera skýr:
það er verið að forðast Öxi, ekki mæla með henni.

---

## Localhost checks for Stebbi

Eftir v248 eitt og sér:

1. Opna `/vedrid`.
2. Opna `/auth-mvp/vedrid`.
3. Velja route-memory par, t.d. Reykjavík → Egilsstaðir.
4. Staðfesta að ekkert nýtt Road Intelligence spjald birtist enn.
5. Staðfesta að núverandi route picker, leiðarpillur, map filter og
   WeatherWatchers samanburður virki áfram.

Eftir að Claude klárar feature flag + UI:

1. Prófa sem notandi án `road-intelligence-v1`.
   - ekkert nýtt spjald á að birtast.
2. Prófa sem notandi með `road-intelligence-v1`.
   - Reykjavík → Egilsstaðir á að sýna 3 leiðavalkosti.
   - Reykjavík → Ísafjörður á að sýna `Gegnum Hólmavík`.
   - Reykjavík → Akureyri á að sýna `Hringvegurinn`.
   - Akureyri → Egilsstaðir á annaðhvort að sýna ekkert eða unknown state.
3. Prófa mobile 360-430px.
   - pillur eiga að wrap-a fallega.
   - ekkert lárétt overflow.
   - ekkert overlap.

Ekki prófa production SQL eða feature access í production nema Stebbi hafi
samþykkt það sérstaklega.

---

## Route intelligence check

Þessi vinna snertir:

- Reykjavík → Egilsstaðir
- Reykjavík → Ísafjörður
- Reykjavík → Akureyri
- Reykjavík → Vík / Suðurströnd sem þekkt family án alternatives í fyrsta skammti

Ný þekking fór á réttan stað:

- `lib/iceland-routes/`
- `IcelandRoadmap.md`

Lausnin er provider-neutral:

- engin Google köll
- engin raw Google geometry
- engin Supabase skrif
- engin user IDs
- engin heimilisföng
- engin persónuleg route history

Þetta er fyrsti steinninn í eigin leiðagreind Teskeiðar.
