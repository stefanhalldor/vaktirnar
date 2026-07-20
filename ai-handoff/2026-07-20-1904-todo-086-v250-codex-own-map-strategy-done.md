# Handoff: Eigið Road Intelligence kortalag skráð inn í roadmap

Created: 2026-07-20 19:04
Timezone: Atlantic/Reykjavik
Agent: Codex
Relevant TODO: 086
Type: Implementation handoff for Claude Code review

---

## Skilningur á samþykki

Stebbi samþykkti að Codex tæki næsta afmarkaða framkvæmdarskref eftir
`2026-07-20-1840-todo-086-v249-claude-ri0-ri3-done-prerelease`.

Þessi skammtur felur í sér docs/roadmap breytingu til að festa skýrt að
Road Intelligence stefni í eigið Teskeiðar kortalag og Live Road OS.

Þessi skammtur felur ekki í sér kóðabreytingu í product runtime, SQL keyrslu,
commit, push, deploy, Vercel env breytingu eða Supabase breytingu.

---

## Af hverju þessi skammtur var tekinn

Claude v249 skilaði góðum fyrsta RI-0 til RI-3 skammti:

- feature flagg fyrir `road-intelligence-v1`
- static route-intelligence registry
- read-only `/auth-mvp/vedrid` preview fyrir flagged notendur
- SQL89 migration skrá, ekki keyrð

Það sem vantaði var að tengja þessa vinnu skýrt við stærri stefnuna úr
ChatGPT viðhengjunum: að Teskeið eigi að byggja eigið road-intelligence kortalag
og ekki festast í því að Google Maps verði canonical truth layer.

Codex telur þetta ekki blocker fyrir RI-0/RI-3 release, en þetta var
roadmap/product gap sem Stebbi vildi loka strax áður en næsta implementation
skref færi af stað.

---

## Hvað var gert

### 1. Nýtt stefnuskjal

Bætt við:

- `RoadIntelligenceMap.md`

Skjalið lýsir:

- að Teskeið sé ekki að byggja "annað Google Maps"
- að Google verði provider/fallback á meðan
- að Teskeiðar-road-graph og segment-state verði langtíma truth layer
- open-data rannsókn fyrir Vegagerðina, Landmælingar Íslands og OSM
- eigin korta prototype bak við `road-intelligence-v1`
- segment state ofan á vegkafla
- sérfræðilag, community layer og Live Road OS framtíðarsýn
- fyrstu practical skrefin M0 til M5
- non-goals og áhættur fyrir næsta release

### 2. `IcelandRoadmap.md` tengt við eigin-korta stefnuna

Uppfært:

- `IcelandRoadmap.md`

Bætt var við:

- markmið um eigið Road Intelligence kortalag
- non-goal um að skipta Google ekki út í production fyrr en open-data leyfi,
  performance og UX hafa verið rýnd
- nýjan kafla `Eigið Road Intelligence Kortalag Og Live Road OS`
- nýjan fasa `R7 - Eigið Kortalag Prototype`
- nýjan fasa `R8 - Live Road OS`
- `RoadIntelligenceMap.md` í kóðalendingarstað/skráalista

---

## Hvernig planið spilast út fyrir notandann

### Skref 1: Núverandi release, bak við flagg

Flaggaðir notendur byrja að sjá litla Road Intelligence sýn á `/auth-mvp/vedrid`
þegar þeir velja tvo staði sem Teskeið þekkir.

Notandinn upplifir þetta sem:

- Teskeið þekkir að til eru mannamálslegir leiðavalkostir
- Teskeið getur sýnt varasama kafla eða leiðir
- ekkert breytist fyrir public notendur eða notendur án flaggs

Þetta er RI-0 til RI-3 frá Claude v249.

### Skref 2: Eigið kort prototype, líka bak við flagg

Næsta stærra skref ætti ekki að vera að skipta út Google í production.

Næsta skref ætti að vera feature-flaggað prototype, t.d.
`/auth-mvp/vedrid/road-map-prototype`, þar sem Stebbi og flagged notendur geta
séð hvort opið grunnkort + Teskeiðar road overlay virki.

Notandinn upplifir þetta sem:

- tilraunasýn, ekki nýtt default kort
- íslenskt kortalag sem getur smám saman sýnt vegkafla og Teskeiðarþekkingu
- engin breyting á núverandi `/vedrid` hegðun nema hann er í tilrauninni

### Skref 3: Segment-state kemur ofan á kortið

