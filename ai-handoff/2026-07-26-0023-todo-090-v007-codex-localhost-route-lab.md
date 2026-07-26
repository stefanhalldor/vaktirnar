# TODO 090 — Almenn localhost leiðastofa

Created: 2026-07-26 00:23  
Timezone: Atlantic/Reykjavik  
Agent: Codex

## Samþykkt umfang

Stebbi gaf Codex skýrt leyfi til að taka stórt framtíðarskref svo hægt væri að prófa eigin Teskeiðarleiðir á localhost: helstu leiðir um Ísland, almenna staðaleit, fleiri leiðir, slitlag, lifandi Vegagerðargögn og fyrstu GPS-akstursprófun. Ekki var heimilað commit, push, deploy, migration, Supabase- eða production-breyting.

## Niðurstaða

`/preview/teskeid-routes` er nú lokuð leiðastofa sem er sjálfkrafa opin í development en 404 í production nema server-flaggið `TESKEID_ROUTE_LAB_ENABLED=true` sé sérstaklega sett.

Hún býður upp á:

- hvaða íslenskt frá/til par sem núverandi `PlaceSearch` leysir í hnit;
- sjálfvirka bestu leið úr Vegagerðar-grafinu;
- valfrjálst strict paved-only profile;
- „Leita að fleiri leiðum“ sem keyrir almenna bounded alternative-leit;
- vegalengd, afleiddan tíma og malbik/möl/blandað/óþekkt fyrir hverja leið;
- greinilega malarviðvörun;
- current/cache Vegagerðarstöðvar innan 5 km frá leið, með vindi og 10 mín. hviðum;
- einfalt responsive SVG-route sketch;
- browser `watchPosition` GPS-prófun sem færir bílmerki og sýnir vegalengd að næsta geometry-skrefi;
- yfirlit yfir 20 helstu regression-leiðir.

## Raunstaðfestar niðurstöður

Read-only live próf byggði graf úr 1.226 opinberum vegköflum. Öll 20 gullpör fundust innan skilgreindra fjarlægðarbila.

Reykjavík → Ísafjörður:

- primary: 455,0 km; 446,5 km paved og 8,5 km gravel;
- þrír aðrir candidates fundust;
- alternative 1: 414,3 km; 322,3 paved, 49,6 gravel, 42,5 mixed; 60,7% overlap;
- alternative 2: 482,2 km; 473,7 paved, 8,5 gravel; 91,7% overlap;
- alternative 3: 482,3 km; 453,9 paved, 23,0 gravel, 5,3 mixed; 92,1% overlap.

Þetta sannar að alternative-leitin er almenn graph-leit, ekki hardcode-uð Ísafjarðarlausn.

## Breyttar/nýjar skrár í þessum áfanga

- `lib/iceland-routes/goldenRoutes.ts`
- `lib/iceland-routes/roadGraphRuntime.server.ts`
- `lib/iceland-routes/roadGraph.ts`
- `lib/iceland-routes/index.ts`
- `lib/iceland-routes/README.md`
- `lib/__tests__/iceland-road-graph.test.ts`
- `lib/__tests__/vegagerdin-road-graph.live.test.ts`
- `app/api/teskeid/routes/lab/route.ts`
- `app/preview/teskeid-routes/page.tsx`
- `app/preview/teskeid-routes/loading.tsx`
- `components/weather/TeskeidRouteLab.tsx`
- `messages/is.json`
- `messages/en.json`
- `.env.example`
- `IcelandRoadmap.md`

Fyrri ócommittaðar TODO 090 skrár frá Codex/Claude eru einnig enn í sameiginlegu dirty worktree og voru ekki afturkallaðar.

## Architecture-ákvarðanir

- Fullt graf er sótt/built einu sinni per server process og endurnýtt í sex klukkustundir; concurrent cold starts deila sama pending promise og stale graph er notað ef refresh bregst.
- Alternative-leit lokar bounded úrtaki primary-segmenta, endurreiknar Dijkstra og deduplicates/raðar candidates eftir kostnaði og overlap. Þetta er ekki enn full Yen/Eppstein K-shortest guarantee.
- UI notar núverandi `PlaceSearch`, þannig að gullfylkið er aðeins regression-vörn en ekki takmörkun á stöðum.
- Current Vegagerðarmælingar eru aðeins context. Þær eru ekki spá eða öryggisdómur.
- Production er fail-closed. Enginn núverandi Google route response eða `/vedrid` consumer breyttist.

## Prófanir og skipanir

- `npm.cmd run type-check`: exit 0.
- targeted graph/source/provider tests: 22 passed, exit 0.
- opt-in read-only live Vegagerðarpróf: exit 0; 20/20 main pairs pass og Ísafjarðar-alternatives staðfestar.
- `npm.cmd run test:run`: exit 0; 143 files passed, 1 skipped; 3.665 passed, 28 skipped, 8 todo.
- `npm.cmd run build`: exit 0; production build og type validation kláruð.
- scoped `git diff --check`: exit 0; aðeins line-ending warnings.

Build sýnir fyrirliggjandi hook/img lint warnings í öðrum skrám. Engin stöðvar buildið og engin ný warning vísar í leiðastofuna.

