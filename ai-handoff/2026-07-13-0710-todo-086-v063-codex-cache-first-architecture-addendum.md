# TODO 086 v063 - Codex cache-first architecture addendum

Dagsetning: 2026-07-13 07:10
Agent: Codex
Tilefni: Addendum við v061/v062 áður en Stebbi sendir næsta handoff á Claude Code.

## Kjarnapunktur frá Stebba

Við eigum ekki að rembast við að nota Veðurstofugögnin beint úr API í hverju notendaflæði.

Við höfum áður rætt betri arkitektúr:

- sækja gögn frá Veðurstofunni á X mínútna fresti
- vista þau hjá okkur, líklega í Supabase eða núverandi `weather_cache` til að byrja með
- láta notandann lesa gögn frá okkur, ekki bíða eftir Veðurstofunni í hverju page/API request
- forðast endalaus óþörf köll í Veðurstofuna þegar margir notendur skoða sömu gögn
- sýna alltaf stöðu gagna: ný, gömul, vantar eða síðasta vel heppnaða uppfærsla

Þetta er bæði performance-mál og reliability-mál. Ef Veðurstofan er hæg eða niðri á notandinn samt að fá síðu sem hleðst hratt og segir skýrt að gögnin séu gömul eða vanti.

## Mat Codex

v062 finding um timeout er ekki bara tæknilegt timeout-vandamál. Það bendir á rangt runtime responsibility:

- User-facing route á ekki að þurfa að fylla 280-stöðva cache synchronously.
- Regular page load á ekki að kalla live í Veðurstofuna fyrir allar stöðvar.
- Cold cache eða expired cache má ekki þýða að notandinn bíði eftir tugum network-batches.

Rétta áttin er cache-first, en með skýrari mörkum:

1. Bakgrunnsferli eða scheduled job uppfærir gögnin.
2. User-facing API/UI les úr okkar eigin cache/DB.
3. UI sýnir aldur og stöðu gagnanna.
4. Ef cache er tómt, gamalt eða Veðurstofan niðri fær notandi samt svar, en með skýrri merkingu.

## Skammtímaleið fyrir næsta patch

Claude Code ætti ekki bara að minnka timeout eða parallelize-a live fetch betur. Það gæti lagað symptom en heldur áfram með ranga ábyrgð í request path.

Mælt næsta skref:

1. `/auth-mvp/vedrid/elta-vedrid` og tengt API skili station registry strax.
2. API/UI lesi aðeins þau Veðurstofugildi sem þegar eru í okkar cache/DB.
3. Ef gögn eru ekki til eða eru gömul skal merkja stöðina sem `missing`, `stale` eða sambærilegt.
4. Enginn venjulegur notandi á að triggera 280-stöðva live fetch.
5. Ef manual refresh endpoint er nauðsynlegt fyrir þróun skal hann vera admin/protected og ekki kallaður af venjulegu page load-i.

Þetta þýðir að Elta veðrið verður gagnlegt sem sannprófunarskjár strax:

- allar 280 stöðvar geta birst úr registry
- sumar stöðvar geta verið merktar "vantar gögn"
- cache-hit stöðvar geta sýnt ný/gömul gögn
- notandi sér hvað við vitum og hvað vantar, án þess að page load hangi á Veðurstofunni

## Gagnalíkan og cache-leið

Near-term, ef það dugar, má nýta núverandi `weather_cache` til að forðast nýja migration í þessum patch.

Ef/þegar við þurfum betra queryable dataset í Supabase ætti að plana sérstakt gagnalíkan, til dæmis:

- station registry / metadata
- latest observations per station
- latest forecasts per station
- fetch run/status tafla
- mapping/verification annotations síðar

Observation rows þurfa að geta geymt gildi sem eru sýnileg á t.d. umferðin.is:

- vindhraði
- vindátt
- hviður
- hiti
- veðurtexti / skyggni / úrkoma eftir því hvað API skilar
- `observedAt`, `fetchedAt`, `sourceUpdatedAt`, `expiresAt`
- `lastSuccessfulFetch`, `lastAttempt`, `staleReason`

Forecast rows mega vera sér frá observations. Það má ekki blanda saman spágögnum og nútímamælingum þannig að UI gefi ranga mynd.

## Registry vs lifandi gildi

Það er mikilvægt að halda þessu aðskildu:

- Station registry er tiltölulega stöðugt metadata: ID, nafn, hnit, hæð, eigandi, WMO, tegund, source URL o.s.frv.
- Veðurmælingar og spágildi eru breytileg runtime-gögn.

Registry má vera generated/check-in skrá til að byrja með, svo lengi sem við getum endurkeyrt og sannreynt hana. Lifandi gildi ættu hins vegar að koma úr okkar cache/DB í user-facing flow.

## Supabase og migration-varúð

Ekki skrifa eða keyra nýja Supabase migration í þessum næsta patch nema Stebbi gefi skýrt framkvæmdarleyfi.

`sql/73_feature_access_elta_vedrid.sql` er sér migration fyrir feature gate og á ekki að keyra nema með sérstöku Supabase leyfi frá Stebba.

Ef Claude Code telur dedicated weather tables nauðsynlegar skal fyrst skila plan/handoff með:

- töflum og dálkum
- RLS/grants áhrifum
- hvort notendur lesa gögn beint eða aðeins í gegnum server/API
- retention og stale policy
- rollback
- hvaða cron/scheduled mechanism á að nota

## Næsta svar sem Codex vill frá Claude Code

Claude Code ætti að staðfesta hvort núverandi v061 implementation kalli live Veðurstofan fetch í user-facing API path þegar cache er cold/expired.

Ef já, þá er næsti patch:

1. Fjarlægja eða slökkva á live Veðurstofan fetch úr venjulegu Elta veðrið request path-i.
2. Láta route skila registry + cached values only.
3. Bæta status/age/missing/stale upplýsingum í response.
4. Sýna þessar upplýsingar í UI.
5. Skila sérstöku plani fyrir background refresh/cache warmer, ekki innleiða það í blindni ef migration/cron/deployment þarf leyfi.

## Localhost checks for Stebbi

Eftir næsta implementation patch ætti Stebbi að prófa:

1. Opna `/auth-mvp/vedrid/elta-vedrid` með notanda sem hefur `elta-vedrid` feature access.
2. Staðfesta að síðan hleðst hratt þó Veðurstofan sé hæg, niðri eða cache sé tómt/gamalt.
3. Staðfesta að allar 280 registry-stöðvar birtist eða að UI segi skýrt ef registry-gögn vantar.
4. Opna stöðvarspjald og sjá öll metadata sem við vitum um stöðina.
5. Sjá hvort observation/forecast gögn eru ný, gömul eða vantar, með tíma/aldri gagnanna.
6. Staðfesta að venjuleg `/auth-mvp/vedrid` ferðaveðurvirkni hafi ekki breyst.

Ekki prófa með því að keyra Supabase migration, cron eða production refresh nema Stebbi hafi sérstaklega samþykkt það.

## Bottom line

Við eigum að byggja Elta veðrið þannig að það nýtist bæði núna til sannprófunar og síðar sem grunnur fyrir sameinað veðurflæði. Það þýðir cache-first/by-our-data architecture, ekki live Veðurstofan fetch á hverjum notanda.