Þegar fyrstu 10-20 vegkaflar eru skilgreindir getur Teskeið farið að segja
meira en bara "þessi punktur er rauður".

Notandinn upplifir þetta sem:

- "þessi kafli framundan er erfiður"
- "hviðurnar eru verri á þessum kafla en hinum"
- "þessi leið sleppir við slæma kaflann"
- einföld, mannamálsleg samantekt í stað gagnagrúskaraviðmóts

### Skref 4: Live Road OS síðar

Þegar road graph og segment-state eru traust getur Teskeið þróast í lifandi
ferðafélaga.

Notandinn upplifir þetta síðar sem:

- núverandi staðsetning mappast á vegkafla
- Teskeið veit hvaða segment koma næst
- ráðlegging miðast við ETA, vind, hviður, færð og ökutækjaprófíl
- appið hjálpar að ákveða hvort eigi að fara núna, bíða, stoppa eða velja aðra
  leið

Þetta þarf sér privacy og safety rýni áður en það verður product.

---

## Skrár skoðaðar

- `WORKFLOW.md`
- `ai-handoff/README.md`
- `ai-handoff/2026-07-20-1840-todo-086-v249-claude-ri0-ri3-done-prerelease.md`
- `IcelandRoadmap.md`
- `C:\Users\Lenovo\.codex\attachments\fb1f3e86-b187-4eba-a70d-339ba151f5d6\pasted-text.txt`
- `C:\Users\Lenovo\.codex\attachments\cbf694ef-e20b-4a1f-ada6-1479f89e9189\pasted-text.txt`

---

## Skrár breyttar

- `RoadIntelligenceMap.md` - nýtt stefnuskjal
- `IcelandRoadmap.md` - tenging við nýja stefnuskjalið og R7/R8 fasar
- `ai-handoff/2026-07-20-1904-todo-086-v250-codex-own-map-strategy-done.md` - þessi handoff skrá

---

## Skipanir keyrðar

- `Get-Content -Encoding UTF8 WORKFLOW.md`
- `Test-Path RoadIntelligenceMap.md`
- `rg -n "RoadIntelligenceMap|Eigið Road Intelligence Kortalag|R7 - Eigið Kortalag|R8 - Live Road OS|Stefna að eigin Road Intelligence" IcelandRoadmap.md RoadIntelligenceMap.md`
- `git status --short`
- `Get-Content -Encoding UTF8 ai-handoff/README.md`
- `Get-Content -Encoding UTF8 IcelandRoadmap.md`
- `Get-Content -Encoding UTF8 ai-handoff/2026-07-20-1840-todo-086-v249-claude-ri0-ri3-done-prerelease.md`
- `Get-Content -Encoding UTF8` á báðum ChatGPT viðhengjum
- `git diff -- IcelandRoadmap.md RoadIntelligenceMap.md`
- `git diff --check -- IcelandRoadmap.md RoadIntelligenceMap.md`
- `Get-Date -Format "yyyy-MM-dd HH:mm"`

Niðurstöður:

- `git diff --check -- IcelandRoadmap.md RoadIntelligenceMap.md` - exit code 0
- `git status --short` sýnir áfram ócommittaðar breytingar frá fyrri Codex/Claude
  skömmtum og `.obsidian/workspace.json` sem ótengda breytingu

---

## Hvað var ekki gert

- Enginn runtime kóði breyttur í þessum Codex skammti.
- Engin SQL skrifuð eða keyrð í þessum Codex skammti.
- SQL89 var ekki keyrð.
- Engin Vercel env breyta var sett.
- Enginn commit, push eða deploy.
- Ekkert nýtt kort prototype var útfært ennþá.
- Engin open-data endpoints voru staðfest.

---

## Route intelligence check

- Snertir allt Road Intelligence kerfið, sérstaklega langtímastefnu fyrir
  Íslandskort, road graph, segment state og route alternatives.
- Ný þekking á heima í `IcelandRoadmap.md` og nýju `RoadIntelligenceMap.md`.
- Lausnin er provider-neutral: Google er skilgreint sem provider/fallback, ekki
  canonical grunnur.
- Engin ný canonical segment, station matching regla, cache lykill eða test
  fixture var bætt við í þessum docs-only skammti.
- Privacy er óbreytt: engin ný gögn vistuð, engin user_id, engin raw route,
  engin GPS gögn.
- Ef næsta skref fer í map prototype þarf sérstakt mat á open-data leyfum,
  attribution og cache-reglum áður en nokkuð fer í production.

---

## Rýni Codex á v249 release stöðu