## Route intelligence check

- Snertir allt landið, sérstaklega 20 main-corridor regression pör og fjölleiðir til Ísafjarðar.
- Domain-lógík er provider-neutral í `lib/iceland-routes/`; Vegagerðin er afmörkuð source/current-observation adapter.
- Engin raw heimilisföng, GPS-ferilssaga eða route history er vistuð. GPS er aðeins client state meðan skjárinn er opinn.
- Google er óbreytt primary provider annars staðar.
- `IcelandRoadmap.md` er uppfært með v0.7 stöðu og blockers.

## Mikilvægir blockers / ekki ofselja stöðuna

- „Lifandi staða Vegagerðarinnar“ í þessum áfanga er vindur/hviður/veghiti frá stöðvum. Hún inniheldur ekki enn lokanir, færð eða akstursskilyrði á hverjum vegkafla.
- GPS sýnir bíl og geometry-progress. Það gefur ekki enn sannreynd götunöfn, vinstri/hægri beygjur, lane guidance eða turn restrictions.
- Engin off-route detection/recalculation er komin.
- Route-sketch er ekki sama fulla MapLibre-kort og aksturskortið.
- Allur ETA-hraði er afleiddur; ekki official speed limits.
- Graph endpoint snap er enn stundum >1 km og þarf nearest-edge projection.
- Ferries/islands, seasonals, closures, vehicle weight/height og F-road current state eru ekki production-ready.
- Alternative search getur skilað engri annarri leið ef grafið hefur ekki aðra sufficiently distinct tengingu.
- Route-lab API þarf sérstaka rate-limit/abuse review áður en production flag er virkjað.

## Næstu framkvæmdaskref

1. Tengja fulla MapLibre route componentinn í stað SVG án þess að tvítaka kortalógík.
2. Bæta edge projection, off-route detection og rerouting.
3. Ingest-a current road condition/closure source Vegagerðarinnar og tengja við segment IDs.
4. Finna official speed-limit layer og skipta út derived ETA þar sem facts eru tiltæk.
5. Búa til turn graph/intersection maneuvers og sannreyna beygjubönn áður en talað er um turn-by-turn navigation.
6. Útbúa versioned graph artifact með source timestamp/hash/last-known-good í stað process-only fetch.
7. Fuzz/property tests, API route tests og mobile browser/GPS field test.
8. Aðeins eftir það: shadow-compare við Google á breiðu route matrix og ákveða product rollout.

## Localhost checks for Stebbi

Slóð: `http://localhost:3004/preview/teskeid-routes` (eða sama path á portinu sem Stebbi keyrir).

Forsendur:

- localhost dev-server Stebba er í gangi;
- núverandi weather/place-search env stillingar virka;
- internet þarf fyrir fyrsta Vegagerðar graph fetch og staðaleit;
- Vegagerðar current cache getur verið unavailable án þess að route calculation falli.

Prófun:

1. Opna route-lab. Canonical Teskeið-loader á að sjást meðan vegagraf er byggt.
2. Staðfesta að 20/20 regression cards séu merkt „Stenst“.
3. Leita Reykjavík → Ísafjörður og reikna. Leið á að birtast með 455 km í kringum núverandi dataset og malarviðvörun.
4. Smella „Leita að fleiri leiðum“. Fleiri route cards eiga að birtast með mismunandi km/slitlagi; ekki sömu geometry afrit.
5. Kveikja á „Eingöngu … bundnu slitlagi“. Ef engin fullkomlega staðfest paved leið finnst á kerfið að segja skýrt frá því, ekki telja mixed/unknown sem paved.
6. Prófa Reykjavík → Akureyri, Reykjavík → Höfn og Egilsstaðir → Seyðisfjörður.
7. Prófa nákvæmt heimilisfang og minni stað. Ef staðaleit finnur hnit en ekkert graph-node er innan 25 km á að koma vinaleg villa, ekki crash.
8. Athuga Vegagerðarstöðvar: vindur/hviður mega birtast, en engin fullyrðing um að leið sé örugg.
9. Í síma: velja route, veita location permission og ýta „Hefja GPS-akstur“. Appelsínugult bílmerki á að færast. Ekki nota þessa frumgerð sem eina leiðsögn í raunakstri.
10. Athuga 360/390/460 px: enginn horizontal overflow, input texti minnst 16 px, controls minnst 40 px og loader/navigation feedback sýnilegt.

Ekki setja `TESKEID_ROUTE_LAB_ENABLED=true` í production eða Vercel án sérstakrar öryggis-/kostnaðar-/rate-limit rýni og skýrs leyfis Stebba.

## Það sem var ekki gert

Enginn dev server var ræstur/endurræstur. Engin migration, SQL, Supabase, auth, production env, commit, push eða deployment var gert.

## Óvissa / þarf að staðfesta

Confidence er high fyrir graph calculation, gullfylki, alternative proof og build/test niðurstöður. Confidence er medium fyrir route-lab field UX þar sem Codex stjórnaði ekki browser/dev server. Confidence er low fyrir raunverulega turn-by-turn safety; sú virkni er viljandi merkt frumgerð og þarf gögn og field validation sem eru ekki til enn.