Codex sér ekkert í þessum docs-only skammti sem ætti að stoppa RI-0/RI-3
releaseið ef Claude v249 validation stendur:

- `npm run type-check` var grænt hjá Claude
- `npm run test:run` var grænt hjá Claude
- SQL89 er skráð sem migration skrá en ekki keyrð
- `road-intelligence-v1` er varið með env flaggi og per-user feature access

Release þarf samt að muna:

- SQL89 þarf sérstakt samþykki og að vera keyrð áður en feature-access row fyrir
  `road-intelligence-v1` virkar í production.
- `ROAD_INTELLIGENCE_V1_ENABLED=true` þarf að vera sett í Vercel fyrir production
  sýn, með sér samþykki.
- Feature-access row fyrir Stebba eða testnotanda þarf að setja sérstaklega.
- `.obsidian/workspace.json` á ekki að fara með í commit nema Stebbi vilji það.

---

## Tillaga að næsta skrefi

### Fyrir release núna

Claude Code ætti að rýna:

1. hvort `RoadIntelligenceMap.md` og nýju `IcelandRoadmap.md` kaflarnir passa við
   stefnuna úr viðhengjunum
2. hvort þessi docs breyting eigi með í sama commit og RI-0/RI-3 eða í sér commit
3. hvort v249 release sé enn grænt eftir þessa docs-only viðbót

Codex mælir með að þessi docs breyting fari með releaseinu, því hún útskýrir
af hverju fyrsta litla UI-tilraunin er ekki endamarkmið heldur inngangur að
eigin kortalagi.

### Fyrir næsta implementation skammt eftir release

Byrja á M1 eða M2:

- M1: open-data discovery og leyfisrýni fyrir Vegagerðina, Landmælingar og OSM.
- M2: feature-flaggað kort prototype, án þess að breyta núverandi `/vedrid`
  production korti.

Codex myndi velja M1 fyrst ef markmiðið er að forðast ranga tæknilega bindingu.
Codex myndi velja örlítið M2 spike fyrst ef Stebbi þarf að "sjá eitthvað" fljótt
og það er merkt mjög skýrt sem throwaway/prototype.

---

## Spurningar fyrir Claude Code

1. Er textinn í `RoadIntelligenceMap.md` nægilega nálægt ChatGPT viðhengjunum?
2. Vantar einhverja open-data lind sem Claude Code veit að er þegar í notkun í
   verkefninu?
3. Er betra að næsti skammtur sé M1 discovery eða M2 prototype spike?
4. Ef M2: hvaða renderer er líklegastur fyrir fyrsta spike í Next.js 15 appinu:
   MapLibre GL JS, Leaflet eða OpenLayers?
5. Á docs breytingin að fara með RI-0/RI-3 release commit eða bíða í sér
   roadmap commit?

---

## Localhost checks for Stebbi

Þessi Codex skammtur er docs-only, þannig að það er ekkert nýtt UI frá honum að
prófa á localhost.

Það sem Stebbi á samt að athuga fyrir release er enn v249 hegðunin:

1. Opna `/auth-mvp/vedrid` sem notandi án `road-intelligence-v1` flaggs.
   Vænt: enginn Road Intelligence preview.
2. Opna `/auth-mvp/vedrid` sem notandi með flaggi, eftir SQL89/env/access setup.
   Vænt: Road Intelligence preview birtist aðeins fyrir þekktar leiðir.
3. Prófa Reykjavík til Egilsstaðir.
   Vænt: alternatives og cautions birtast sem tilrauna-preview.
4. Prófa Reykjavík til Vík.
   Vænt: ekkert preview ef engar alternatives eru til ennþá.
5. Public `/vedrid`.
   Vænt: engin Road Intelligence controls.

Ekki prófa SQL89, Vercel env, feature_access rows eða production deploy
kæruleysislega. Það þarf sérstakt samþykki fyrir SQL keyrslu, production env,
push og deploy.

---

## Óvissa / þarf að staðfesta

- Codex staðfesti ekki raunveruleg open-data endpoints eða leyfi í þessum
  skammti. Það er M1 næsta skref.
- Codex keyrði ekki `npm run type-check` eða `npm run test:run` eftir docs-only
  breytinguna. Claude v249 hafði áður keyrt þau græn fyrir runtime skammtinn.
- `IcelandRoadmap.md` var þegar með ócommittaðar breytingar frá fyrri skömmtum.
  Codex bætti ofan á þær og reyndi ekki að aðskilja eða revert-a neitt.
